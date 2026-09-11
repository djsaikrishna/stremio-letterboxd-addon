import { describe, it, expect } from 'vitest';
import { isEntitled, ENTITLED_SESSION_TTL_SECONDS, type SubscriptionSnapshot } from '../../../src/lib/entitlement.js';

describe('isEntitled', () => {
  it('returns false when there is no subscription', () => {
    expect(isEntitled(null)).toBe(false);
  });

  it('returns true for an active subscription', () => {
    const sub: SubscriptionSnapshot = { status: 'active', currentPeriodEnd: '2099-01-01T00:00:00.000Z' };
    expect(isEntitled(sub)).toBe(true);
  });

  it('returns true for past_due (dunning grace period)', () => {
    const sub: SubscriptionSnapshot = { status: 'past_due', currentPeriodEnd: '2020-01-01T00:00:00.000Z' };
    expect(isEntitled(sub)).toBe(true);
  });

  it('returns true for cancelled while still inside the paid period', () => {
    const sub: SubscriptionSnapshot = { status: 'cancelled', currentPeriodEnd: '2099-01-01T00:00:00.000Z' };
    expect(isEntitled(sub, new Date('2026-06-01T00:00:00.000Z'))).toBe(true);
  });

  it('returns false for cancelled once the paid period has passed', () => {
    const sub: SubscriptionSnapshot = { status: 'cancelled', currentPeriodEnd: '2026-01-01T00:00:00.000Z' };
    expect(isEntitled(sub, new Date('2026-06-01T00:00:00.000Z'))).toBe(false);
  });

  it.each(['expired', 'unpaid', 'paused'] as const)('returns false for %s regardless of currentPeriodEnd', (status) => {
    const sub: SubscriptionSnapshot = { status, currentPeriodEnd: '2099-01-01T00:00:00.000Z' };
    expect(isEntitled(sub)).toBe(false);
  });

  it('exposes a 400-day TTL constant for entitled sessions', () => {
    expect(ENTITLED_SESSION_TTL_SECONDS).toBe(400 * 24 * 60 * 60);
  });
});
