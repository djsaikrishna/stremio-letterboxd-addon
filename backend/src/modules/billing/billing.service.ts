import { upsertSubscription } from '../../db/repositories/subscription.repository.js';
import { createChildLogger } from '../../lib/logger.js';

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

  upsertSubscription({
    userId,
    providerSubscriptionId: payload.data.id,
    variantId: String(attributes.variant_id),
    status: attributes.status,
    currentPeriodEnd,
  });
}
