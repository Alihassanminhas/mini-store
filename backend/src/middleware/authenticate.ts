import { jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';
import { database } from '../config/database.js';
import { env } from '../config/env.js';

export type UserRole = 'user' | 'admin';
export type AuthenticatedUser = { id: string; email: string; name: string; role: UserRole };

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);

export async function authenticate(request: Request, response: Response, next: NextFunction): Promise<void> {
  const token = request.cookies?.store_session;
  if (!token) {
    response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, jwtKey, { algorithms: ['HS256'], issuer: 'mini-store-api' });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' || (payload.role !== 'user' && payload.role !== 'admin')) {
      throw new Error('Invalid session claims');
    }

    const account = await database.query<AuthenticatedUser>(
      'SELECT id, email, name, role FROM users WHERE id = $1', [payload.sub],
    );
    const currentUser = account.rows[0];
    if (!currentUser) throw new Error('Account no longer exists');

    // Read role from PostgreSQL so a demoted admin loses access immediately.
    request.user = currentUser;
    next();
  } catch {
    response.clearCookie('store_session', { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/' });
    response.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Your session has expired. Sign in again.' } });
  }
}
