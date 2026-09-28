import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

const allowedOrigin = new URL(env.FRONTEND_URL).origin;
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rejects cross-origin state changes to protect cookie-authenticated routes. */
export const verifyOrigin: RequestHandler = (request, response, next) => {
  const origin = request.get('origin');
  if (!safeMethods.has(request.method) && origin && origin !== allowedOrigin) {
    response.status(403).json({ error: { code: 'ORIGIN_REJECTED', message: 'This request origin is not allowed.' } });
    return;
  }
  next();
};
