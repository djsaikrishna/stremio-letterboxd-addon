import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from '../../../src/middleware/error-handler.js';

describe('error handler', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    app.setErrorHandler(errorHandler);

    app.get(
      '/action/validation-target/:filmId',
      { schema: { params: { type: 'object', properties: { filmId: { type: 'string', pattern: '^[a-zA-Z0-9]+$' } }, required: ['filmId'] } } },
      async () => ({ ok: true }),
    );
    app.get(
      '/other/validation-target/:filmId',
      { schema: { params: { type: 'object', properties: { filmId: { type: 'string', pattern: '^[a-zA-Z0-9]+$' } }, required: ['filmId'] } } },
      async () => ({ ok: true }),
    );

    app.get('/action/rate-limit', async () => {
      const err = new Error('Rate limited') as Error & { code: string; statusCode: number };
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.statusCode = 429;
      throw err;
    });
    app.get('/other/rate-limit', async () => {
      const err = new Error('Rate limited') as Error & { code: string; statusCode: number };
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.statusCode = 429;
      throw err;
    });

    app.get('/action/forbidden', async () => {
      const err = new Error('nope') as Error & { statusCode: number };
      err.statusCode = 403;
      throw err;
    });
    app.get('/other/forbidden', async () => {
      const err = new Error('nope') as Error & { statusCode: number };
      err.statusCode = 403;
      throw err;
    });

    app.get('/action/boom', async () => {
      throw new Error('unexpected');
    });
    app.get('/other/boom', async () => {
      throw new Error('unexpected');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('validation errors (400)', () => {
    it('renders a styled HTML page for /action/* routes (#134)', async () => {
      // Mirrors the malformed URL observed in prod logs for issue #134:
      // filmId ends up containing "&name=...&tok=..." with no leading "?".
      const res = await app.inject({ method: 'GET', url: '/action/validation-target/h4cS&name=Joker&tok=x' });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Invalid link');
      expect(res.body).not.toContain('"error"');
    });

    it('keeps returning JSON for non-/action/ routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/other/validation-target/h4cS&name=Joker&tok=x' });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toMatchObject({ error: 'Validation error' });
    });
  });

  describe('rate limit errors (429)', () => {
    it('renders a styled HTML page for /action/* routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/action/rate-limit' });

      expect(res.statusCode).toBe(429);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Too many requests');
    });

    it('keeps returning JSON for non-/action/ routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/other/rate-limit' });

      expect(res.statusCode).toBe(429);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    });
  });

  describe('generic statusCode errors (e.g. 403)', () => {
    it('renders a styled HTML page for /action/* routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/action/forbidden' });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('keeps returning JSON for non-/action/ routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/other/forbidden' });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toMatchObject({ error: 'nope' });
    });
  });

  describe('unhandled errors (500)', () => {
    it('renders a styled HTML page for /action/* routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/action/boom' });

      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Internal server error');
    });

    it('keeps returning JSON for non-/action/ routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/other/boom' });

      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toMatchObject({ error: 'Internal server error' });
    });
  });
});
