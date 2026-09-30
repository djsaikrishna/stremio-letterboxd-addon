import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb } from '../../../src/db/index.js';
import { encodeConfig, type PublicConfig } from '../../../src/lib/config-encoding.js';
import type { FastifyInstance } from 'fastify';

describe('doubled manifest.json path', () => {
  let app: FastifyInstance;
  let validConfig: string;

  beforeAll(async () => {
    initDb();
    app = await buildApp();
    await app.ready();
    const cfg: PublicConfig = { c: { popular: true, top250: false }, l: [], r: false };
    validConfig = encodeConfig(cfg);
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it('redirects /:config/manifest.json/manifest.json to the canonical manifest', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/${validConfig}/manifest.json/manifest.json`,
    });

    expect(res.statusCode).toBe(308);
    expect(res.headers.location).toBe(`/${validConfig}/manifest.json`);
  });

  it('redirects the user manifest variant to its canonical path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/stremio/abc123/manifest.json/manifest.json',
    });

    expect(res.statusCode).toBe(308);
    expect(res.headers.location).toBe('/stremio/abc123/manifest.json');
  });

  it('never redirects off-site', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/%2F%2Fevil.com/manifest.json/manifest.json',
    });

    if (res.statusCode === 308) {
      expect(res.headers.location).toMatch(/^\/[^/]/);
    }
    expect(res.headers.location ?? '').not.toMatch(/^\/\//);
  });

  it('does not normalise other arbitrary doubled paths', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/${validConfig}/manifest.json/other.json`,
    });

    expect(res.statusCode).toBe(404);
  });
});
