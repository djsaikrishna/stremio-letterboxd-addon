import { describe, it, expect } from 'vitest';
import { isSupporter } from '../../../src/lib/entitlement.js';

describe('isSupporter', () => {
  it('returns false when Polar does not know the customer', () => {
    expect(isSupporter(null)).toBe(false);
  });

  it('returns false with no active subscription', () => {
    expect(isSupporter({ active_subscriptions: [] })).toBe(false);
  });

  it('returns true for an active subscription (including one scheduled to cancel)', () => {
    expect(isSupporter({ active_subscriptions: [{ status: 'active' }] })).toBe(true);
  });

  it('returns true for a trialing subscription', () => {
    expect(isSupporter({ active_subscriptions: [{ status: 'trialing' }] })).toBe(true);
  });

  it('returns false for any other status', () => {
    expect(isSupporter({ active_subscriptions: [{ status: 'past_due' }] })).toBe(false);
  });
});
