import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { initDb, closeDb, getDb } from '../../../src/db/index.js';
import { createUser } from '../../../src/db/repositories/user.repository.js';

vi.mock('../../../src/modules/stremio/catalog/catalog-fetcher.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/modules/stremio/catalog/catalog-fetcher.service.js')>();
  return {
    ...actual,
    fetchUserLists: vi.fn().mockResolvedValue([]),
  };
});

function countEvents(userId: string): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT event, COUNT(*) as count FROM events WHERE user_id = ? GROUP BY event')
    .all(userId) as Array<{ event: string; count: number }>;
  return Object.fromEntries(rows.map((r) => [r.event, r.count]));
}

describe('install tracking on the authenticated manifest', () => {
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

  it('records install once and a manifest view on every fetch', async () => {
    const user = createUser({ letterboxdId: 'install-once', letterboxdUsername: 'installonce', refreshToken: 'fake' });

    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'GET', url: `/stremio/${user.id}/manifest.json` });
      expect(res.statusCode).toBe(200);
    }

    expect(countEvents(user.id)).toEqual({ install: 1, manifest_view: 3 });
    const row = getDb().prepare('SELECT installed_at FROM users WHERE id = ?').get(user.id) as { installed_at: string | null };
    expect(row.installed_at).not.toBeNull();
  });
});
