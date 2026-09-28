import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { releaseInventoryReservation } from '../services/inventory-reservations.js';
import { getStripeClient } from '../services/stripe.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

const checkoutSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(6).max(40),
  address: z.object({
    line1: z.string().trim().min(2).max(160),
    line2: z.string().trim().max(160).optional().default(''),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().max(100).optional().default(''),
    postalCode: z.string().trim().min(2).max(24),
    country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  }),
});

function priceToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error('The database returned an invalid product price.');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

ordersRouter.post('/checkout/session', async (request, response, next) => {
  const parsed = checkoutSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check your shipping details.', details: parsed.error.flatten().fieldErrors } });
    return;
  }

  let stripe: ReturnType<typeof getStripeClient>;
  try { stripe = getStripeClient(); } catch (error) { next(error); return; }

  const client = await database.connect();
  let orderId: string | undefined;
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [request.user!.id]);
      const activeOrder = await client.query(
      `SELECT o.id, p.stripe_session_id FROM orders o JOIN payments p ON p.order_id = o.id
       WHERE o.user_id = $1 AND o.status = 'pending' LIMIT 1`,
      [request.user!.id],
    );
    if (activeOrder.rowCount) {
      await client.query('ROLLBACK');
      const pendingSessionId = activeOrder.rows[0]?.stripe_session_id;
      if (pendingSessionId) {
        try {
          const pendingSession = await stripe.checkout.sessions.retrieve(pendingSessionId);
          if (pendingSession.status === 'open' && pendingSession.url) {
            response.json({ checkoutUrl: pendingSession.url });
            return;
          }
        } catch (error) { console.error('Could not resume an existing Stripe checkout session', error); }
      }
      response.status(409).json({ error: { code: 'CHECKOUT_IN_PROGRESS', message: 'You already have a checkout in progress. Please finish it or wait for it to expire.' } });
      return;
    }

    const cartItems = await client.query<{
      variant_id: string; sku: string; variant_name: string; product_name: string;
      price: string; quantity: number; stock_quantity: number; is_active: boolean; product_active: boolean;
    }>(
      `SELECT v.id AS variant_id, v.sku, v.variant_name, p.name AS product_name, v.price,
              ci.quantity, v.stock_quantity, v.is_active, p.is_active AS product_active
       FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
       JOIN variants v ON v.id = ci.variant_id JOIN products p ON p.id = v.product_id
       WHERE c.user_id = $1 ORDER BY v.id FOR UPDATE OF v, ci`, [request.user!.id],
    );
    if (!cartItems.rowCount) {
      await client.query('ROLLBACK');
      response.status(409).json({ error: { code: 'EMPTY_CART', message: 'Add something to your bag before checkout.' } });
      return;
    }

    let subtotalCents = 0;
    for (const item of cartItems.rows) {
      if (!item.is_active || !item.product_active) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: { code: 'PRODUCT_UNAVAILABLE', message: `${item.product_name} is no longer available.` } });
        return;
      }
      if (Number(item.stock_quantity) < Number(item.quantity)) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: `There is not enough stock for ${item.product_name}.` } });
        return;
      }
      subtotalCents += priceToCents(item.price) * Number(item.quantity);
    }

    const orderNumber = `FF-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    const orderResult = await client.query<{ id: string }>(
      `INSERT INTO orders (user_id, order_number, subtotal, shipping_amount, total_amount,
       shipping_name, shipping_email, shipping_phone, shipping_address)
       VALUES ($1, $2, $3, 0, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
      [request.user!.id, orderNumber, (subtotalCents / 100).toFixed(2), parsed.data.name, parsed.data.email, parsed.data.phone, JSON.stringify(parsed.data.address)],
    );
    orderId = orderResult.rows[0]!.id;

    for (const item of cartItems.rows) {
      const itemPriceCents = priceToCents(item.price);
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, product_name, variant_name, sku, unit_price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orderId, item.variant_id, item.product_name, item.variant_name, item.sku, item.price, item.quantity, ((itemPriceCents * Number(item.quantity)) / 100).toFixed(2)],
      );
      const reservation = await client.query(
        'UPDATE variants SET stock_quantity = stock_quantity - $1, updated_at = now() WHERE id = $2 AND stock_quantity >= $1',
        [item.quantity, item.variant_id],
      );
      if (!reservation.rowCount) throw new Error(`Could not reserve inventory for ${item.sku}`);
      await client.query(
        `INSERT INTO inventory_transactions (variant_id, quantity_change, transaction_type, reference_id)
         VALUES ($1, $2, 'reservation', $3)`, [-Number(item.quantity), item.variant_id, orderId],
      );
    }
    await client.query('INSERT INTO payments (order_id, amount, currency) VALUES ($1, $2, $3)', [orderId, (subtotalCents / 100).toFixed(2), 'usd']);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
    return;
  } finally { client.release(); }

  if (!orderId) { next(new Error('Order preparation failed.')); return; }
  try {
    const order = await database.query<{ order_number: string; total_amount: string }>(
      'SELECT order_number, total_amount FROM orders WHERE id = $1 AND user_id = $2', [orderId, request.user!.id],
    );
    const orderData = order.rows[0];
    if (!orderData) throw new Error('Prepared order could not be loaded.');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      payment_method_types: ['card'],
      customer_email: parsed.data.email,
      client_reference_id: orderId,
      metadata: { orderId, userId: request.user!.id, orderNumber: orderData.order_number },
      success_url: `${env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/payment/cancelled?order=${encodeURIComponent(orderData.order_number)}`,
      line_items: await buildStripeLineItems(orderId),
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    await database.query('UPDATE payments SET stripe_session_id = $1, updated_at = now() WHERE order_id = $2', [session.id, orderId]);
    response.status(201).json({ checkoutUrl: session.url, orderNumber: orderData.order_number });
  } catch (error) {
    try { await releaseInventoryReservation(orderId); } catch (releaseError) { console.error('Could not release failed checkout reservation', releaseError); }
    next(error);
  }
});

