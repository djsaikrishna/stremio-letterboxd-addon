import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import {
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
} from '../../../src/lib/session-cookie.js';
import { parseTtl } from '../../../src/lib/jwt.js';
import { config, jwtConfig } from '../../../src/config/index.js';

describe('session cookie', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(cookie);

    app.get('/set', async (_request, reply) => {
      setSessionCookie(reply, 'a-token');
      return { ok: true };
    });
    app.get('/clear', async (_request, reply) => {
      clearSessionCookie(reply);
      return { ok: true };
    });
    app.get('/read', async (request) => {
      return { token: readSessionToken(request) };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets an httpOnly, lax, path-scoped cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/set' });
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);

    expect(set?.value).toBe('a-token');
    expect(set?.httpOnly).toBe(true);
    expect(set?.sameSite).toBe('Lax');
    expect(set?.path).toBe('/');
  });

  it('omits Domain so the cookie stays host-only', async () => {
    const res = await app.inject({ method: 'GET', url: '/set' });
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);

    expect(set?.domain).toBeUndefined();
  });

  it('derives maxAge from the configured token TTL', async () => {
    const res = await app.inject({ method: 'GET', url: '/set' });
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);

    expect(set?.maxAge).toBe(parseTtl(jwtConfig.ttl));
  });

  it('marks the cookie Secure only when the public URL is https', async () => {
    const res = await app.inject({ method: 'GET', url: '/set' });
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);

    expect(set?.secure ?? false).toBe(config.PUBLIC_URL.startsWith('https://'));
  });

  it('clears the cookie with an empty value', async () => {
    const res = await app.inject({ method: 'GET', url: '/clear' });
    const cleared = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME);

    expect(cleared?.value).toBe('');
    expect(cleared?.httpOnly).toBe(true);
  });

  it('reads back the token from the request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/read',
      cookies: { [SESSION_COOKIE_NAME]: 'round-trip' },
    });

    expect(res.json().token).toBe('round-trip');
  });

  it('returns null when the cookie is absent', async () => {
    const res = await app.inject({ method: 'GET', url: '/read' });

    expect(res.json().token).toBeNull();
  });
});
