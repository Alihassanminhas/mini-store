import Stripe from 'stripe';
import { Router } from 'express';
import { database } from '../config/database.js';
import { env } from '../config/env.js';
import { getStripeClient } from '../services/stripe.js';

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post('/webhook', async (request, response) => {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    response.status(503).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Stripe webhooks are not configured.' } });
    return;
  }

  let event: Stripe.Event;
  try {
    const signature = request.get('stripe-signature');
    if (!signature || !Buffer.isBuffer(request.body)) throw new Error('Missing webhook signature or raw request body');
    event = getStripeClient().webhooks.constructEvent(request.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error);
    response.status(400).json({ error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'The payment notification could not be verified.' } });
    return;
  }

  const paymentEvents = new Set([
    'checkout.session.completed', 'checkout.session.expired',
    'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  ]);
  if (!paymentEvents.has(event.type)) { response.json({ received: true }); return; }

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  const userId = session.metadata?.userId;
  if (!orderId || !userId || session.mode !== 'payment') {
    response.status(400).json({ error: { code: 'INVALID_PAYMENT_METADATA', message: 'The payment notification has no valid order reference.' } });
    return;
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const received = await client.query(
      'INSERT INTO stripe_webhook_events (id, event_type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id',
      [event.id, event.type],
    );
    if (!received.rowCount) { await client.query('COMMIT'); response.json({ received: true, duplicate: true }); return; }

    const orderResult = await client.query<{
      id: string; user_id: string; status: string; payment_status: string;
      total_amount: string; stripe_session_id: string | null;
    }>(
      `SELECT o.id, o.user_id, o.status, o.payment_status, o.total_amount, p.stripe_session_id
       FROM orders o JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1 AND p.order_id = $1 FOR UPDATE OF o, p`, [orderId],
    );
    const order = orderResult.rows[0];
    if (!order || order.user_id !== userId || (order.stripe_session_id && order.stripe_session_id !== session.id)) {
      throw new Error(`Stripe event ${event.id} does not match its order and checkout session.`);
    }

    await client.query('UPDATE payments SET stripe_session_id = COALESCE(stripe_session_id, $1) WHERE order_id = $2', [session.id, orderId]);

    const paymentSucceeded = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
    if (paymentSucceeded && session.payment_status === 'paid' && order.status === 'pending') {
      const expectedAmount = Math.round(Number(order.total_amount) * 100);
      if (session.currency !== 'usd' || session.amount_total !== expectedAmount) {
        throw new Error(`Stripe total does not match order ${orderId}.`);
      }
      const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
      await client.query("UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = now() WHERE id = $1", [orderId]);
      await client.query("UPDATE payments SET status = 'paid', stripe_payment_id = $1, updated_at = now() WHERE order_id = $2", [paymentIntent, orderId]);
      await client.query("UPDATE inventory_transactions SET transaction_type = 'purchase' WHERE reference_id = $1 AND transaction_type = 'reservation'", [orderId]);
      await client.query(
        `DELETE FROM cart_items ci USING carts c, orders o, order_items oi
         WHERE ci.cart_id = c.id AND o.id = $1 AND c.user_id = o.user_id
           AND oi.order_id = o.id AND ci.variant_id = oi.variant_id AND ci.updated_at <= o.created_at`, [orderId],
      );
    } else if ((event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') && order.status === 'pending') {
      const items = await client.query<{ variant_id: string | null; quantity: number }>(
        'SELECT variant_id, quantity FROM order_items WHERE order_id = $1 ORDER BY variant_id FOR UPDATE', [orderId],
      );
      for (const item of items.rows) {
        if (!item.variant_id) continue;
        await client.query('UPDATE variants SET stock_quantity = stock_quantity + $1, updated_at = now() WHERE id = $2', [item.quantity, item.variant_id]);
        await client.query(
          `INSERT INTO inventory_transactions (variant_id, quantity_change, transaction_type, reference_id)
           VALUES ($1, $2, 'reservation_release', $3)`, [item.variant_id, item.quantity, orderId],
        );
      }
      await client.query("UPDATE orders SET status = 'cancelled', payment_status = 'failed', updated_at = now() WHERE id = $1", [orderId]);
      await client.query("UPDATE payments SET status = 'failed', updated_at = now() WHERE order_id = $1", [orderId]);
    }

    await client.query('UPDATE stripe_webhook_events SET processed_at = now() WHERE id = $1', [event.id]);
    await client.query('COMMIT');
    response.json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Stripe webhook processing failed', error);
    response.status(500).json({ error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'The payment update could not be processed yet.' } });
  } finally { client.release(); }
});
