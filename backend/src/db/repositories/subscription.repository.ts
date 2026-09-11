import { getDb } from '../index.js';

export interface Subscription {
  user_id: string;
  provider_subscription_id: string;
  variant_id: string;
  status: string;
  current_period_end: string;
  provider_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertSubscriptionInput {
  userId: string;
  providerSubscriptionId: string;
  variantId: string;
  status: string;
  currentPeriodEnd: string;
  /**
   * The provider's own event timestamp (e.g. Lemon Squeezy's
   * `attributes.updated_at`), used to discard out-of-order/replayed webhook
   * deliveries. Optional for callers that cannot supply one — in that case
   * the freshness check is skipped and the write always applies.
   */
  providerUpdatedAt?: string | null;
}

export function findSubscriptionByUserId(userId: string): Subscription | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as Subscription) ?? null;
}

export function findSubscriptionByProviderId(providerSubscriptionId: string): Subscription | null {
  const db = getDb();
  return (
    (db.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').get(
      providerSubscriptionId
    ) as Subscription) ?? null
  );
}

export function upsertSubscription(input: UpsertSubscriptionInput): Subscription {
  const db = getDb();
  const existing = findSubscriptionByUserId(input.userId);
  const providerUpdatedAt = input.providerUpdatedAt ?? null;

  if (existing) {
    // Guard against out-of-order/replayed webhook deliveries: only apply the
    // write if the incoming event is strictly newer than what we already
    // stored. A missing stored timestamp (rows written before this column
    // existed, or a caller that never supplied one) always accepts the
    // write, since there is nothing to compare against.
    if (
      existing.provider_updated_at &&
      providerUpdatedAt &&
      new Date(providerUpdatedAt).getTime() <= new Date(existing.provider_updated_at).getTime()
    ) {
      return existing;
    }

    return db
      .prepare(
        `UPDATE subscriptions
         SET provider_subscription_id = ?, variant_id = ?, status = ?, current_period_end = ?,
             provider_updated_at = ?, updated_at = datetime('now')
         WHERE user_id = ?
         RETURNING *`
      )
      .get(
        input.providerSubscriptionId,
        input.variantId,
        input.status,
        input.currentPeriodEnd,
        providerUpdatedAt,
        input.userId
      ) as Subscription;
  }

  return db
    .prepare(
      `INSERT INTO subscriptions (user_id, provider_subscription_id, variant_id, status, current_period_end, provider_updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(
      input.userId,
      input.providerSubscriptionId,
      input.variantId,
      input.status,
      input.currentPeriodEnd,
      providerUpdatedAt
    ) as Subscription;
}
