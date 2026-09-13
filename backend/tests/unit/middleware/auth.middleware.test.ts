import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { authMiddleware, sessionMiddleware } from '../../../src/middleware/auth.middleware.js';
import { signUserToken } from '../../../src/lib/jwt.js';
import { corsOrigins } from '../../../src/config/index.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import {
  createUser,
  revokeUserSessions,
  type User,
} from '../../../src/db/repositories/user.repository.js';

describe('auth middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();

    // Register a test route protected by the middleware
    app.get('/protected', { preHandler: authMiddleware }, async (request) => {
      return { payload: request.userPayload };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Missing authorization header');
  });

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic abc123' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Missing authorization header');
  });

  it('returns 401 for invalid JWT token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Invalid or expired token');
  });

  it('returns 401 for empty Bearer value', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer ' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Invalid or expired token');
  });

  it('sets userPayload on valid token', async () => {
    const token = await signUserToken({
      userId: 'user-42',
      letterboxdId: 'lbxd-42',
      username: 'testuser',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.payload.sub).toBe('user-42');
    expect(body.payload.letterboxdId).toBe('lbxd-42');
    expect(body.payload.username).toBe('testuser');
  });
});

describe('session middleware', () => {
  let app: FastifyInstance;
  let user: User;

  const signFor = (target: User) =>
    signUserToken({
      userId: target.id,
      letterboxdId: target.letterboxd_id,
      username: target.letterboxd_username,
    });

  beforeAll(async () => {
    initDb();
    user = createUser({
      letterboxdId: 'session-mw-user',
      letterboxdUsername: 'cookieuser',
      refreshToken: 'fake-refresh-token',
    });

    app = Fastify();
    await app.register(cookie);

    app.get('/session', { preHandler: sessionMiddleware }, async (request) => {
      return { payload: request.userPayload };
    });
    app.post('/session', { preHandler: sessionMiddleware }, async () => {
      return { success: true };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it('returns 401 when no session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/session' });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('NO_SESSION');
  });

  it('returns 401 and clears the cookie for an invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/session',
      cookies: { sb_session: 'invalid.jwt.token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name === 'sb_session')?.value).toBe('');
  });

  it('returns 401 when the token points at a deleted user', async () => {
    const token = await signUserToken({
      userId: 'nonexistent-user-id-1234567890ab',
      letterboxdId: 'lbxd-ghost',
      username: 'ghost',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/session',
      cookies: { sb_session: token },
    });

    expect(res.statusCode).toBe(401);
  });

  it('sets userPayload on a valid session cookie', async () => {
    const token = await signFor(user);

    const res = await app.inject({
      method: 'GET',
      url: '/session',
      cookies: { sb_session: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().payload.sub).toBe(user.id);
  });

  it('rejects a mutating request from a foreign origin', async () => {
    const token = await signFor(user);

    const res = await app.inject({
      method: 'POST',
      url: '/session',
      cookies: { sb_session: token },
      headers: { origin: 'https://evil.example' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('accepts a mutating request from an allowed origin', async () => {
    const token = await signFor(user);

    const res = await app.inject({
      method: 'POST',
      url: '/session',
      cookies: { sb_session: token },
      headers: { origin: corsOrigins[0]! },
    });

    expect(res.statusCode).toBe(200);
  });

  it('rejects a token issued before the revocation cut-off', async () => {
    const revoked = createUser({
      letterboxdId: 'revoke-mw-user',
      letterboxdUsername: 'revokeuser',
      refreshToken: 'fake-refresh-token',
    });
    const token = await signFor(revoked);

    // Tokens carry a second-resolution iat, so move the cut-off past it.
    vi.setSystemTime(Date.now() + 2000);
    revokeUserSessions(revoked.id);
    vi.useRealTimers();

    const res = await app.inject({
      method: 'GET',
      url: '/session',
      cookies: { sb_session: token },
    });

    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name === 'sb_session')?.value).toBe('');
  });
});
