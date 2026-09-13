import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/polar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/polar.js')>();
  return { ...actual, getCustomerState: vi.fn() };
});

describe('getEntitlement without billing configured', () => {
  it('returns false without calling Polar', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/index.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../src/config/index.js')>();
      return { ...actual, isPolarConfigured: false };
    });
    const polar = await import('../../../src/lib/polar.js');
    const service = await import('../../../src/modules/billing/billing.service.js');

    expect(await service.getEntitlement('u1')).toBe(false);
    expect(vi.mocked(polar.getCustomerState)).not.toHaveBeenCalled();

    vi.doUnmock('../../../src/config/index.js');
  });
});
