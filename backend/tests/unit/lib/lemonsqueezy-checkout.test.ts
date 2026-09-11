import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCheckout } from '../../../src/lib/lemonsqueezy.js';
import { billingConfig } from '../../../src/config/index.js';

describe('createCheckout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the Lemon Squeezy checkouts API with custom_data.user_id and returns the checkout URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { attributes: { url: 'https://stremboxd.lemonsqueezy.com/checkout/abc' } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await createCheckout({ variantId: '200', userId: 'user-123', email: 'user@example.com' });

    expect(url).toBe('https://stremboxd.lemonsqueezy.com/checkout/abc');

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe('https://api.lemonsqueezy.com/v1/checkouts');
    expect(calledInit.headers['Authorization']).toBe(`Bearer ${billingConfig.apiKey}`);

    const body = JSON.parse(calledInit.body);
    expect(body.data.relationships.store.data.id).toBe(billingConfig.storeId);
    expect(body.data.relationships.variant.data.id).toBe('200');
    expect(body.data.attributes.checkout_data.custom.user_id).toBe('user-123');
    expect(body.data.attributes.checkout_data.email).toBe('user@example.com');
  });

  it('omits email from checkout_data when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { attributes: { url: 'https://stremboxd.lemonsqueezy.com/checkout/xyz' } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await createCheckout({ variantId: '100', userId: 'user-456' });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.data.attributes.checkout_data.email).toBeUndefined();
  });

  it('throws when the Lemon Squeezy API responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'Unprocessable' }));

    await expect(createCheckout({ variantId: '100', userId: 'user-789' })).rejects.toThrow();
  });
});
