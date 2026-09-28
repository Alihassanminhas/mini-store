import { database } from '../config/database.js';

/** Releases inventory held by a pending order, exactly once, in one transaction. */
export async function releaseInventoryReservation(orderId: string): Promise<void> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query<{ status: string }>('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (order.rows[0]?.status !== 'pending') { await client.query('ROLLBACK'); return; }
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
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
