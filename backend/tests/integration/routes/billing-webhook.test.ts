import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';
import { findSubscriptionByUserId } from '../../../src/db/repositories/subscription.repository.js';
import { billingConfig } from '../../../src/config/index.js';

function signedPayload(body: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', billingConfig.webhookSecret).update(raw).digest('hex');
  return { raw, signature };
}

describe('POST /billing/webhook', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initDb();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it('rejects a request with no signature header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      payload: { meta: { event_name: 'subscription_created' } },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a request with a wrong signature', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'x-signature': 'deadbeef' },
      payload: { meta: { event_name: 'subscription_created' } },
    });

    expect(res.statusCode).toBe(401);
  });

  it('upserts the subscription on subscription_created', async () => {
    const user = createUser({
      letterboxdId: 'billing-webhook-user-1',
      letterboxdUsername: 'billinguser1',
      refreshToken: 'fake-refresh-token',
    });

    const { raw, signature } = signedPayload({
      meta: { event_name: 'subscription_created', custom_data: { user_id: user.id } },
      data: {
        id: 'ls-sub-1',
        attributes: { status: 'active', variant_id: 100, renews_at: '2027-01-01T00:00:00.000000Z', ends_at: null },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': signature },
      payload: raw,
    });

    expect(res.statusCode).toBe(200);

    const sub = findSubscriptionByUserId(user.id);
    expect(sub?.provider_subscription_id).toBe('ls-sub-1');
    expect(sub?.status).toBe('active');
    expect(sub?.current_period_end).toBe('2027-01-01T00:00:00.000000Z');
  });

  it('updates the existing row on subscription_cancelled, using ends_at', async () => {
    const user = createUser({
      letterboxdId: 'billing-webhook-user-2',
      letterboxdUsername: 'billinguser2',
      refreshToken: 'fake-refresh-token',
    });

    const created = signedPayload({
      meta: { event_name: 'subscription_created', custom_data: { user_id: user.id } },
      data: {
        id: 'ls-sub-2',
        attributes: { status: 'active', variant_id: 200, renews_at: '2027-01-01T00:00:00.000000Z', ends_at: null },
      },
    });
    await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': created.signature },
      payload: created.raw,
    });

    const cancelled = signedPayload({
      meta: { event_name: 'subscription_cancelled', custom_data: { user_id: user.id } },
      data: {
        id: 'ls-sub-2',
        attributes: { status: 'cancelled', variant_id: 200, renews_at: null, ends_at: '2026-12-01T00:00:00.000000Z' },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': cancelled.signature },
      payload: cancelled.raw,
    });

    expect(res.statusCode).toBe(200);
    const sub = findSubscriptionByUserId(user.id);
    expect(sub?.status).toBe('cancelled');
    expect(sub?.current_period_end).toBe('2026-12-01T00:00:00.000000Z');
  });

  it('ignores an unhandled event without erroring', async () => {
    const { raw, signature } = signedPayload({
      meta: { event_name: 'subscription_payment_success', custom_data: { user_id: 'whoever' } },
      data: { id: 'ls-sub-3', attributes: { status: 'active', variant_id: 100, renews_at: null, ends_at: null } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'x-signature': signature },
      payload: raw,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ignored: true });
  });
});
