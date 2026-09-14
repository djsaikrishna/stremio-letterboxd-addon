import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';
import { encodeConfig, type PublicConfig } from '../../../src/lib/config-encoding.js';

vi.mock('../../../src/modules/stremio/catalog/public-catalog-fetcher.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/modules/stremio/catalog/public-catalog-fetcher.service.js')>();
  return {
    ...actual,
    fetchPopularCatalogPublic: vi.fn(),
    handlePublicCatalogRequest: vi.fn(),
    resolveMemberId: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../../../src/modules/stremio/catalog/catalog-fetcher.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/modules/stremio/catalog/catalog-fetcher.service.js')>();
  return {
    ...actual,
    fetchUserLists: vi.fn(),
  };
});

import * as publicFetcher from '../../../src/modules/stremio/catalog/public-catalog-fetcher.service.js';
import * as userFetcher from '../../../src/modules/stremio/catalog/catalog-fetcher.service.js';

const meta = { id: 'tt1234567', type: 'movie', name: 'Test Film' };

describe('egress reduction: compression and Cache-Control', () => {
  let app: FastifyInstance;
  const cfg: PublicConfig = { c: { popular: false, top250: false }, l: ['list1'], r: false };

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
    vi.mocked(publicFetcher.fetchPopularCatalogPublic).mockReset();
    vi.mocked(publicFetcher.handlePublicCatalogRequest).mockReset();
    vi.mocked(userFetcher.fetchUserLists).mockReset();
  });

  describe('compression', () => {
    it('gzips JSON when the client accepts it', async () => {
      const res = await app.inject({ method: 'GET', url: '/manifest.json', headers: { 'accept-encoding': 'gzip' } });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-encoding']).toBe('gzip');
    });

    it('sends identity when the client does not accept compression', async () => {
      const res = await app.inject({ method: 'GET', url: '/manifest.json' });

      expect(res.headers['content-encoding']).toBeUndefined();
      expect(res.json().id).toBe('community.stremboxd');
    });
  });

  describe('authenticated manifest', () => {
    it('is cacheable for 5 minutes when generated', async () => {
      vi.mocked(userFetcher.fetchUserLists).mockResolvedValue([]);
      const user = createUser({ letterboxdId: 'cache-ok', letterboxdUsername: 'cacheok', refreshToken: 'fake' });

      const res = await app.inject({ method: 'GET', url: `/stremio/${user.id}/manifest.json` });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=300');
    });

    it('is not cacheable when falling back to the static manifest', async () => {
      vi.mocked(userFetcher.fetchUserLists).mockRejectedValue(new Error('upstream down'));
      const user = createUser({ letterboxdId: 'cache-ko', letterboxdUsername: 'cacheko', refreshToken: 'fake' });

      const res = await app.inject({ method: 'GET', url: `/stremio/${user.id}/manifest.json` });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBeUndefined();
    });
  });

  describe('public catalogs', () => {
    it('caches the global popular catalog for 1 hour', async () => {
      vi.mocked(publicFetcher.fetchPopularCatalogPublic).mockResolvedValue({ metas: [meta] });

      const res = await app.inject({ method: 'GET', url: '/catalog/movie/letterboxd-popular.json' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('caches a non-empty config catalog for 5 minutes', async () => {
      vi.mocked(publicFetcher.handlePublicCatalogRequest).mockResolvedValue({ metas: [meta] });

      const res = await app.inject({ method: 'GET', url: `/${encodeConfig(cfg)}/catalog/movie/letterboxd-list-list1.json` });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=300');
    });

    it('does not cache an empty config catalog', async () => {
      vi.mocked(publicFetcher.handlePublicCatalogRequest).mockResolvedValue({ metas: [] });

      const res = await app.inject({
        method: 'GET',
        url: `/${encodeConfig(cfg)}/catalog/movie/letterboxd-list-list1/skip=100.json`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBeUndefined();
    });
  });
});
