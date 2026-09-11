import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';
import { upsertSubscription } from '../../../src/db/repositories/subscription.repository.js';
import { signUserToken } from '../../../src/lib/jwt.js';

describe('GET /billing/portal', () => {
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

  it('returns 404 when the user has no subscription record', async () => {
    const user = createUser({ letterboxdId: 'portal-1', letterboxdUsername: 'portaluser1', refreshToken: 'x' });
    const token = await signUserToken({ userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username });

    const res = await app.inject({ method: 'GET', url: '/billing/portal', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(404);
  });

  it('redirects to the Lemon Squeezy customer portal URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { attributes: { urls: { customer_portal: 'https://stremboxd.lemonsqueezy.com/billing' } } },
        }),
      })
    );

    const user = createUser({ letterboxdId: 'portal-2', letterboxdUsername: 'portaluser2', refreshToken: 'x' });
    upsertSubscription({
      userId: user.id,
      providerSubscriptionId: 'ls-sub-portal',
      variantId: '200',
      status: 'active',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });
    const token = await signUserToken({ userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username });

    const res = await app.inject({
      method: 'GET',
      url: '/billing/portal',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://stremboxd.lemonsqueezy.com/billing');

    vi.unstubAllGlobals();
  });
});
