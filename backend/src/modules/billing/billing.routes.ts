import type { FastifyInstance, FastifyRequest } from 'fastify';
import { verifyWebhookSignature } from '../../lib/lemonsqueezy.js';
import { billingConfig } from '../../config/index.js';
import { handleWebhookEvent, HANDLED_WEBHOOK_EVENTS, type LemonSqueezyWebhookPayload } from './billing.service.js';

export async function billingRoutes(app: FastifyInstance) {
  app.post(
    '/billing/webhook',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply) => {
      const signature = request.headers['x-signature'] as string | undefined;
      const valid = verifyWebhookSignature(request.rawBody ?? Buffer.alloc(0), signature, billingConfig.webhookSecret);

      if (!valid) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      const payload = request.body as LemonSqueezyWebhookPayload;
      const eventName = payload.meta?.event_name;

      if (!eventName || !HANDLED_WEBHOOK_EVENTS.has(eventName)) {
        return reply.status(200).send({ ignored: true });
      }

      handleWebhookEvent(payload);
      return reply.status(200).send({ received: true });
    }
  );
}
