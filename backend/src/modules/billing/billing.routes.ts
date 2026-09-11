import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { verifyWebhookSignature } from '../../lib/lemonsqueezy.js';
import { billingConfig } from '../../config/index.js';
import {
  handleWebhookEvent,
  HANDLED_WEBHOOK_EVENTS,
  buildCheckoutUrl,
  getPortalUrlForUser,
  type LemonSqueezyWebhookPayload,
} from './billing.service.js';
import { sessionMiddleware } from '../../middleware/auth.middleware.js';

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

  const checkoutBodySchema = z.object({ variant: z.enum(['monthly', 'yearly']) });

  app.post(
    '/billing/checkout',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: sessionMiddleware,
    },
    async (request, reply) => {
      const parsed = checkoutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid variant' });
      }

      const checkoutUrl = await buildCheckoutUrl(request.sessionUser!, parsed.data.variant);
      return { checkoutUrl };
    }
  );

  app.get(
    '/billing/portal',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      preHandler: sessionMiddleware,
    },
    async (request, reply) => {
      const portalUrl = await getPortalUrlForUser(request.sessionUser!.id);
      if (!portalUrl) {
        return reply.status(404).send({ error: 'No subscription found' });
      }
      return reply.redirect(portalUrl, 302);
    }
  );
}
