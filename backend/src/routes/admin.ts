import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/require-admin.js';

export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

const idSchema = z.string().regex(/^\d+$/);
const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(5000).default(''),
  categoryId: z.string().regex(/^\d+$/).nullable().optional(),
  basePrice: z.coerce.number().finite().min(0).max(1_000_000),
  isActive: z.boolean().default(true),
});
const variantSchema = z.object({
  sku: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
  variantName: z.string().trim().min(1).max(120),
  price: z.coerce.number().finite().min(0).max(1_000_000),
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).default(5),
  isActive: z.boolean().default(true),
});

adminRouter.get('/dashboard', async (_request, response, next) => {
  try {
    const [counts, recentOrders, lowStock] = await Promise.all([
      database.query(
        `SELECT (SELECT COUNT(*)::integer FROM products) AS total_products,
                (SELECT COUNT(*)::integer FROM products WHERE is_active) AS active_products,
                (SELECT COUNT(*)::integer FROM orders) AS total_orders,
                (SELECT COUNT(*)::integer FROM orders WHERE status = 'pending') AS pending_orders,
                (SELECT COUNT(*)::integer FROM orders WHERE payment_status = 'paid') AS paid_orders,
                (SELECT COALESCE(SUM(total_amount), 0)::numeric(12,2) FROM orders WHERE payment_status = 'paid') AS paid_revenue,
                (SELECT COUNT(*)::integer FROM variants WHERE is_active AND stock_quantity <= low_stock_threshold) AS low_stock_count`,
      ),
      database.query(
        `SELECT o.order_number, o.status, o.payment_status, o.total_amount, o.created_at, u.name AS customer_name
         FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 8`,
      ),
      database.query(
        `SELECT v.id, v.sku, v.variant_name, v.stock_quantity, v.low_stock_threshold, p.name AS product_name
         FROM variants v JOIN products p ON p.id = v.product_id
         WHERE v.is_active AND v.stock_quantity <= v.low_stock_threshold
         ORDER BY v.stock_quantity ASC, p.name ASC LIMIT 8`,
      ),
    ]);
    response.json({ dashboard: { ...counts.rows[0], recentOrders: recentOrders.rows, lowStockItems: lowStock.rows } });
  } catch (error) { next(error); }
});

