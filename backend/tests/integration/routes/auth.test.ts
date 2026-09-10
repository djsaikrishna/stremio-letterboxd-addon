import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { signUserToken } from '../../../src/lib/jwt.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';
import type { FastifyInstance } from 'fastify';

const VALID_PREFERENCES = {
  catalogs: {
    watchlist: true,
    diary: true,
    friends: true,
    popular: true,
    top250: true,
    likedFilms: false,
    recommended: true,
  },
  ownLists: [],
  externalLists: [],
};

describe('auth routes', () => {
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

  describe('POST /auth/preferences', () => {
    it('returns 401 without a session cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/preferences',
        payload: { preferences: VALID_PREFERENCES },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with an invalid session cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/preferences',
        cookies: { sb_session: 'invalid-token' },
        payload: { preferences: VALID_PREFERENCES },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for valid session but nonexistent user', async () => {
      const token = await signUserToken({
        userId: 'nonexistent-user-id-1234567890ab',
        letterboxdId: 'lbxd-ghost',
        username: 'ghost',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/preferences',
        cookies: { sb_session: token },
        payload: { preferences: VALID_PREFERENCES },
      });

      expect(res.statusCode).toBe(401);
    });

    it('updates preferences for authenticated user', async () => {
      const user = createUser({
        letterboxdId: 'prefs-test-user',
        letterboxdUsername: 'prefsuser',
        refreshToken: 'fake-refresh-token',
      });

      const token = await signUserToken({
        userId: user.id,
        letterboxdId: user.letterboxd_id,
        username: user.letterboxd_username,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/preferences',
        cookies: { sb_session: token },
        payload: {
          preferences: {
            catalogs: {
              watchlist: true,
              diary: false,
              friends: false,
              popular: true,
              top250: true,
              likedFilms: false,
              recommended: false,
            },
            ownLists: ['list1'],
            externalLists: [],
            showRatings: false,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
    });

    it('returns 400 for invalid preferences schema', async () => {
      const user = createUser({
        letterboxdId: 'prefs-schema-user',
        letterboxdUsername: 'schemauser',
        refreshToken: 'fake-refresh-token',
      });

      const token = await signUserToken({
        userId: user.id,
        letterboxdId: user.letterboxd_id,
        username: user.letterboxd_username,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/preferences',
        cookies: { sb_session: token },
        payload: { preferences: { invalid: true } },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects a foreign origin even with a valid session', async () => {
      const user = createUser({
        letterboxdId: 'prefs-origin-user',
        letterboxdUsername: 'originuser',
        refreshToken: 'fake-refresh-token',
      });

      const token = await signUserToken({
        userId: user.id,
        letterboxdId: user.letterboxd_id,
        username: user.letterboxd_username,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/preferences',
        cookies: { sb_session: token },
        headers: { origin: 'https://evil.example' },
        payload: { preferences: VALID_PREFERENCES },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /auth/session', () => {
    it('returns 401 without a session cookie', async () => {
      const res = await app.inject({ method: 'GET', url: '/auth/session' });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'NO_SESSION' });
    });

    it('clears the cookie when the session points at a deleted user', async () => {
      const token = await signUserToken({
        userId: 'deleted-user-id-1234567890abcd',
        letterboxdId: 'lbxd-gone',
        username: 'gone',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/auth/session',
        cookies: { sb_session: token },
      });

      expect(res.statusCode).toBe(401);
      expect(res.cookies.find((c) => c.name === 'sb_session')?.value).toBe('');
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 401 without a session cookie', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/logout' });

      expect(res.statusCode).toBe(401);
    });

    it('expires the session cookie', async () => {
      const user = createUser({
        letterboxdId: 'logout-test-user',
        letterboxdUsername: 'logoutuser',
        refreshToken: 'fake-refresh-token',
      });

      const token = await signUserToken({
        userId: user.id,
        letterboxdId: user.letterboxd_id,
        username: user.letterboxd_username,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { sb_session: token },
      });

      expect(res.statusCode).toBe(200);

      const cleared = res.cookies.find((c) => c.name === 'sb_session');
      expect(cleared?.value).toBe('');
      expect(cleared?.httpOnly).toBe(true);
    });

    it('revokes the token server-side, not just the local cookie', async () => {
      const user = createUser({
        letterboxdId: 'revoke-route-user',
        letterboxdUsername: 'revokerouteuser',
        refreshToken: 'fake-refresh-token',
      });

      const token = await signUserToken({
        userId: user.id,
        letterboxdId: user.letterboxd_id,
        username: user.letterboxd_username,
      });

      // Tokens carry a second-resolution iat, so move the cut-off past it.
      vi.setSystemTime(Date.now() + 2000);
      const logout = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { sb_session: token },
      });
      vi.useRealTimers();

      expect(logout.statusCode).toBe(200);

      // Replaying the very same token must now fail.
      const replay = await app.inject({
        method: 'POST',
        url: '/auth/preferences',
        cookies: { sb_session: token },
        payload: { preferences: VALID_PREFERENCES },
      });

      expect(replay.statusCode).toBe(401);
    });
  });
});
