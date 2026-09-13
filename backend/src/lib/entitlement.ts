import { jwtConfig } from '../config/index.js';
import { parseTtl } from './jwt.js';
import type { CustomerState } from './polar.js';

export const ENTITLED_SESSION_TTL_SECONDS = parseTtl(jwtConfig.entitledTtl);

// Polar keeps a subscription scheduled for cancellation `active` until the paid
// period ends, and removes it from active_subscriptions once it is over — so
// the grace period lives in Polar, not here.
const SUPPORTER_STATUSES = new Set(['active', 'trialing']);

export function isSupporter(state: CustomerState | null): boolean {
  return state?.active_subscriptions.some((s) => SUPPORTER_STATUSES.has(s.status)) ?? false;
}
