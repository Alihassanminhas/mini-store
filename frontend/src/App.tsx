import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider, useCart } from './context/CartContext';
import { AuthPage } from './pages/AuthPage';
import { CartPage } from './pages/CartPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderDetailPage, OrdersPage } from './pages/OrdersPage';
import { PaymentResultPage } from './pages/PaymentResultPage';
import { AdminDashboardPage, AdminGate, AdminInventoryPage, AdminOrderDetailPage, AdminOrdersPage, AdminProductsPage } from './pages/AdminPages';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';

type HealthState = 'checking' | 'connected' | 'unavailable';
type StoreTheme = 'light' | 'dark';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

function App() {
  return <AuthProvider><CartProvider><StoreApp /></CartProvider></AuthProvider>;
}

function StoreApp() {
  const [health, setHealth] = useState<HealthState>('checking');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<StoreTheme>(() => {
    try {
      return window.localStorage.getItem('store-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const { user, isLoading, logout } = useAuth();
  const { cart } = useCart();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('store-theme', theme);
    } catch (error) {
      console.warn('Could not save the selected theme', error);
    }
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();

    async function checkApiHealth(): Promise<void> {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, { signal: controller.signal });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        setHealth('connected');
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Could not reach the store API', error);
          setHealth('unavailable');
        }
      }
    }

    void checkApiHealth();
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f8f8] text-[#32457b]">
      <div className="bg-[#32457b] px-4 py-2 text-center text-xs font-medium tracking-wide text-white">
        Thoughtfully made essentials · Free shipping over $75
      </div>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="font-serif text-2xl font-semibold tracking-tight" to="/" aria-label="Form and Field home">
          form<span className="text-[#5067aa]">&</span>field
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm sm:flex">
          <Link to="/products" className="transition hover:text-[#5067aa]">Shop</Link>
          <a href="#story" className="transition hover:text-[#5067aa]">Our story</a>
          {user && <Link to="/orders" className="transition hover:text-[#5067aa]">Orders</Link>}
          {user?.role === 'admin' && <Link to="/admin" className="transition hover:text-[#5067aa]">Admin</Link>}
        </nav>
        <div className="flex items-center gap-4 text-sm">
          {isLoading ? <span className="hidden text-[#5067aa] sm:inline" aria-label="Checking account">…</span> : user ? <><Link className="hidden sm:inline hover:text-[#5067aa]" to="/account">Hi, {user.name.split(' ')[0]}</Link><button className="hidden sm:inline hover:text-[#5067aa]" onClick={() => void logout().catch((error: unknown) => console.error('Could not sign out', error))}>Sign out</button></> : <Link className="hidden sm:inline hover:text-[#5067aa]" to="/login">Sign in</Link>}
          <button type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-pressed={theme === 'dark'} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme((currentTheme) => currentTheme === 'light' ? 'dark' : 'light')} className="rounded-full border border-[#32457b]/20 px-3 py-2 transition hover:bg-[#86a6de]/20">
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span><span className="sr-only">{theme === 'light' ? 'Dark theme' : 'Light theme'}</span>
          </button>
          <Link className="rounded-full border border-[#32457b]/20 px-4 py-2 hover:bg-[#86a6de]/20" to="/cart" aria-label={`Shopping bag, ${cart.itemCount} items`}>
            Bag <span className="ml-1 text-[#5067aa]">({cart.itemCount})</span>
          </Link>
        </div>
        <button type="button" aria-expanded={isMobileMenuOpen} aria-controls="mobile-navigation" onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)} className="rounded-full border border-[#32457b]/20 px-3 py-2 text-xs sm:hidden">{isMobileMenuOpen ? 'Close' : 'Menu'}</button>
      </header>
      {isMobileMenuOpen && <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-[#32457b]/10 bg-[#f8f8f8] px-5 py-3 sm:hidden"><div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-3 text-sm"><Link onClick={() => setIsMobileMenuOpen(false)} to="/products">Shop</Link>{user ? <><Link onClick={() => setIsMobileMenuOpen(false)} to="/account">My account</Link><Link onClick={() => setIsMobileMenuOpen(false)} to="/orders">Orders</Link>{user.role === 'admin' && <Link onClick={() => setIsMobileMenuOpen(false)} to="/admin">Admin</Link>}<button onClick={() => void logout().then(() => setIsMobileMenuOpen(false)).catch((error: unknown) => console.error('Could not sign out', error))}>Sign out</button></> : <><Link onClick={() => setIsMobileMenuOpen(false)} to="/login">Sign in</Link><Link onClick={() => setIsMobileMenuOpen(false)} to="/register">Create account</Link></>}</div></nav>}

      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:slug" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/payment/success" element={<PaymentResultPage mode="success" />} />
        <Route path="/payment/cancelled" element={<PaymentResultPage mode="cancelled" />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderNumber" element={<OrderDetailPage />} />
        <Route path="/account" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminGate />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="inventory" element={<AdminInventoryPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="orders/:orderNumber" element={<AdminOrderDetailPage />} />
        </Route>
        <Route path="/" element={<Home health={health} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <footer id="story" className="mt-20 border-t border-[#32457b]/10 px-5 py-10 text-center text-sm text-[#5067aa]">
        <p className="font-serif text-lg text-[#32457b]">form&field</p>
        <p className="mt-2">Good things for everyday living.</p>
      </footer>
    </div>
  );
}

function Home({ health }: { health: HealthState }) {
  const [featuredProducts, setFeaturedProducts] = useState<Array<{ id: string; name: string; slug: string; starting_price: string; image_url: string; image_alt: string }> | null>(null);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiBaseUrl}/products?sort=newest&pageSize=4`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Featured products could not be loaded.');
      const payload = await response.json() as { products: typeof featuredProducts };
      setFeaturedProducts(payload.products);
    }).catch((error: unknown) => { if (!controller.signal.aborted) { console.error('Could not load new products', error); setFeaturedProducts(null); } })
      .finally(() => { if (!controller.signal.aborted) setIsProductsLoading(false); });
    return () => controller.abort();
  }, []);
  return (
    <main>
      <section className="home-hero-surface relative mx-auto grid min-h-560px max-w-7xl overflow-hidden bg-[#86a6de]/20 md:grid-cols-2">
        <div className="flex flex-col justify-center px-7 py-16 sm:px-14 lg:px-20">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-[#5067aa]">The everyday collection</p>
          <h1 className="max-w-lg font-serif text-5xl leading-[1.06] tracking-tight sm:text-6xl">A little more intention in every day.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[#5067aa]">Useful, quietly beautiful objects for the rituals that make a home feel like yours.</p>
          <Link to="/products" className="mt-9 w-fit rounded-full bg-[#32457b] px-7 py-3 text-sm font-medium text-white transition hover:bg-[#5067aa]">Explore the collection <span aria-hidden="true">↗</span></Link>
          <p role="status" className="mt-8 text-xs text-[#5067aa]">
            {health === 'checking' ? 'Connecting to the store…' : health === 'connected' ? 'Store services are online.' : 'Store services are starting. Check the API connection.'}
          </p>
        </div>
        <div className="home-hero-media relative min-h-72 bg-[#86a6de]/40">
          <img
            src="https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1400&q=85"
            alt="Warm, sunlit interior with a simple wooden chair and natural textures"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute bottom-5 right-5 rounded-full bg-white/85 px-4 py-2 text-xs text-[#32457b]">Objects to keep close</span>
        </div>
      </section>

      <section id="collection" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">Made for the long run</p><h2 className="mt-3 font-serif text-4xl">Find your everyday.</h2></div>
          <p className="max-w-sm text-sm leading-6 text-[#5067aa]">A considered edit of pieces that earn their place, made with materials that get better with time.</p>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-3">
          {[
            { name: 'The slow morning', detail: 'Mugs, linens & coffee tools', image: 'photo-1495474472287-4d71bcdd2085', category: 'kitchen-dining' },
            { name: 'A softer space', detail: 'Objects for home & rest', image: 'photo-1616486338812-3dadae4b4ace', category: 'home-living' },
            { name: 'Carry it with you', detail: 'Daily bags & small goods', image: 'photo-1544816155-12df9643f363', category: 'bags-carry' },
          ].map((category) => (
            <Link to={`/products?category=${category.category}`} className="group" key={category.name}>
              <div className="aspect-4/5 overflow-hidden bg-[#86a6de]/20"><img src={`https://images.unsplash.com/${category.image}?auto=format&fit=crop&w=900&q=80`} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /></div>
              <h3 className="mt-4 font-serif text-2xl">{category.name}</h3><p className="mt-1 text-sm text-[#5067aa]">{category.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-24"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">Just arrived</p><h2 className="mt-3 font-serif text-4xl">New to the shelf.</h2></div><Link to="/products?sort=newest" className="hidden text-sm underline underline-offset-4 sm:inline">View everything →</Link></div>
        {isProductsLoading ? <div role="status" aria-label="Loading new products" className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-4/5 animate-pulse bg-[#86a6de]/20" />)}</div> : featuredProducts?.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{featuredProducts.map((product) => <Link to={`/products/${product.slug}`} key={product.id} className="group"><div className="aspect-4/5 overflow-hidden bg-[#86a6de]/20">{product.image_url && <img loading="lazy" src={product.image_url} alt={product.image_alt || product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />}</div><div className="mt-3 flex justify-between gap-3"><h3 className="font-serif text-lg">{product.name}</h3><span className="whitespace-nowrap text-sm">${Number(product.starting_price).toFixed(2)}</span></div></Link>)}</div> : <div className="mt-8 bg-[#86a6de]/20 px-6 py-10 text-center text-sm text-[#5067aa]">New pieces are on their way. Browse the full collection in the meantime.</div>}
      </section>
    </main>
  );
}

export default App;
