import type { RequestHandler } from 'express';

export const requireAdmin: RequestHandler = (request, response, next) => {
  if (!request.user) {
    response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    return;
  }
  if (request.user.role !== 'admin') {
    response.status(403).json({ error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } });
    return;
  }
  next();
};
