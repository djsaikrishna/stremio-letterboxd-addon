import { describe, it, expect } from 'vitest';
import { envSchema } from '../../../src/config/env.schema.js';

describe('CORS hardening', () => {
  const baseEnv = {
    CATALOG_CLIENT_ID: 'test',
    CATALOG_CLIENT_SECRET: 'test',
    ENCRYPTION_KEY: 'a'.repeat(64),
    JWT_SECRET: 'a'.repeat(32),
    DASHBOARD_PASSWORD: 'testpassword123',
    LEMONSQUEEZY_API_KEY: 'test-api-key',
    LEMONSQUEEZY_STORE_ID: '1',
    LEMONSQUEEZY_VARIANT_ID_MONTHLY: '100',
    LEMONSQUEEZY_VARIANT_ID_YEARLY: '200',
    LEMONSQUEEZY_WEBHOOK_SECRET: 'test-webhook-secret',
  };

  it('accepts valid single origin', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGIN: 'http://localhost:3000',
    });

    expect(result.success).toBe(true);
  });

  it('accepts valid comma-separated origins', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGIN: 'https://app.example.com,https://www.example.com',
    });

    expect(result.success).toBe(true);
  });

  it('rejects wildcard origin', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGIN: '*',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('*'))).toBe(true);
    }
  });

  it('rejects wildcard mixed with valid origins', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGIN: 'https://app.example.com,*',
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed origin URL', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGIN: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('rejects origin without protocol', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGIN: 'app.example.com',
    });

    expect(result.success).toBe(false);
  });

  it('uses default when not provided', () => {
    const result = envSchema.safeParse(baseEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.CORS_ORIGIN).toBe('http://localhost:3000');
    }
  });
});
