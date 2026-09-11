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
