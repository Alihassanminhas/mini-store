import express from "express";
import { createRequire } from 'node:module';
import type { RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { database } from './config/database.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { verifyOrigin } from './middleware/verify-origin.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { cartRouter } from './routes/cart.js';
import { ordersRouter } from './routes/orders.js';
import { stripeWebhookRouter } from './routes/webhooks.js';
import { adminRouter } from './routes/admin.js';
import { uploadsRouter } from './routes/uploads.js';

const require = createRequire(import.meta.url);
const helmet = require('helmet') as () => RequestHandler;
const rateLimit = require('express-rate-limit') as (options: { windowMs: number; limit: number }) => RequestHandler;

export const app = express();
export default app;

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(verifyOrigin);
app.use('/api/payments', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookRouter);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.use('/api/auth', authRouter);
app.use('/api', catalogRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', uploadsRouter);

app.get('/api/health', async (_request, response, next) => {
  try {
    await database.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } });
});

app.use(errorHandler);
