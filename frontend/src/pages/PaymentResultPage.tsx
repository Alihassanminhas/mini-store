import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
type PaymentOrder = { order_number: string; status: string; payment_status: string; total_amount: string };

export function PaymentResultPage({ mode }: { mode: 'success' | 'cancelled' }) {
  const [searchParams] = useSearchParams();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { refresh: refreshCart } = useCart();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(mode === 'success');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (mode !== 'success' || !sessionId || !user) { setIsLoading(false); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loadOrder(): Promise<void> {
      try {
        for (let attempt = 0; attempt < 10 && !controller.signal.aborted; attempt += 1) {
          const response = await fetch(`${apiBaseUrl}/orders/session/${encodeURIComponent(sessionId!)}`, { credentials: 'include', signal: controller.signal });
          const payload = await response.json() as { order?: PaymentOrder; error?: { message?: string } };
          if (!response.ok || !payload.order) throw new Error(payload.error?.message ?? 'Order confirmation could not be loaded.');
          setOrder(payload.order);
          if (payload.order.payment_status === 'paid' || payload.order.status === 'cancelled' || attempt === 9) break;
          await new Promise<void>((resolve) => { timer = setTimeout(resolve, 3000); });
        }
        await refreshCart().catch((error: unknown) => console.error('Could not refresh bag after payment', error));
      } catch (error) {
        if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : 'Order confirmation could not be loaded.');
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    }

    void loadOrder();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [mode, sessionId, user, refreshCart]);

  if (mode === 'cancelled') return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">Payment not completed</p><h1 className="mt-3 font-serif text-4xl">Your bag is still here.</h1><p className="mt-4 text-sm leading-6 text-[#5067aa]">No payment was confirmed. Your items are held briefly while Stripe closes the session; you can return to your bag and try again.</p><Link to="/cart" className="mt-7 inline-block rounded-full bg-[#32457b] px-7 py-3 text-sm text-white">Return to your bag</Link></main>;
  if (isAuthLoading || isLoading) return <main role="status" className="mx-auto max-w-3xl px-5 py-24 text-center"><p className="font-serif text-3xl">Confirming your payment…</p><p className="mt-3 text-sm text-[#5067aa]">Your order will appear as soon as Stripe confirms it.</p></main>;
  if (!user) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">Sign in to view your order.</h1><Link to="/login" state={{ from: `/payment/success?session_id=${encodeURIComponent(sessionId ?? '')}` }} className="mt-7 inline-block underline">Sign in</Link></main>;
  if (errorMessage || !order) return <main role="alert" className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">We’re still waiting for confirmation.</h1><p className="mt-3 text-sm text-[#5067aa]">{errorMessage || 'The confirmation is taking longer than expected.'}</p><Link to="/orders" className="mt-6 inline-block underline">Check your orders</Link></main>;
  return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">{order.payment_status === 'paid' ? 'Payment confirmed' : 'Payment processing'}</p><h1 className="mt-3 font-serif text-4xl">{order.payment_status === 'paid' ? 'Thank you for your order.' : 'Your order is almost there.'}</h1><p className="mt-4 text-sm leading-6 text-[#5067aa]">Order <span className="font-medium text-[#32457b]">{order.order_number}</span> · ${Number(order.total_amount).toFixed(2)}</p><p className="mt-2 text-sm text-[#5067aa]">{order.payment_status === 'paid' ? 'We’ve received your test payment and saved your order.' : 'We’re checking the payment with Stripe. Refresh your order history in a moment.'}</p><Link to={`/orders/${order.order_number}`} className="mt-7 inline-block rounded-full bg-[#32457b] px-7 py-3 text-sm text-white">View order</Link></main>;
}
