import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { signUserToken } from '../../../src/lib/jwt.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';
import type { FastifyInstance } from 'fastify';

// loginUser talks to the real Letterboxd auth flow through this module —
// mock it the same way tests/integration/routes/letterboxd.test.ts does, so
// /auth/login can be exercised end-to-end without a configured API client.
vi.mock('../../../src/modules/letterboxd/letterboxd.client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/modules/letterboxd/letterboxd.client.js')>();
  return {
    ...actual,
    authenticateWithPassword: vi.fn().mockResolvedValue({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    getCurrentUser: vi.fn().mockResolvedValue({
      member: { id: 'lbxd-login-test', username: 'testuser', displayName: 'Test User' },
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    createAuthenticatedClient: vi.fn().mockReturnValue({
      getUserLists: vi.fn().mockResolvedValue({ items: [] }),
    }),
  };
});

vi.mock('../../../src/modules/billing/billing.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/modules/billing/billing.service.js')>();
  return {
    ...actual,
    // Used by /auth/login (auth.service.ts) — unrelated to the route-level
    // trustworthy/untrustworthy distinction, kept as a plain boolean mock.
    getEntitlement: vi.fn().mockResolvedValue(false),
    // Used by /auth/session (auth.routes.ts) — carries whether the answer is
    // a genuine Polar response or a degraded fallback (see billing.service.ts).
    getEntitlementStatus: vi.fn().mockResolvedValue({ entitled: false, trustworthy: true }),
  };
});
import { getEntitlement, getEntitlementStatus } from '../../../src/modules/billing/billing.service.js';
import * as catalogFetcherService from '../../../src/modules/stremio/catalog/catalog-fetcher.service.js';
const mockedEntitlement = vi.mocked(getEntitlement);
const mockedEntitlementStatus = vi.mocked(getEntitlementStatus);

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

  beforeEach(() => {
    mockedEntitlement.mockResolvedValue(false);
    mockedEntitlementStatus.mockResolvedValue({ entitled: false, trustworthy: true });
  });

  describe('POST /auth/login', () => {
    it('does not set a session cookie for a non-entitled user, and returns userToken in the body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'testuser', password: 'testpass' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().entitled).toBe(false);
      expect(res.json().userToken).toBeTypeOf('string');
      expect(res.cookies.find((c) => c.name === 'sb_session')).toBeUndefined();
    });

    it('sets a 365-day session cookie and omits userToken for an entitled user', async () => {
      mockedEntitlement.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'testuser', password: 'testpass' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().entitled).toBe(true);
      expect(res.json().userToken).toBeUndefined();
      const cookie = res.cookies.find((c) => c.name === 'sb_session');
      expect(cookie).toBeDefined();
      expect(cookie?.maxAge).toBe(365 * 24 * 60 * 60);
      expect(mockedEntitlement).toHaveBeenCalledWith(res.json().user.id, { fresh: true });
    });

    it('does not set a session cookie for an entitled user who opts out with rememberMe: false', async () => {
      mockedEntitlement.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'testuser', password: 'testpass', rememberMe: false },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().entitled).toBe(true);
      expect(res.json().userToken).toBeTypeOf('string');
      expect(res.cookies.find((c) => c.name === 'sb_session')).toBeUndefined();
    });
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

    it('revokes the session with NOT_ENTITLED once the user is no longer a supporter', async () => {
      const user = createUser({ letterboxdId: 'session-lapse-1', letterboxdUsername: 'lapseuser', refreshToken: 'x' });
      const token = await signUserToken(
        { userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username },
        365 * 24 * 60 * 60
      );
      mockedEntitlementStatus.mockResolvedValue({ entitled: false, trustworthy: true });

      const res = await app.inject({ method: 'GET', url: '/auth/session', cookies: { sb_session: token } });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'NOT_ENTITLED' });
      expect(res.cookies.find((c) => c.name === 'sb_session')?.value).toBe('');
    });

    it('denies but does NOT clear the cookie when entitlement is unknown (Polar outage, nothing trustworthy cached)', async () => {
      const user = createUser({ letterboxdId: 'session-degraded-1', letterboxdUsername: 'degradeduser', refreshToken: 'x' });
      const token = await signUserToken(
        { userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username },
        365 * 24 * 60 * 60
      );
      mockedEntitlementStatus.mockResolvedValue({ entitled: false, trustworthy: false });

      const res = await app.inject({ method: 'GET', url: '/auth/session', cookies: { sb_session: token } });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'NOT_ENTITLED' });
      // Unlike a genuine negative answer, a degraded/unknown one must not
      // destroy an otherwise-valid 365-day session cookie.
      expect(res.cookies.find((c) => c.name === 'sb_session')).toBeUndefined();
    });

    it('short-circuits before the list fetch when NOT_ENTITLED (no wasted token refresh)', async () => {
      const fetchSpy = vi.spyOn(catalogFetcherService, 'fetchUserLists');
      const user = createUser({ letterboxdId: 'session-shortcircuit-1', letterboxdUsername: 'shortcircuituser', refreshToken: 'x' });
      const token = await signUserToken(
        { userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username },
        365 * 24 * 60 * 60
      );
      mockedEntitlementStatus.mockResolvedValue({ entitled: false, trustworthy: true });

      const res = await app.inject({ method: 'GET', url: '/auth/session', cookies: { sb_session: token } });

      expect(res.statusCode).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('forces a Polar refresh when called with fresh=1', async () => {
      const user = createUser({ letterboxdId: 'session-fresh-1', letterboxdUsername: 'freshuser', refreshToken: 'x' });
      const token = await signUserToken({ userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username });
      mockedEntitlementStatus.mockResolvedValue({ entitled: true, trustworthy: true });

      const res = await app.inject({
        method: 'GET',
        url: '/auth/session?fresh=1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().entitled).toBe(true);
      expect(mockedEntitlementStatus).toHaveBeenCalledWith(user.id, { fresh: true });
    });

    it('reports entitled: true and refreshes the 365-day cookie for an active subscriber', async () => {
      const user = createUser({ letterboxdId: 'session-lapse-2', letterboxdUsername: 'entitleduser', refreshToken: 'x' });
      mockedEntitlementStatus.mockResolvedValue({ entitled: true, trustworthy: true });
      const token = await signUserToken(
        { userId: user.id, letterboxdId: user.letterboxd_id, username: user.letterboxd_username },
        365 * 24 * 60 * 60
      );

      const res = await app.inject({ method: 'GET', url: '/auth/session', cookies: { sb_session: token } });

      expect(res.statusCode).toBe(200);
      expect(res.json().entitled).toBe(true);
      expect(res.cookies.find((c) => c.name === 'sb_session')?.maxAge).toBe(365 * 24 * 60 * 60);
      expect(mockedEntitlementStatus).toHaveBeenCalledWith(user.id, { fresh: false });
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
