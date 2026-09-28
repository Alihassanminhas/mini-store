import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

type ProductDetail = { id: string; name: string; slug: string; description: string; category_name: string; category_slug: string; images: Array<{ id: string; image_url: string; alt_text: string; is_primary: boolean }>; variants: Array<{ id: string; variant_name: string; price: string; in_stock: boolean }> };
const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export function ProductDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { addItem, isUpdating } = useCart();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    void fetch(`${apiBaseUrl}/products/${encodeURIComponent(slug ?? '')}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { product?: ProductDetail; error?: { message?: string } };
      if (!response.ok || !payload.product) throw new Error(payload.error?.message ?? 'Product not found.');
      setProduct(payload.product);
      setSelectedVariantId(payload.product.variants.find((variant) => variant.in_stock)?.id ?? '');
    }).catch((error: unknown) => { if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : 'Product could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [slug]);

  async function handleAddToBag(): Promise<void> {
    if (!user) { setNotice('Sign in or create an account to save this piece to your bag.'); return; }
    const variant = product?.variants.find((item) => item.id === selectedVariantId);
    if (!product || !variant) return;
    try {
      await addItem({ variantId: variant.id, productName: product.name, variantName: variant.variant_name, price: Number(variant.price), imageUrl: product.images[0]?.image_url ?? '' }, quantity);
      setNotice('Added to your bag.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'This item could not be added.'); }
  }

  if (isLoading) return <main role="status" className="mx-auto max-w-7xl animate-pulse px-5 py-16"><div className="grid gap-10 md:grid-cols-2"><div className="aspect-square bg-[#86a6de]/20" /><div className="h-80 bg-[#86a6de]/20" /></div></main>;
  if (errorMessage || !product) return <main role="alert" className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">We couldn’t find that piece.</h1><p className="mt-3 text-[#5067aa]">{errorMessage}</p><Link to="/products" className="mt-6 inline-block underline underline-offset-4">Back to the collection</Link></main>;

  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId);
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <Link to="/products" className="text-sm text-[#5067aa] underline underline-offset-4">← The collection</Link>
    <div className="mt-7 grid gap-10 md:grid-cols-2 md:gap-16">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{product.images.length ? product.images.map((image) => <img key={image.id} src={image.image_url} alt={image.alt_text || product.name} className="aspect-4/5 w-full bg-[#86a6de]/20 object-cover" />) : <div className="flex aspect-square items-center justify-center bg-[#86a6de]/20 text-[#5067aa]">Image coming soon</div>}</div>
      <section className="py-3"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">{product.category_name}</p><h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">{product.name}</h1><p className="mt-4 text-xl">${Number(selectedVariant?.price ?? product.variants[0]?.price ?? '0').toFixed(2)}</p><p className="mt-6 leading-7 text-[#5067aa]">{product.description}</p>
        <fieldset className="mt-8"><legend className="text-sm font-medium">Choose an option</legend><div className="mt-3 flex flex-wrap gap-2">{product.variants.map((variant) => <button key={variant.id} type="button" disabled={!variant.in_stock} aria-pressed={variant.id === selectedVariantId} onClick={() => setSelectedVariantId(variant.id)} className={`rounded-full border px-4 py-2 text-sm ${variant.id === selectedVariantId ? 'border-[#5067aa] bg-[#32457b] text-white' : 'border-[#32457b]/20'} disabled:cursor-not-allowed disabled:opacity-40`}>{variant.variant_name}{!variant.in_stock && ' · Sold out'}</button>)}</div></fieldset>
        <div className="mt-7 flex items-center gap-4"><label htmlFor="quantity" className="text-sm font-medium">Quantity</label><input id="quantity" type="number" min="1" max="10" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(10, Number(event.target.value))))} className="w-20 rounded border border-[#32457b]/20 bg-white px-3 py-2.5" /></div>
        <button onClick={() => void handleAddToBag()} disabled={!selectedVariant?.in_stock || isUpdating} className="mt-7 w-full rounded-full bg-[#32457b] px-7 py-4 text-sm font-medium text-white hover:bg-[#5067aa] disabled:cursor-not-allowed disabled:opacity-50">{isUpdating ? 'Adding…' : selectedVariant?.in_stock ? 'Add to bag' : 'Sold out'}</button>
        {notice && <p role="status" className="mt-4 text-sm text-[#32457b]">{notice}{notice.startsWith('Sign in') && <> <Link to="/login" className="underline">Sign in</Link> or <Link to="/register" className="underline">create an account</Link>.</>}</p>}
        <p className="mt-6 border-t border-[#32457b]/10 pt-5 text-sm leading-6 text-[#5067aa]">Thoughtful materials. Easy everyday care. Packed with care and sent straight to your door.</p>
      </section>
    </div>
  </main>;
}
