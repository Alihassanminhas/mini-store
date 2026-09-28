import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type OrderSummary = { id: string; order_number: string; status: string; payment_status: string; total_amount: string; created_at: string };
const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export function OrdersPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    const controller = new AbortController();
    void fetch(`${apiBaseUrl}/orders`, { credentials: 'include', signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { orders?: OrderSummary[]; error?: { message?: string } };
      if (!response.ok || !payload.orders) throw new Error(payload.error?.message ?? 'Your orders could not be loaded.');
      setOrders(payload.orders);
    }).catch((error: unknown) => { if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : 'Your orders could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [user]);

  if (isAuthLoading || isLoading) return <main role="status" className="mx-auto max-w-5xl px-5 py-20 text-center text-[#5067aa]">Loading your orders…</main>;
  if (!user) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">Sign in to see your orders.</h1><Link to="/login" state={{ from: '/orders' }} className="mt-7 inline-block underline">Sign in</Link></main>;
  return <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">Your form&field account</p><h1 className="mt-3 font-serif text-5xl">Order history</h1>
    {errorMessage ? <p role="alert" className="mt-8 rounded bg-red-50 p-5 text-sm text-red-800">{errorMessage}</p> : !orders.length ? <div className="py-16 text-center"><p className="font-serif text-2xl">Nothing ordered just yet.</p><Link to="/products" className="mt-5 inline-block underline">Explore the collection</Link></div> : <div className="mt-8 overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-left text-sm"><thead><tr className="border-b border-[#32457b]/15 text-xs uppercase tracking-wider text-[#5067aa]"><th scope="col" className="py-3">Order</th><th scope="col" className="py-3">Date</th><th scope="col" className="py-3">Payment</th><th scope="col" className="py-3">Status</th><th scope="col" className="py-3 text-right">Total</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-b border-[#32457b]/10"><td className="py-4"><Link className="underline underline-offset-4" to={`/orders/${order.order_number}`}>{order.order_number}</Link></td><td className="py-4">{new Date(order.created_at).toLocaleDateString()}</td><td className="py-4 capitalize">{order.payment_status}</td><td className="py-4 capitalize">{order.status}</td><td className="py-4 text-right">${Number(order.total_amount).toFixed(2)}</td></tr>)}</tbody></table></div>}
  </main>;
}

export function OrderDetailPage() {
  const { orderNumber } = useParams();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [order, setOrder] = useState<(OrderSummary & { subtotal: string; shipping_address: Record<string, string>; items: Array<{ productName: string; variantName: string; sku: string; unitPrice: string; quantity: number; subtotal: string }> }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  useEffect(() => {
    if (!user || !orderNumber) { setIsLoading(false); return; }
    const controller = new AbortController();
    void fetch(`${apiBaseUrl}/orders/${encodeURIComponent(orderNumber)}`, { credentials: 'include', signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { order?: typeof order; error?: { message?: string } };
      if (!response.ok || !payload.order) throw new Error(payload.error?.message ?? 'Order not found.');
      setOrder(payload.order);
    }).catch((error: unknown) => { if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : 'Order details could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [user, orderNumber]);

  if (isAuthLoading || isLoading) return <main role="status" className="mx-auto max-w-4xl px-5 py-20 text-center text-[#5067aa]">Loading order details…</main>;
  if (!user) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">Sign in to view this order.</h1><Link to="/login" className="mt-7 inline-block underline">Sign in</Link></main>;
  if (!order || errorMessage) return <main role="alert" className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">Order not found.</h1><p className="mt-3 text-[#5067aa]">{errorMessage}</p><Link to="/orders" className="mt-6 inline-block underline">Back to order history</Link></main>;
  return <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"><Link to="/orders" className="text-sm text-[#5067aa] underline">← Order history</Link><p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">Order confirmation</p><h1 className="mt-3 font-serif text-4xl">{order.order_number}</h1><p className="mt-2 text-sm text-[#5067aa]">Placed {new Date(order.created_at).toLocaleDateString()}</p><div className="mt-8 flex gap-3 text-sm"><span className="rounded-full bg-[#86a6de]/20 px-4 py-2 capitalize">{order.status}</span><span className="rounded-full bg-[#86a6de]/20 px-4 py-2 capitalize">Payment {order.payment_status}</span></div><div className="mt-10 divide-y divide-[#32457b]/10 border-y border-[#32457b]/10">{order.items.map((item) => <div key={`${item.sku}-${item.variantName}`} className="flex justify-between gap-4 py-5 text-sm"><div><p className="font-medium">{item.productName}</p><p className="mt-1 text-[#5067aa]">{item.variantName} · Qty {item.quantity}</p></div><span>${Number(item.subtotal).toFixed(2)}</span></div>)}</div><div className="mt-6 flex justify-between font-medium"><span>Total</span><span>${Number(order.total_amount).toFixed(2)}</span></div><h2 className="mt-10 font-serif text-2xl">Shipping address</h2><address className="mt-3 text-sm not-italic leading-6 text-[#5067aa]">{order.shipping_address.line1}{order.shipping_address.line2 && <><br />{order.shipping_address.line2}</>}<br />{order.shipping_address.city}{order.shipping_address.region && `, ${order.shipping_address.region}`} {order.shipping_address.postalCode}<br />{order.shipping_address.country}</address></main>;
}