async function buildStripeLineItems(orderId: string) {
  const result = await database.query<{ product_name: string; variant_name: string; unit_price: string; quantity: number }>(
    'SELECT product_name, variant_name, unit_price, quantity FROM order_items WHERE order_id = $1', [orderId],
  );
  return result.rows.map((item) => ({
    quantity: Number(item.quantity),
    price_data: {
      currency: 'usd',
      unit_amount: priceToCents(item.unit_price),
      product_data: { name: item.product_name, description: item.variant_name.slice(0, 500) },
    },
  }));
}

ordersRouter.get('/', async (request, response, next) => {
  try {
    const result = await database.query(
      `SELECT id, order_number, status, payment_status, total_amount, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [request.user!.id],
    );
    response.json({ orders: result.rows });
  } catch (error) { next(error); }
});

ordersRouter.get('/session/:sessionId', async (request, response, next) => {
  try {
    const result = await database.query(
      `SELECT o.order_number, o.status, o.payment_status, o.total_amount, o.created_at
       FROM orders o JOIN payments p ON p.order_id = o.id
       WHERE p.stripe_session_id = $1 AND o.user_id = $2`, [request.params.sessionId, request.user!.id],
    );
    if (!result.rows[0]) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'We could not find that order.' } });
      return;
    }
    response.json({ order: result.rows[0] });
  } catch (error) { next(error); }
});

ordersRouter.get('/:orderId', async (request, response, next) => {
  try {
    const result = await database.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.subtotal, o.shipping_amount,
              o.total_amount, o.shipping_name, o.shipping_email, o.shipping_phone,
              o.shipping_address, o.created_at, o.updated_at,
              COALESCE(json_agg(json_build_object(
                'productName', oi.product_name, 'variantName', oi.variant_name, 'sku', oi.sku,
                'unitPrice', oi.unit_price, 'quantity', oi.quantity, 'subtotal', oi.subtotal
              )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.order_number = $1 AND o.user_id = $2
       GROUP BY o.id`, [request.params.orderId, request.user!.id],
    );
    if (!result.rows[0]) {
      response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'We could not find that order.' } });
      return;
    }
    response.json({ order: result.rows[0] });
  } catch (error) { next(error); }
});
