import { getDb } from '../index.js';

export interface Subscription {
  user_id: string;
  provider_subscription_id: string;
  variant_id: string;
  status: string;
  current_period_end: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertSubscriptionInput {
  userId: string;
  providerSubscriptionId: string;
  variantId: string;
  status: string;
  currentPeriodEnd: string;
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

  if (existing) {
    return db
      .prepare(
        `UPDATE subscriptions
         SET provider_subscription_id = ?, variant_id = ?, status = ?, current_period_end = ?,
             updated_at = datetime('now')
         WHERE user_id = ?
         RETURNING *`
      )
      .get(
        input.providerSubscriptionId,
        input.variantId,
        input.status,
        input.currentPeriodEnd,
        input.userId
      ) as Subscription;
  }

  return db
    .prepare(
      `INSERT INTO subscriptions (user_id, provider_subscription_id, variant_id, status, current_period_end)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(
      input.userId,
      input.providerSubscriptionId,
      input.variantId,
      input.status,
      input.currentPeriodEnd
    ) as Subscription;
}
