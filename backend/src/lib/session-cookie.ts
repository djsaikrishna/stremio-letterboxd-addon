import type { FastifyReply, FastifyRequest } from 'fastify';
import { config, jwtConfig } from '../config/index.js';
import { parseTtl } from './jwt.js';

export const SESSION_COOKIE_NAME = 'sb_session';

// The cookie is host-only (no Domain attribute): it is set by, and sent back
// to, the API host only. SameSite=Lax still lets the frontend send it because
// frontend and API share the same registrable domain, while a third-party site
// cannot make the browser attach it.
const baseCookieOptions = {
  httpOnly: true,
  // Derived from the public URL scheme rather than NODE_ENV so the flag can
  // never be silently dropped in production by a missing env var.
  secure: config.PUBLIC_URL.startsWith('https://'),
  sameSite: 'lax',
  path: '/',
} as const;

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions,
    maxAge: parseTtl(jwtConfig.ttl),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions);
}

export function readSessionToken(request: FastifyRequest): string | null {
  return request.cookies[SESSION_COOKIE_NAME] ?? null;
}
