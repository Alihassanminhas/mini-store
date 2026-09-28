import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { authenticate } from '../middleware/authenticate.js';

export const cartRouter = Router();
cartRouter.use(authenticate);

const variantIdSchema = z.string().regex(/^\d+$/).transform((value) => value);
const quantitySchema = z.object({ quantity: z.coerce.number().int().min(1).max(99) });
const addItemSchema = quantitySchema.extend({ variantId: variantIdSchema });

async function sendCart(userId: string, response: import('express').Response, statusCode = 200): Promise<void> {
  const result = await database.query(
    `SELECT ci.id, ci.variant_id, v.product_id, p.name AS product_name, v.variant_name,
            v.sku, v.price, ci.quantity, (v.stock_quantity > 0) AS in_stock,
            (v.stock_quantity >= ci.quantity) AS quantity_available,
            (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id
             ORDER BY pi.is_primary DESC, pi.id ASC LIMIT 1) AS image_url,
            v.price * ci.quantity AS line_total
     FROM carts c
     JOIN cart_items ci ON ci.cart_id = c.id
     JOIN variants v ON v.id = ci.variant_id
     JOIN products p ON p.id = v.product_id
     WHERE c.user_id = $1 AND p.is_active = true AND v.is_active = true
     ORDER BY ci.created_at ASC`,
    [userId],
  );
  const subtotal = result.rows.reduce((sum, item) => sum + Number(item.line_total), 0);
  response.status(statusCode).json({ cart: { items: result.rows, itemCount: result.rows.reduce((sum, item) => sum + Number(item.quantity), 0), subtotal: subtotal.toFixed(2), total: subtotal.toFixed(2) } });
}

cartRouter.get('/', async (request, response, next) => {
  try { await sendCart(request.user!.id, response); } catch (error) { next(error); }
});

cartRouter.post('/items', async (request, response, next) => {
  const parsed = addItemSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid product and quantity.', details: parsed.error.flatten().fieldErrors } });
    return;
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const variant = await client.query<{ stock_quantity: number; is_active: boolean; product_active: boolean }>(
      `SELECT v.stock_quantity, v.is_active, p.is_active AS product_active
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.id = $1 FOR UPDATE OF v`, [parsed.data.variantId],
    );
    const availableVariant = variant.rows[0];
    if (!availableVariant?.is_active || !availableVariant.product_active) {
      await client.query('ROLLBACK');
      response.status(404).json({ error: { code: 'VARIANT_UNAVAILABLE', message: 'This option is no longer available.' } });
      return;
    }

    const cart = await client.query<{ id: string }>(
      'INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id',
      [request.user!.id],
    );
    const cartId = cart.rows[0]!.id;
    const previous = await client.query<{ quantity: number }>(
      'SELECT quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2 FOR UPDATE',
      [cartId, parsed.data.variantId],
    );
    const nextQuantity = Number(previous.rows[0]?.quantity ?? 0) + parsed.data.quantity;
    if (nextQuantity > Number(availableVariant.stock_quantity)) {
      await client.query('ROLLBACK');
      response.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: 'There are not enough units in stock for that quantity.' } });
      return;
    }

    await client.query(
      `INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
      [cartId, parsed.data.variantId, nextQuantity],
    );
    await client.query('COMMIT');
    await sendCart(request.user!.id, response, 201);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

cartRouter.put('/items/:itemId', async (request, response, next) => {
  const parsedId = variantIdSchema.safeParse(request.params.itemId);
  const parsedBody = quantitySchema.safeParse(request.body);
  if (!parsedId.success || !parsedBody.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid cart quantity.' } });
    return;
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query<{ variant_id: string; stock_quantity: number }>(
      `SELECT ci.variant_id, v.stock_quantity
       FROM cart_items ci JOIN carts c ON c.id = ci.cart_id JOIN variants v ON v.id = ci.variant_id
       WHERE ci.id = $1 AND c.user_id = $2 FOR UPDATE OF ci, v`, [parsedId.data, request.user!.id],
    );
    const item = itemResult.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      response.status(404).json({ error: { code: 'CART_ITEM_NOT_FOUND', message: 'That cart item no longer exists.' } });
      return;
    }
    if (parsedBody.data.quantity > Number(item.stock_quantity)) {
      await client.query('ROLLBACK');
      response.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: 'There are not enough units in stock for that quantity.' } });
      return;
    }
    await client.query('UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2', [parsedBody.data.quantity, parsedId.data]);
    await client.query('COMMIT');
    await sendCart(request.user!.id, response);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

cartRouter.delete('/items/:itemId', async (request, response, next) => {
  const parsedId = variantIdSchema.safeParse(request.params.itemId);
  if (!parsedId.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid cart item.' } });
    return;
  }
  try {
    const result = await database.query(
      `DELETE FROM cart_items ci USING carts c
       WHERE ci.cart_id = c.id AND c.user_id = $1 AND ci.id = $2`, [request.user!.id, parsedId.data],
    );
    if (!result.rowCount) {
      response.status(404).json({ error: { code: 'CART_ITEM_NOT_FOUND', message: 'That cart item no longer exists.' } });
      return;
    }
    await sendCart(request.user!.id, response);
  } catch (error) { next(error); }
});
