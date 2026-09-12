import type { CustomerState } from './polar.js';

// See docs/adr/0001-entitlement-computation.md for why past_due counts as
// entitled and why cancelled keeps access until the paid period actually ends.
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired' | 'unpaid' | 'paused';

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  currentPeriodEnd: string; // ISO 8601
}

export const ENTITLED_SESSION_TTL_SECONDS = 400 * 24 * 60 * 60;

export function isEntitled(subscription: SubscriptionSnapshot | null, now: Date = new Date()): boolean {
  if (!subscription) return false;

  if (subscription.status === 'active' || subscription.status === 'past_due') {
    return true;
  }

  if (subscription.status === 'cancelled') {
    return now.getTime() < new Date(subscription.currentPeriodEnd).getTime();
  }

  return false;
}

// Polar keeps a subscription scheduled for cancellation `active` until the paid
// period ends, and removes it from active_subscriptions once it is over — so
// the grace period lives in Polar, not here.
const SUPPORTER_STATUSES = new Set(['active', 'trialing']);

export function isSupporter(state: CustomerState | null): boolean {
  return state?.active_subscriptions.some((s) => SUPPORTER_STATUSES.has(s.status)) ?? false;
}
