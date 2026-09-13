import { createChildLogger } from '../../lib/logger.js';
import { refreshAccessToken, getCurrentUser } from '../letterboxd/letterboxd.client.js';
import { getDecryptedRefreshToken, updateUser, type User } from '../../db/repositories/user.repository.js';
import { isPolarConfigured } from '../../config/index.js';
import { createCheckout, createPortalUrl, getCustomerState } from '../../lib/polar.js';
import { isSupporter } from '../../lib/entitlement.js';
import { createCache } from '../../lib/cache.js';

const logger = createChildLogger('billing-service');

/**
 * Best-effort email lookup for checkout prefill. Never throws: any failure
 * (revoked token, network error, missing email on the profile, etc.) just
 * means checkout proceeds without a prefilled email.
 */
async function fetchEmailBestEffort(user: User): Promise<string | undefined> {
  try {
    const refreshToken = getDecryptedRefreshToken(user);
    const tokens = await refreshAccessToken(refreshToken);
    if (tokens.refresh_token !== refreshToken) {
      updateUser(user.id, {
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      });
    }
    const profile = await getCurrentUser(tokens.access_token);
    return profile.emailAddress;
  } catch (err) {
    logger.warn({ err, userId: user.id }, 'Could not fetch email for checkout prefill, continuing without it');
    return undefined;
  }
}

// ─── Checkout ──────────────────────────────────────────────────────────────

export async function startCheckout(user: User): Promise<string> {
  const email = await fetchEmailBestEffort(user);
  return createCheckout({ userId: user.id, email });
}

// ─── Portal ────────────────────────────────────────────────────────────────

export function getPortalUrl(userId: string): Promise<string | null> {
  return createPortalUrl(userId);
}

// ─── Entitlement ───────────────────────────────────────────────────────────

const ENTITLEMENT_TTL_MS = 10 * 60 * 1000;
const MIN_POLAR_CALL_INTERVAL_MS = 5 * 1000;

interface EntitlementEntry {
  entitled: boolean;
  /**
   * True when `entitled` reflects a genuine, current Polar answer (a fresh
   * call, or a value still within ENTITLEMENT_TTL_MS of one); false when it
   * is a degraded fallback — Polar failed and we fell back to a stale or
   * absent cached value. Carried forward as-is when a cache hit skips
   * calling Polar again.
   */
  trustworthy: boolean;
  /** Last successful Polar answer (0 if never). */
  fetchedAt: number;
  /** Last Polar call, successful or not — throttles polling and outages. */
  attemptedAt: number;
}

export interface EntitlementStatus {
  entitled: boolean;
  /**
   * False means this answer is NOT a real "no" from Polar — it's what we
   * fell back to after a failed/unreachable lookup. Callers that would take
   * a destructive action on a negative answer (e.g. revoking a session)
   * must check this before doing so; callers that only gate a feature can
   * ignore it, since fail-closed is the correct default there.
   */
  trustworthy: boolean;
}

// ttl: 0 disables lru-cache expiry: freshness is checked by hand so the last
// known value is still available as a fallback when Polar is down.
const entitlementCache = createCache<EntitlementEntry>({ maxSize: 5000, ttl: 0 });

export function clearEntitlementCache(): void {
  entitlementCache.clear();
}

/**
 * Full entitlement answer, including whether it's a trustworthy Polar
 * response or a degraded fallback. Use this wherever a negative answer
 * triggers a destructive action (e.g. clearing a session cookie) — see
 * getEntitlement() below for the simple boolean case.
 */
export async function getEntitlementStatus(
  userId: string,
  options: { fresh?: boolean } = {}
): Promise<EntitlementStatus> {
  if (!isPolarConfigured) return { entitled: false, trustworthy: true };

  const now = Date.now();
  const entry = entitlementCache.get(userId);
  if (entry) {
    const recentlyAttempted = now - entry.attemptedAt < MIN_POLAR_CALL_INTERVAL_MS;
    const upToDate = now - entry.fetchedAt < ENTITLEMENT_TTL_MS;
    if (recentlyAttempted || (upToDate && !options.fresh)) {
      return { entitled: entry.entitled, trustworthy: entry.trustworthy };
    }
  }

  try {
    const entitled = isSupporter(await getCustomerState(userId));
    entitlementCache.set(userId, { entitled, trustworthy: true, fetchedAt: now, attemptedAt: now });
    return { entitled, trustworthy: true };
  } catch (err) {
    const entitled = entry?.entitled ?? false;
    logger.warn(
      { userId, reason: err instanceof Error ? err.message : 'unknown' },
      'Polar customer state lookup failed, using last known entitlement'
    );
    entitlementCache.set(userId, {
      entitled,
      trustworthy: false,
      fetchedAt: entry?.fetchedAt ?? 0,
      attemptedAt: now,
    });
    return { entitled, trustworthy: false };
  }
}

/**
 * Simple boolean entitlement check for callers that only gate a feature and
 * don't take a destructive action on a negative answer (fail-closed is the
 * correct, spec-sanctioned behavior there — e.g. login just skips issuing a
 * persistent cookie). See getEntitlementStatus() for callers that need to
 * tell a real "no" apart from "we don't know".
 */
export async function getEntitlement(userId: string, options: { fresh?: boolean } = {}): Promise<boolean> {
  return (await getEntitlementStatus(userId, options)).entitled;
}
