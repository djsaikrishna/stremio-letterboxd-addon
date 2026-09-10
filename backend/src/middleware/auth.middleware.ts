import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyUserToken, type UserTokenPayload } from '../lib/jwt.js';
import { clearSessionCookie, readSessionToken } from '../lib/session-cookie.js';
import { corsOrigins } from '../config/index.js';
import { findUserById, type User } from '../db/repositories/user.repository.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

declare module 'fastify' {
  interface FastifyRequest {
    userPayload?: UserTokenPayload;
    sessionUser?: User;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);
  const payload = await verifyUserToken(token);

  if (!payload) {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }

  request.userPayload = payload;
}

/**
 * Authenticates the configuration UI from the httpOnly session cookie.
 * Use for browser-facing routes; authMiddleware stays for Bearer API clients.
 */
export async function sessionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Defence in depth against CSRF: SameSite=Lax already keeps the cookie away
  // from cross-site requests, this rejects anything that claims a foreign origin.
  if (MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.origin;
    if (origin && !corsOrigins.includes(origin)) {
      return reply.status(403).send({ error: 'Forbidden origin' });
    }
  }

  const token = readSessionToken(request);

  if (!token) {
    return reply.status(401).send({ error: 'No active session', code: 'NO_SESSION' });
  }

  const payload = await verifyUserToken(token);

  if (!payload) {
    clearSessionCookie(reply);
    return reply
      .status(401)
      .send({ error: 'Invalid or expired session', code: 'NO_SESSION' });
  }

  const user = findUserById(payload.sub);

  // A token is only good while it was issued after the user's revocation
  // cut-off, so signing out invalidates it server-side and not just locally.
  if (!user || (payload.iat ?? 0) < user.session_epoch) {
    clearSessionCookie(reply);
    return reply
      .status(401)
      .send({ error: 'Invalid or expired session', code: 'NO_SESSION' });
  }

  request.userPayload = payload;
  request.sessionUser = user;
}
