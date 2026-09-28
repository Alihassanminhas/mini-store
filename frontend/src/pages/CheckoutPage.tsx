import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export function CheckoutPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { cart, isLoading: isCartLoading } = useCart();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    if (!user) return;
    setName((currentName) => currentName || user.name);
    setEmail((currentEmail) => currentEmail || user.email);
  }, [user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/orders/checkout/session`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, address: { line1, line2, city, region, postalCode, country } }),
      });
      const payload = await response.json() as { checkoutUrl?: string; error?: { message?: string } };
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error?.message ?? 'Secure checkout could not be started.');
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Secure checkout could not be started.');
      setIsSubmitting(false);
    }
  }

  if (isAuthLoading || isCartLoading) return <main role="status" className="mx-auto max-w-4xl px-5 py-24 text-center text-[#5067aa]">Preparing your checkout…</main>;
  if (!user) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">Sign in to check out.</h1><p className="mt-3 text-[#5067aa]">Your bag is saved to your account.</p><Link to="/login" state={{ from: '/checkout' }} className="mt-7 inline-block rounded-full bg-[#32457b] px-7 py-3 text-sm text-white">Sign in</Link></main>;
  if (!cart.items.length) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">Your bag is empty.</h1><Link to="/products" className="mt-7 inline-block underline">Explore the collection</Link></main>;

  return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
    <Link to="/cart" className="text-sm text-[#5067aa] underline underline-offset-4">← Return to bag</Link><h1 className="mt-4 font-serif text-5xl">Checkout</h1>
    <div className="mt-10 grid gap-12 md:grid-cols-[1fr_340px]">
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-8">
        <section><h2 className="font-serif text-2xl">Contact details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2" htmlFor="shipping-name">Full name<input id="shipping-name" required maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
          <label className="text-sm font-medium" htmlFor="shipping-email">Email<input id="shipping-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
          <label className="text-sm font-medium" htmlFor="shipping-phone">Phone<input id="shipping-phone" type="tel" required maxLength={40} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
        </div></section>
        <section><h2 className="font-serif text-2xl">Shipping address</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2" htmlFor="address-line1">Address<input id="address-line1" required maxLength={160} autoComplete="address-line1" value={line1} onChange={(event) => setLine1(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
          <label className="text-sm font-medium sm:col-span-2" htmlFor="address-line2">Apartment, suite, etc. <span className="font-normal text-[#5067aa]">(optional)</span><input id="address-line2" maxLength={160} autoComplete="address-line2" value={line2} onChange={(event) => setLine2(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
          <label className="text-sm font-medium" htmlFor="city">City<input id="city" required maxLength={100} autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
          <label className="text-sm font-medium" htmlFor="region">State / region<input id="region" maxLength={100} autoComplete="address-level1" value={region} onChange={(event) => setRegion(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
          <label className="text-sm font-medium" htmlFor="postal-code">Postal code<input id="postal-code" required maxLength={24} autoComplete="postal-code" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label>
          <label className="text-sm font-medium" htmlFor="country">Country<select id="country" value={country} onChange={(event) => setCountry(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal"><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="PK">Pakistan</option><option value="AU">Australia</option></select></label>
        </div></section>
        {errorMessage && <p role="alert" className="rounded bg-red-50 p-4 text-sm text-red-800">{errorMessage}</p>}
        <button disabled={isSubmitting} className="w-full rounded-full bg-[#32457b] px-6 py-4 text-sm font-medium text-white hover:bg-[#5067aa] disabled:opacity-60">{isSubmitting ? 'Preparing secure payment…' : 'Continue to secure payment'}</button>
        <p className="text-center text-xs text-[#5067aa]">You’ll complete payment securely on Stripe. This store uses test mode.</p>
      </form>
      <aside className="h-fit bg-white p-6"><h2 className="font-serif text-2xl">Order summary</h2><div className="mt-5 space-y-4">{cart.items.map((item) => <div className="flex justify-between gap-4 text-sm" key={item.id}><span>{item.quantity} × {item.product_name} <span className="block text-xs text-[#5067aa]">{item.variant_name}</span></span><span className="whitespace-nowrap">${Number(item.line_total).toFixed(2)}</span></div>)}</div><div className="mt-6 flex justify-between border-t border-[#32457b]/10 pt-5 font-medium"><span>Total</span><span>${Number(cart.total).toFixed(2)}</span></div><p className="mt-2 text-xs text-[#5067aa]">Shipping is free during the preview.</p></aside>
    </div>
  </main>;
}
