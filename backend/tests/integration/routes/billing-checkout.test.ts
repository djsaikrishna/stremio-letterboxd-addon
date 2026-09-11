import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';
import { signUserToken } from '../../../src/lib/jwt.js';

describe('POST /billing/checkout', () => {
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

  it('returns 401 without a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/billing/checkout', payload: { variant: 'yearly' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for an invalid variant', async () => {
    const user = createUser({ letterboxdId: 'checkout-1', letterboxdUsername: 'checkoutuser1', refreshToken: 'x' });
    const token = await signUserToken({ userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username });

    const res = await app.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: { authorization: `Bearer ${token}` },
      payload: { variant: 'lifetime' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns a checkout URL for a valid request authenticated via bearer token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { attributes: { url: 'https://stremboxd.lemonsqueezy.com/checkout/inject-test' } } }),
      })
    );

    const user = createUser({ letterboxdId: 'checkout-2', letterboxdUsername: 'checkoutuser2', refreshToken: 'x' });
    const token = await signUserToken({ userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username });

    const res = await app.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: { authorization: `Bearer ${token}` },
      payload: { variant: 'yearly' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().checkoutUrl).toBe('https://stremboxd.lemonsqueezy.com/checkout/inject-test');

    vi.unstubAllGlobals();
  });
});
