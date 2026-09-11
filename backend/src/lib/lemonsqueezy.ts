import { createHmac, timingSafeEqual } from 'node:crypto';
import { billingConfig } from '../config/index.js';

const LEMONSQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1';

export interface CreateCheckoutParams {
  variantId: string;
  userId: string;
  email?: string;
}

export async function createCheckout(params: CreateCheckoutParams): Promise<string> {
  const checkoutData: Record<string, unknown> = {
    custom: { user_id: params.userId },
  };
  if (params.email) {
    checkoutData['email'] = params.email;
  }

  const response = await fetch(`${LEMONSQUEEZY_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${billingConfig.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: { checkout_data: checkoutData },
        relationships: {
          store: { data: { type: 'stores', id: billingConfig.storeId } },
          variant: { data: { type: 'variants', id: params.variantId } },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Lemon Squeezy checkout creation failed with status ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { data: { attributes: { url: string } } };
  return body.data.attributes.url;
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const givenBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}