adminRouter.get('/products', async (_request, response, next) => {
  try {
    const result = await database.query(
      `SELECT p.id, p.name, p.slug, p.description, p.base_price, p.is_active,
              c.name AS category_name, c.id AS category_id,
              COALESCE(SUM(v.stock_quantity), 0)::integer AS stock_quantity,
              COUNT(v.id)::integer AS variant_count
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN variants v ON v.product_id = p.id GROUP BY p.id, c.name, c.id
       ORDER BY p.updated_at DESC, p.id DESC`,
    );
    response.json({ products: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post('/products', async (request, response, next) => {
  const parsed = productSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the product details.', details: parsed.error.flatten().fieldErrors } });
    return;
  }
  try {
    const result = await database.query(
      `INSERT INTO products (name, slug, description, category_id, base_price, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, slug, description, category_id, base_price, is_active`,
      [parsed.data.name, parsed.data.slug, parsed.data.description, parsed.data.categoryId ?? null, parsed.data.basePrice.toFixed(2), parsed.data.isActive],
    );
    response.status(201).json({ product: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.put('/products/:productId', async (request, response, next) => {
  const parsedId = idSchema.safeParse(request.params.productId);
  const parsed = productSchema.safeParse(request.body);
  if (!parsedId.success || !parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the product details.', details: parsed.success ? undefined : parsed.error.flatten().fieldErrors } });
    return;
  }
  try {
    const result = await database.query(
      `UPDATE products SET name = $1, slug = $2, description = $3, category_id = $4,
       base_price = $5, is_active = $6, updated_at = now() WHERE id = $7
       RETURNING id, name, slug, description, category_id, base_price, is_active`,
      [parsed.data.name, parsed.data.slug, parsed.data.description, parsed.data.categoryId ?? null, parsed.data.basePrice.toFixed(2), parsed.data.isActive, parsedId.data],
    );
    if (!result.rowCount) { response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } }); return; }
    response.json({ product: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.delete('/products/:productId', async (request, response, next) => {
  const parsedId = idSchema.safeParse(request.params.productId);
  if (!parsedId.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid product id.' } }); return; }
  try {
    const result = await database.query('UPDATE products SET is_active = false, updated_at = now() WHERE id = $1', [parsedId.data]);
    if (!result.rowCount) { response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } }); return; }
    response.status(204).end();
  } catch (error) { next(error); }
});

adminRouter.post('/products/:productId/variants', async (request, response, next) => {
  const parsedId = idSchema.safeParse(request.params.productId);
  const parsed = variantSchema.safeParse(request.body);
  if (!parsedId.success || !parsed.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the variant details.' } }); return; }
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO variants (product_id, sku, variant_name, price, stock_quantity, low_stock_threshold, is_active)
       SELECT id, $2, $3, $4, $5, $6, $7 FROM products WHERE id = $1
       RETURNING id, product_id, sku, variant_name, price, stock_quantity, low_stock_threshold, is_active`,
      [parsedId.data, parsed.data.sku, parsed.data.variantName, parsed.data.price.toFixed(2), parsed.data.stockQuantity, parsed.data.lowStockThreshold, parsed.data.isActive],
    );
    if (!result.rowCount) { await client.query('ROLLBACK'); response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } }); return; }
    if (parsed.data.stockQuantity > 0) {
      await client.query(
        `INSERT INTO inventory_transactions (variant_id, quantity_change, transaction_type)
         VALUES ($1, $2, 'restock')`, [result.rows[0]!.id, parsed.data.stockQuantity],
      );
    }
    await client.query('COMMIT');
    response.status(201).json({ variant: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); next(error); }
  finally { client.release(); }
});

adminRouter.put('/variants/:variantId', async (request, response, next) => {
  const parsedId = idSchema.safeParse(request.params.variantId);
  const parsed = variantSchema.safeParse(request.body);
  if (!parsedId.success || !parsed.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the variant details.' } }); return; }
  try {
    const result = await database.query(
      `UPDATE variants SET sku = $1, variant_name = $2, price = $3, low_stock_threshold = $4,
       is_active = $5, updated_at = now() WHERE id = $6
       RETURNING id, product_id, sku, variant_name, price, stock_quantity, low_stock_threshold, is_active`,
      [parsed.data.sku, parsed.data.variantName, parsed.data.price.toFixed(2), parsed.data.lowStockThreshold, parsed.data.isActive, parsedId.data],
    );
    if (!result.rowCount) { response.status(404).json({ error: { code: 'VARIANT_NOT_FOUND', message: 'Variant not found.' } }); return; }
    response.json({ variant: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.delete('/variants/:variantId', async (request, response, next) => {
  const parsedId = idSchema.safeParse(request.params.variantId);
  if (!parsedId.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid variant id.' } }); return; }
  try {
    const result = await database.query('UPDATE variants SET is_active = false, updated_at = now() WHERE id = $1', [parsedId.data]);
    if (!result.rowCount) { response.status(404).json({ error: { code: 'VARIANT_NOT_FOUND', message: 'Variant not found.' } }); return; }
    response.status(204).end();
  } catch (error) { next(error); }
});

adminRouter.get('/inventory', async (_request, response, next) => {
  try {
    const result = await database.query(
      `SELECT v.id, v.sku, v.variant_name, v.stock_quantity, v.low_stock_threshold, v.is_active,
              p.name AS product_name, (v.stock_quantity <= v.low_stock_threshold) AS is_low_stock
       FROM variants v JOIN products p ON p.id = v.product_id
       ORDER BY is_low_stock DESC, p.name ASC, v.variant_name ASC`,
    );
    response.json({ inventory: result.rows });
  } catch (error) { next(error); }
});

const adjustmentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('set'), quantity: z.coerce.number().int().min(0).max(1_000_000) }),
  z.object({ mode: z.literal('increase'), quantity: z.coerce.number().int().min(1).max(1_000_000) }),
  z.object({ mode: z.literal('decrease'), quantity: z.coerce.number().int().min(1).max(1_000_000) }),
]);

adminRouter.post('/inventory/:variantId/adjustments', async (request, response, next) => {
  const parsedId = idSchema.safeParse(request.params.variantId);
  const parsed = adjustmentSchema.safeParse(request.body);
  if (!parsedId.success || !parsed.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid inventory adjustment.' } }); return; }
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const variant = await client.query<{ stock_quantity: number }>('SELECT stock_quantity FROM variants WHERE id = $1 FOR UPDATE', [parsedId.data]);
    if (!variant.rows[0]) { await client.query('ROLLBACK'); response.status(404).json({ error: { code: 'VARIANT_NOT_FOUND', message: 'Variant not found.' } }); return; }
    const currentQuantity = Number(variant.rows[0].stock_quantity);
    const nextQuantity = parsed.data.mode === 'set' ? parsed.data.quantity
      : parsed.data.mode === 'increase' ? currentQuantity + parsed.data.quantity
        : currentQuantity - parsed.data.quantity;
    if (nextQuantity < 0) { await client.query('ROLLBACK'); response.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: 'Inventory cannot be reduced below zero.' } }); return; }
    const delta = nextQuantity - currentQuantity;
    if (delta === 0) { await client.query('ROLLBACK'); response.status(400).json({ error: { code: 'NO_INVENTORY_CHANGE', message: 'The adjustment would not change stock.' } }); return; }
    await client.query('UPDATE variants SET stock_quantity = $1, updated_at = now() WHERE id = $2', [nextQuantity, parsedId.data]);
    const transactionType = delta > 0 && parsed.data.mode === 'increase' ? 'restock' : 'adjustment';
    await client.query(
      'INSERT INTO inventory_transactions (variant_id, quantity_change, transaction_type) VALUES ($1, $2, $3)',
      [parsedId.data, delta, transactionType],
    );
    await client.query('COMMIT');
    response.json({ inventory: { variantId: parsedId.data, previousQuantity: currentQuantity, stockQuantity: nextQuantity, quantityChange: delta } });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

adminRouter.get('/orders', async (request, response, next) => {
  const status = z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).optional().safeParse(request.query.status);
  if (!status.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid order status filter.' } }); return; }
  try {
    const result = await database.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_amount, o.created_at,
              u.name AS customer_name, u.email AS customer_email
       FROM orders o JOIN users u ON u.id = o.user_id
       WHERE ($1::order_status IS NULL OR o.status = $1)
       ORDER BY o.created_at DESC LIMIT 200`, [status.data ?? null],
    );
    response.json({ orders: result.rows });
  } catch (error) { next(error); }
});

adminRouter.get('/orders/:orderNumber', async (request, response, next) => {
  try {
    const result = await database.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.subtotal, o.shipping_amount,
              o.total_amount, o.shipping_name AS customer_name, o.shipping_email AS customer_email,
              o.shipping_phone AS customer_phone, o.shipping_address, o.created_at, o.updated_at,
              COALESCE(json_agg(json_build_object(
                'product_name', oi.product_name, 'variant_name', oi.variant_name, 'sku', oi.sku,
                'unit_price', oi.unit_price, 'quantity', oi.quantity, 'subtotal', oi.subtotal
              )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.order_number = $1 GROUP BY o.id`, [request.params.orderNumber],
    );
    if (!result.rows[0]) { response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } }); return; }
    response.json({ order: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.put('/orders/:orderId/status', async (request, response, next) => {
  const parsedId = idSchema.safeParse(request.params.orderId);
  const parsedStatus = z.enum(['processing', 'shipped', 'delivered']).safeParse(request.body?.status);
  if (!parsedId.success || !parsedStatus.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid fulfillment status.' } }); return; }
  const allowedTransitions: Record<string, string[]> = { paid: ['processing'], processing: ['shipped'], shipped: ['delivered'] };
  try {
    const current = await database.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [parsedId.data]);
    const currentStatus = current.rows[0]?.status;
    if (!currentStatus) { response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } }); return; }
    if (!allowedTransitions[currentStatus]?.includes(parsedStatus.data)) {
      response.status(409).json({ error: { code: 'INVALID_STATUS_TRANSITION', message: `Order cannot move from ${currentStatus} to ${parsedStatus.data}.` } });
      return;
    }
    const result = await database.query(
      'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 AND status = $3 RETURNING id, order_number, status',
      [parsedStatus.data, parsedId.data, currentStatus],
    );
    if (!result.rowCount) { response.status(409).json({ error: { code: 'ORDER_UPDATED', message: 'The order changed. Refresh before trying again.' } }); return; }
    response.json({ order: result.rows[0] });
  } catch (error) { next(error); }
});
