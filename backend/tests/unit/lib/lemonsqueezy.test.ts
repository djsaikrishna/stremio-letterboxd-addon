import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../../../src/lib/lemonsqueezy.js';

const SECRET = 'test-webhook-secret';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = Buffer.from('{"meta":{"event_name":"subscription_created"}}');
    const signature = sign(body.toString('utf8'));
    expect(verifyWebhookSignature(body, signature, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const original = Buffer.from('{"a":1}');
    const signature = sign(original.toString('utf8'));
    const tampered = Buffer.from('{"a":2}');
    expect(verifyWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const body = Buffer.from('{"a":1}');
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const body = Buffer.from('{"a":1}');
    const signature = createHmac('sha256', 'wrong-secret').update(body.toString('utf8')).digest('hex');
    expect(verifyWebhookSignature(body, signature, SECRET)).toBe(false);
  });
});
