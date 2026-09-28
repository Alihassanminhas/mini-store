import { SignJWT } from 'jose';
import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { hashPassword, verifyPassword } from '../services/password.js';

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});
const registrationSchema = credentialsSchema.extend({ name: z.string().trim().min(1).max(120) });
const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

type UserRecord = { id: string; email: string; name: string; role: 'user' | 'admin'; password_hash?: string };

async function startSession(user: UserRecord, response: import('express').Response): Promise<void> {
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer('mini-store-api')
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(jwtKey);

  response.cookie('store_session', token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

authRouter.post('/register', async (request, response, next) => {
  const parsed = registrationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors } });
    return;
  }

  const { name, email, password } = parsed.data;
  const client = await database.connect();
  let createdUser: UserRecord | undefined;
  try {
    await client.query('BEGIN');
    const passwordHash = await hashPassword(password);
    const userResult = await client.query<UserRecord>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, role`,
      [name, email, passwordHash],
    );
    createdUser = userResult.rows[0];
    if (!createdUser) throw new Error('User insert returned no record');
    await client.query('INSERT INTO carts (user_id) VALUES ($1)', [createdUser.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      response.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account with that email already exists.' } });
      return;
    }
    throw error;
  } finally {
    client.release();
  }

  try {
    if (!createdUser) throw new Error('User creation failed');
    await startSession(createdUser, response);
    response.status(201).json({ user: createdUser });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (request, response, next) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email and password.' } });
    return;
  }

  try {
    const { email, password } = parsed.data;
    const result = await database.query<UserRecord>(
      'SELECT id, email, name, role, password_hash FROM users WHERE email = $1', [email],
    );
    const user = result.rows[0];
    if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
      response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
      return;
    }

    await startSession(user, response);
    const { password_hash: _passwordHash, ...publicUser } = user;
    response.json({ user: publicUser });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (_request, response) => {
  response.clearCookie('store_session', cookieOptions);
  response.status(204).end();
});

authRouter.get('/me', authenticate, (request, response) => {
  response.json({ user: request.user });
});

authRouter.patch('/me', authenticate, async (request, response, next) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Enter a name between 1 and 120 characters.' } });
    return;
  }
  try {
    const result = await database.query<UserRecord>(
      'UPDATE users SET name = $1, updated_at = now() WHERE id = $2 RETURNING id, name, email, role',
      [parsed.data.name, request.user!.id],
    );
    if (!result.rows[0]) { response.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Account not found.' } }); return; }
    response.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});
