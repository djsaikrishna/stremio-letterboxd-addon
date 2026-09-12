import { upsertSubscription, findSubscriptionByUserId } from '../../db/repositories/subscription.repository.js';
import { createChildLogger } from '../../lib/logger.js';
import { refreshAccessToken, getCurrentUser } from '../letterboxd/letterboxd.client.js';
import { getDecryptedRefreshToken, type User } from '../../db/repositories/user.repository.js';
import { createCheckout, getSubscriptionPortalUrl } from '../../lib/lemonsqueezy.js';
import { requireBillingConfig, isPolarConfigured } from '../../config/index.js';
import { getCustomerState } from '../../lib/polar.js';
import { isSupporter } from '../../lib/entitlement.js';
import { createCache } from '../../lib/cache.js';

const logger = createChildLogger('billing-service');

export interface LemonSqueezyWebhookPayload {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string;
    attributes: {
      status: string;
      variant_id: number;
      renews_at: string | null;
      ends_at: string | null;
      updated_at?: string | null;
    };
  };
}

export const HANDLED_WEBHOOK_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_expired',
  'subscription_resumed',
]);

export function handleWebhookEvent(payload: LemonSqueezyWebhookPayload): void {
  const userId = payload.meta.custom_data?.user_id;
  if (!userId) {
    logger.warn({ eventName: payload.meta.event_name }, 'Webhook missing custom_data.user_id, skipping');
    return;
  }

  const { attributes } = payload.data;
  // ends_at is set once a subscription has a known end (cancelled/expired);
  // renews_at is the next renewal date while it is still active.
  const currentPeriodEnd = attributes.ends_at ?? attributes.renews_at;
  if (!currentPeriodEnd) {
    logger.warn({ userId, eventName: payload.meta.event_name }, 'Webhook missing both ends_at and renews_at, skipping');
    return;
  }

  try {
    upsertSubscription({
      userId,
      providerSubscriptionId: payload.data.id,
      variantId: String(attributes.variant_id),
      status: attributes.status,
      currentPeriodEnd,
      providerUpdatedAt: attributes.updated_at ?? null,
    });
  } catch (err) {
    // A broken foreign-key reference (deleted/stale user) or a unique-constraint
    // collision on provider_subscription_id is not something a retry will fix —
    // log it and swallow it so the caller can still ack the webhook with 200,
    // rather than letting Lemon Squeezy retry a permanently-broken event forever.
    logger.error(
      { err, userId, eventName: payload.meta.event_name, providerSubscriptionId: payload.data.id },
      'Failed to persist subscription from webhook event'
    );
  }
}

// ─── Checkout ──────────────────────────────────────────────────────────────

/**
 * Best-effort email lookup for checkout prefill. Never throws: any failure
 * (revoked token, network error, missing email on the profile, etc.) just
 * means checkout proceeds without a prefilled email.
 */
async function fetchEmailBestEffort(user: User): Promise<string | undefined> {
  try {
    const refreshToken = getDecryptedRefreshToken(user);
    const tokens = await refreshAccessToken(refreshToken);
    const profile = await getCurrentUser(tokens.access_token);
    return profile.emailAddress;
  } catch (err) {
    logger.warn({ err, userId: user.id }, 'Could not fetch email for checkout prefill, continuing without it');
    return undefined;
  }
}

export async function buildCheckoutUrl(user: User, variant: 'monthly' | 'yearly'): Promise<string> {
  const billing = requireBillingConfig();
  const variantId = variant === 'yearly' ? billing.variantIdYearly : billing.variantIdMonthly;
  const email = await fetchEmailBestEffort(user);
  return createCheckout({ variantId, userId: user.id, email });
}

// ─── Portal ────────────────────────────────────────────────────────────────

export async function getPortalUrlForUser(userId: string): Promise<string | null> {
  const subscription = findSubscriptionByUserId(userId);
  if (!subscription) return null;
  return getSubscriptionPortalUrl(subscription.provider_subscription_id);
}

// ─── Entitlement ───────────────────────────────────────────────────────────

const ENTITLEMENT_TTL_MS = 10 * 60 * 1000;
const MIN_POLAR_CALL_INTERVAL_MS = 5 * 1000;

interface EntitlementEntry {
  entitled: boolean;
  /** Last successful Polar answer (0 if never). */
  fetchedAt: number;
  /** Last Polar call, successful or not — throttles polling and outages. */
  attemptedAt: number;
}

// ttl: 0 disables lru-cache expiry: freshness is checked by hand so the last
// known value is still available as a fallback when Polar is down.
const entitlementCache = createCache<EntitlementEntry>({ maxSize: 5000, ttl: 0 });

export function clearEntitlementCache(): void {
  entitlementCache.clear();
}

export async function getEntitlement(userId: string, options: { fresh?: boolean } = {}): Promise<boolean> {
  if (!isPolarConfigured) return false;

  const now = Date.now();
  const entry = entitlementCache.get(userId);
  if (entry) {
    const recentlyAttempted = now - entry.attemptedAt < MIN_POLAR_CALL_INTERVAL_MS;
    const upToDate = now - entry.fetchedAt < ENTITLEMENT_TTL_MS;
    if (recentlyAttempted || (upToDate && !options.fresh)) {
      return entry.entitled;
    }
  }

  try {
    const entitled = isSupporter(await getCustomerState(userId));
    entitlementCache.set(userId, { entitled, fetchedAt: now, attemptedAt: now });
    return entitled;
  } catch (err) {
    const entitled = entry?.entitled ?? false;
    logger.warn(
      { userId, reason: err instanceof Error ? err.message : 'unknown' },
      'Polar customer state lookup failed, using last known entitlement'
    );
    entitlementCache.set(userId, { entitled, fetchedAt: entry?.fetchedAt ?? 0, attemptedAt: now });
    return entitled;
  }
}
