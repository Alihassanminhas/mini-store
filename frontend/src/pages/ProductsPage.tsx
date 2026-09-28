import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

type Product = { id: string; name: string; slug: string; description: string; category_name: string; starting_price: string; in_stock: boolean; image_url: string; image_alt: string };
type Category = { id: string; name: string; slug: string; product_count: number };
type Listing = { products: Product[]; pagination: { page: number; pageSize: number; total: number; pageCount: number } };
const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [minimumPrice, setMinimumPrice] = useState(searchParams.get('minPrice') ?? '');
  const [maximumPrice, setMaximumPrice] = useState(searchParams.get('maxPrice') ?? '');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const query = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const sort = searchParams.get('sort') ?? 'featured';

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiBaseUrl}/categories`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Categories could not be loaded.');
      const payload = await response.json() as { categories: Category[] };
      setCategories(payload.categories);
    }).catch((error: unknown) => { if (!controller.signal.aborted) console.error('Could not load categories', error); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams(searchParams);
    parameters.set('pageSize', '24');
    setIsLoading(true);
    setErrorMessage('');
    void fetch(`${apiBaseUrl}/products?${parameters.toString()}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as Listing & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'Products could not be loaded.');
      setListing(payload);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : 'Products could not be loaded.');
    }).finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [searchParams]);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput.trim()) next.set('q', searchInput.trim()); else next.delete('q');
    if (minimumPrice) next.set('minPrice', minimumPrice); else next.delete('minPrice');
    if (maximumPrice) next.set('maxPrice', maximumPrice); else next.delete('maxPrice');
    next.delete('page');
    setSearchParams(next);
  }

  function setFilter(key: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="mb-10 border-b border-[#32457b]/10 pb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">The form&field edit</p><h1 className="mt-3 font-serif text-5xl">The collection</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#5067aa]">Considered essentials for home, table and all the little things you carry through your day.</p></div>
      <form className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_180px_180px_140px_140px]" onSubmit={submitSearch} role="search">
        <label htmlFor="product-search" className="sr-only">Search the collection</label><input id="product-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search the collection" className="min-w-0 flex-1 rounded-full border border-[#32457b]/20 bg-white px-5 py-3 text-sm outline-none focus:border-[#5067aa]" />
        <label htmlFor="minimum-price" className="sr-only">Minimum price</label><input id="minimum-price" aria-label="Minimum price" type="number" min="0" step="0.01" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} placeholder="Min price" className="min-w-0 rounded-full border border-[#32457b]/20 bg-white px-4 py-3 text-sm" />
        <label htmlFor="maximum-price" className="sr-only">Maximum price</label><input id="maximum-price" aria-label="Maximum price" type="number" min="0" step="0.01" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder="Max price" className="min-w-0 rounded-full border border-[#32457b]/20 bg-white px-4 py-3 text-sm" />
        <label htmlFor="category-filter" className="sr-only">Filter by category</label><select id="category-filter" value={category} onChange={(event) => setFilter('category', event.target.value)} className="rounded-full border border-[#32457b]/20 bg-white px-4 py-3 text-sm"><option value="">All categories</option>{categories.map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select>
        <label htmlFor="sort-products" className="sr-only">Sort products</label><select id="sort-products" value={sort} onChange={(event) => setFilter('sort', event.target.value)} className="rounded-full border border-[#32457b]/20 bg-white px-4 py-3 text-sm"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select>
        <button className="rounded-full bg-[#32457b] px-6 py-3 text-sm font-medium text-white hover:bg-[#5067aa]">Search</button>
      </form>

      {isLoading ? <div role="status" aria-label="Loading products" className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div className="animate-pulse" key={index}><div className="aspect-4/5 bg-[#86a6de]/20" /><div className="mt-4 h-4 w-2/3 bg-[#86a6de]/20" /><div className="mt-2 h-4 w-1/3 bg-[#86a6de]/20" /></div>)}</div>
        : errorMessage ? <div role="alert" className="rounded bg-red-50 p-6 text-sm text-red-800">{errorMessage}<button onClick={() => setSearchParams(new URLSearchParams(searchParams))} className="ml-3 underline">Try again</button></div>
          : !listing?.products.length ? <div className="py-20 text-center"><h2 className="font-serif text-3xl">Nothing here just yet.</h2><p className="mt-2 text-sm text-[#5067aa]">Try another search or explore all categories.</p><button onClick={() => { setSearchInput(''); setSearchParams(new URLSearchParams()); }} className="mt-5 underline underline-offset-4">Clear filters</button></div>
            : <><p className="mb-5 text-sm text-[#5067aa]">{listing.pagination.total} {listing.pagination.total === 1 ? 'piece' : 'pieces'}</p><div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{listing.products.map((product) => <Link to={`/products/${product.slug}`} className="group" key={product.id}>
              <div className="relative aspect-4/5 overflow-hidden bg-[#86a6de]/20">{product.image_url ? <img src={product.image_url} alt={product.image_alt || product.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-sm text-[#5067aa]">Image coming soon</div>}<span className={`absolute bottom-3 left-3 rounded-full px-3 py-1.5 text-xs ${product.in_stock ? 'border-b-2 border-[#5067aa] bg-[#f8f8f8]/90 text-[#32457b]' : 'bg-[#86a6de]/45 text-[#32457b]'}`}>{product.in_stock ? 'In stock' : 'Sold out'}</span></div>
              <p className="mt-4 text-xs text-[#5067aa]">{product.category_name}</p><div className="mt-1 flex items-start justify-between gap-3"><h2 className="font-serif text-xl">{product.name}</h2><span className="whitespace-nowrap text-sm">${Number(product.starting_price).toFixed(2)}</span></div><p className="mt-2 line-clamp-2 text-sm leading-5 text-[#5067aa]">{product.description}</p>
            </Link>)}</div>{listing.pagination.pageCount > 1 && <nav aria-label="Product pages" className="mt-10 flex items-center justify-center gap-5"><button disabled={listing.pagination.page <= 1} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(listing.pagination.page - 1)); setSearchParams(next); }} className="rounded-full border border-[#32457b]/20 px-5 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-[#5067aa]">Page {listing.pagination.page} of {listing.pagination.pageCount}</span><button disabled={listing.pagination.page >= listing.pagination.pageCount} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(listing.pagination.page + 1)); setSearchParams(next); }} className="rounded-full border border-[#32457b]/20 px-5 py-2 text-sm disabled:opacity-40">Next</button></nav>}</>}
    </main>
  );
}
