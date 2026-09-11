import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { sessionMiddleware } from '../../../src/middleware/auth.middleware.js';
import { signUserToken } from '../../../src/lib/jwt.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';
import { SESSION_COOKIE_NAME } from '../../../src/lib/session-cookie.js';

describe('sessionMiddleware (cookie or bearer)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initDb();
    app = Fastify();
    await app.register(cookie);
    app.get('/protected', { preHandler: sessionMiddleware }, async (request) => ({
      userId: request.sessionUser!.id,
    }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it('authenticates via the session cookie', async () => {
    const user = createUser({ letterboxdId: 'hybrid-1', letterboxdUsername: 'hybrid1', refreshToken: 'x' });
    const token = await signUserToken({ userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username });

    const res = await app.inject({ method: 'GET', url: '/protected', cookies: { [SESSION_COOKIE_NAME]: token } });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(user.id);
  });

  it('authenticates via an Authorization: Bearer header when there is no cookie', async () => {
    const user = createUser({ letterboxdId: 'hybrid-2', letterboxdUsername: 'hybrid2', refreshToken: 'x' });
    const token = await signUserToken({ userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username });

    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(user.id);
  });

  it('returns 401 when neither a cookie nor a bearer header is present', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
  });
});
