import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error?.message : undefined;
    throw new Error(message ?? 'The admin request could not be completed.');
  }
  return payload as T;
}

export function AdminGate() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <main role="status" className="p-16 text-center text-[#5067aa]">Checking administrator access…</main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== 'admin') return <main className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="font-serif text-4xl">Administrator access required.</h1><Link to="/" className="mt-5 inline-block underline">Back to the store</Link></main>;
  return <AdminLayout />;
}

function AdminLayout() {
  const { logout } = useAuth();
  const navigation = [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/products', label: 'Products', end: false },
    { to: '/admin/inventory', label: 'Inventory', end: false },
    { to: '/admin/orders', label: 'Orders', end: false },
  ];
  return <div className="min-h-[75vh] bg-[#f8f8f8] md:grid md:grid-cols-[240px_1fr]">
    <aside className="border-b border-[#32457b]/10 bg-[#32457b] px-5 py-6 text-white md:border-b-0 md:px-6"><Link to="/admin" className="font-serif text-xl">form&field <span className="text-xs text-white/60">admin</span></Link><nav aria-label="Admin navigation" className="mt-6 flex gap-2 overflow-x-auto md:flex-col">{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `whitespace-nowrap rounded px-3 py-2 text-sm ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{item.label}</NavLink>)}</nav><button onClick={() => void logout().catch((error: unknown) => console.error('Could not sign out from admin', error))} className="mt-6 px-3 text-left text-xs text-white/60 underline underline-offset-4">Sign out</button></aside>
    <section className="min-w-0 px-5 py-8 sm:px-8 md:py-10"><Outlet /></section>
  </div>;
}

export function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<{ total_products: number; active_products: number; total_orders: number; pending_orders: number; paid_orders: number; paid_revenue: string; low_stock_count: number; recentOrders: Array<{ order_number: string; customer_name: string; status: string; total_amount: string }>; lowStockItems: Array<{ product_name: string; variant_name: string; stock_quantity: number }> } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const load = useCallback(() => adminRequest<{ dashboard: NonNullable<typeof dashboard> }>('/admin/dashboard').then((payload) => setDashboard(payload.dashboard)).catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Dashboard could not be loaded.')), []);
  useEffect(() => { void load(); }, [load]);
  if (errorMessage) return <ErrorPanel message={errorMessage} retry={() => void load()} />;
  if (!dashboard) return <p role="status" className="text-sm text-[#5067aa]">Loading dashboard…</p>;
  const metrics = [
    ['Active products', dashboard.active_products], ['Orders', dashboard.total_orders], ['Pending orders', dashboard.pending_orders],
    ['Paid revenue', `$${Number(dashboard.paid_revenue).toFixed(2)}`], ['Paid orders', dashboard.paid_orders], ['Low stock items', dashboard.low_stock_count],
  ];
  return <><PageHeading eyebrow="Store operations" title="Overview" /><div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="bg-white p-5"><p className="text-sm text-[#5067aa]">{label}</p><p className="mt-3 font-serif text-3xl">{value}</p></div>)}</div><div className="mt-10 grid gap-8 xl:grid-cols-2"><section><h2 className="font-serif text-2xl">Recent orders</h2><div className="mt-4 divide-y divide-[#32457b]/10 bg-white">{dashboard.recentOrders.map((order) => <div className="flex justify-between gap-4 px-4 py-3 text-sm" key={order.order_number}><span>{order.order_number}<span className="block text-xs text-[#5067aa]">{order.customer_name} · {order.status}</span></span><span>${Number(order.total_amount).toFixed(2)}</span></div>)}{!dashboard.recentOrders.length && <p className="p-4 text-sm text-[#5067aa]">No orders yet.</p>}</div></section><section><h2 className="font-serif text-2xl">Low stock</h2><div className="mt-4 divide-y divide-[#32457b]/10 bg-white">{dashboard.lowStockItems.map((item, index) => <div className="flex justify-between gap-4 px-4 py-3 text-sm" key={`${item.product_name}-${item.variant_name}-${index}`}><span>{item.product_name}<span className="block text-xs text-[#5067aa]">{item.variant_name}</span></span><span>{item.stock_quantity} left</span></div>)}{!dashboard.lowStockItems.length && <p className="p-4 text-sm text-[#5067aa]">Everything is stocked up.</p>}</div></section></div></>;
}

type AdminProduct = { id: string; name: string; slug: string; description: string; base_price: string; is_active: boolean; category_id: string | null; category_name: string | null; stock_quantity: number; variant_count: number };
type Category = { id: string; name: string };

export function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const load = useCallback(async () => {
    const [productPayload, categoryPayload] = await Promise.all([
      adminRequest<{ products: AdminProduct[] }>('/admin/products'),
      adminRequest<{ categories: Category[] }>('/categories'),
    ]);
    setProducts(productPayload.products);
    setCategories(categoryPayload.categories);
  }, []);
  useEffect(() => { void load().catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Products could not be loaded.')); }, [load]);

  async function saveProduct(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const productBody = { name: String(data.get('name')), slug: String(data.get('slug')), description: String(data.get('description')), categoryId: String(data.get('categoryId') || '') || null, basePrice: String(data.get('basePrice')), isActive: data.get('isActive') === 'on' };
    try {
      await adminRequest(editingProduct ? `/admin/products/${editingProduct.id}` : '/admin/products', { method: editingProduct ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productBody) });
      setShowForm(false); setEditingProduct(null); setSuccessMessage('Product saved.'); setErrorMessage(''); await load();
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Product could not be saved.'); }
  }

  async function deactivateProduct(product: AdminProduct): Promise<void> {
    try { await adminRequest(`/admin/products/${product.id}`, { method: 'DELETE' }); setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_active: false } : item)); setSuccessMessage(`${product.name} is now unavailable.`); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Product could not be updated.'); }
  }

  async function addVariant(event: FormEvent<HTMLFormElement>, product: AdminProduct): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = { sku: String(data.get('sku')), variantName: String(data.get('variantName')), price: String(data.get('price')), stockQuantity: String(data.get('stockQuantity')) };
    try { await adminRequest(`/admin/products/${product.id}/variants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setSuccessMessage(`Variant added to ${product.name}.`); form.reset(); await load(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Variant could not be added.'); }
  }

  return <><PageHeading eyebrow="Catalog management" title="Products" /><div className="mt-6 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-[#5067aa]">{products.length} products</p><button onClick={() => { setEditingProduct(null); setShowForm((value) => !value); }} className="rounded-full bg-[#32457b] px-5 py-2.5 text-sm text-white">{showForm ? 'Close form' : 'Add product'}</button></div>
    {errorMessage && <ErrorPanel message={errorMessage} retry={() => { setErrorMessage(''); void load().catch((error: unknown) => setErrorMessage(String(error))); }} />}{successMessage && <p role="status" className="mt-4 bg-[#86a6de]/20] p-3 text-sm text-[#32457b]">{successMessage}</p>}
    {showForm && <form className="mt-6 grid gap-4 bg-white p-5 md:grid-cols-2" onSubmit={(event) => void saveProduct(event)}><h2 className="font-serif text-2xl md:col-span-2">{editingProduct ? 'Edit product' : 'New product'}</h2><label className="text-sm" htmlFor="product-name">Name<input id="product-name" name="name" required minLength={2} defaultValue={editingProduct?.name} className="admin-input" /></label><label className="text-sm" htmlFor="product-slug">URL slug<input id="product-slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={editingProduct?.slug} className="admin-input" /></label><label className="text-sm" htmlFor="product-price">Base price<input id="product-price" name="basePrice" type="number" step="0.01" min="0" required defaultValue={editingProduct?.base_price ?? '0.00'} className="admin-input" /></label><label className="text-sm" htmlFor="product-category">Category<select id="product-category" name="categoryId" defaultValue={editingProduct?.category_id ?? ''} className="admin-input"><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-sm md:col-span-2" htmlFor="product-description">Description<textarea id="product-description" name="description" rows={3} defaultValue={editingProduct?.description} className="admin-input" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={editingProduct?.is_active ?? true} />Available to customers</label><div className="md:col-span-2"><button className="rounded-full bg-[#32457b] px-5 py-2.5 text-sm text-white">Save product</button></div></form>}
    <div className="mt-6 space-y-4">{products.map((product) => <article key={product.id} className="bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-3"><h2 className="font-serif text-xl">{product.name}</h2><span className={`rounded-full px-2.5 py-1 text-xs ${product.is_active ? 'bg-[#86a6de]/20] text-[#32457b]' : 'bg-[#86a6de]/20] text-[#5067aa]'}`}>{product.is_active ? 'Available' : 'Hidden'}</span></div><p className="mt-1 text-xs text-[#5067aa]">/{product.slug} · {product.category_name ?? 'Uncategorised'} · ${Number(product.base_price).toFixed(2)}</p><p className="mt-1 text-xs text-[#5067aa]">{product.variant_count} variants · {product.stock_quantity} units</p></div><div className="flex gap-3"><button onClick={() => { setEditingProduct(product); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-sm underline underline-offset-4">Edit</button>{product.is_active && <button onClick={() => void deactivateProduct(product)} className="text-sm text-red-800 underline underline-offset-4">Deactivate</button>}</div></div>
      <details className="mt-4 border-t border-[#32457b]/10 pt-4"><summary className="cursor-pointer text-sm font-medium">Add a variant</summary><form onSubmit={(event) => void addVariant(event, product)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs" htmlFor={`sku-${product.id}`}>SKU<input id={`sku-${product.id}`} name="sku" required className="admin-input" /></label><label className="text-xs" htmlFor={`variant-${product.id}`}>Option<input id={`variant-${product.id}`} name="variantName" required className="admin-input" /></label><label className="text-xs" htmlFor={`variant-price-${product.id}`}>Price<input id={`variant-price-${product.id}`} name="price" type="number" min="0" step="0.01" required className="admin-input" /></label><label className="text-xs" htmlFor={`variant-stock-${product.id}`}>Initial stock<input id={`variant-stock-${product.id}`} name="stockQuantity" type="number" min="0" step="1" required className="admin-input" /></label><button className="w-fit rounded-full border border-[#32457b] px-4 py-2 text-xs text-[#32457b] sm:col-span-2 lg:col-span-4">Create variant</button></form></details>
      <ImageUpload product={product} onUploaded={() => setSuccessMessage('Product image uploaded.')} onError={setErrorMessage} />
    </article>)}</div>
  </>;
}

function ImageUpload({ product, onUploaded, onError }: { product: AdminProduct; onUploaded: () => void; onError: (message: string) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setIsUploading(true);
    try { await adminRequest(`/admin/products/${product.id}/images`, { method: 'POST', body: data }); onUploaded(); form.reset(); }
    catch (error) { onError(error instanceof Error ? error.message : 'Image could not be uploaded.'); }
    finally { setIsUploading(false); }
  }
  return <details className="mt-4 border-t border-[#32457b]/10 pt-4"><summary className="cursor-pointer text-sm font-medium">Upload an image</summary><form onSubmit={(event) => void upload(event)} className="mt-3 flex flex-wrap items-end gap-3"><label className="text-xs" htmlFor={`image-${product.id}`}>Image (JPG, PNG, WEBP; up to 5 MB)<input id={`image-${product.id}`} name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-2 block max-w-full text-xs" /></label><label className="text-xs" htmlFor={`alt-${product.id}`}>Alt text<input id={`alt-${product.id}`} name="altText" maxLength={300} className="admin-input" /></label><label className="flex items-center gap-2 text-xs"><input name="isPrimary" type="checkbox" value="true" />Primary image</label><button disabled={isUploading} className="rounded-full border border-[#32457b] px-4 py-2 text-xs disabled:opacity-50">{isUploading ? 'Uploading…' : 'Upload image'}</button></form></details>;
}

type InventoryItem = { id: string; sku: string; variant_name: string; stock_quantity: number; low_stock_threshold: number; is_active: boolean; product_name: string; is_low_stock: boolean };
export function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const load = useCallback(() => adminRequest<{ inventory: InventoryItem[] }>('/admin/inventory').then((payload) => setItems(payload.inventory)).catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Inventory could not be loaded.')), []);
  useEffect(() => { void load(); }, [load]);
  async function adjust(event: FormEvent<HTMLFormElement>, item: InventoryItem): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try { await adminRequest(`/admin/inventory/${item.id}/adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: String(data.get('mode')), quantity: data.get('quantity') }) }); await load(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Inventory could not be updated.'); }
  }
  return <><PageHeading eyebrow="Stock and availability" title="Inventory" /><p className="mt-3 text-sm text-[#5067aa]">Adjustments are recorded in the inventory history and cannot reduce stock below zero.</p>{errorMessage && <ErrorPanel message={errorMessage} retry={() => { setErrorMessage(''); void load(); }} />}<div className="mt-7 overflow-x-auto bg-white"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="border-b border-[#32457b]/10 text-xs uppercase tracking-wider text-[#5067aa]"><th className="p-4">Product / option</th><th className="p-4">SKU</th><th className="p-4">On hand</th><th className="p-4">Adjustment</th><th className="p-4">Availability</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-[#32457b]/10"><td className="p-4">{item.product_name}<span className="block text-xs text-[#5067aa]">{item.variant_name}</span></td><td className="p-4 text-xs">{item.sku}</td><td className={`p-4 font-medium ${item.is_low_stock ? 'text-amber-800' : ''}`}>{item.stock_quantity}<span className="block text-xs font-normal text-[#5067aa]">Low at {item.low_stock_threshold}</span></td><td className="p-4"><form onSubmit={(event) => void adjust(event, item)} className="flex items-center gap-2"><label className="sr-only" htmlFor={`adjust-${item.id}`}>Adjustment mode</label><select name="mode" className="rounded border border-[#32457b]/20 bg-white px-2 py-2 text-xs"><option value="increase">Add</option><option value="decrease">Remove</option><option value="set">Set to</option></select><label className="sr-only" htmlFor={`quantity-${item.id}`}>Adjustment amount</label><input id={`quantity-${item.id}`} name="quantity" type="number" min="0" max="1000000" defaultValue="1" className="w-20 rounded border border-[#32457b]/20 px-2 py-2 text-xs" /><button className="rounded-full bg-[#32457b] px-3 py-2 text-xs text-white">Save</button></form></td><td className="p-4">{item.is_active ? 'Active' : 'Disabled'}</td></tr>)}</tbody></table>{!items.length && <p className="p-6 text-sm text-[#5067aa]">No variants to stock yet. Add one from Products.</p>}</div></>;
}

type AdminOrder = { id: string; order_number: string; status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'; payment_status: string; total_amount: string; customer_name: string; customer_email: string; created_at: string };
export function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const load = useCallback(() => adminRequest<{ orders: AdminOrder[] }>(`/admin/orders${statusFilter ? `?status=${statusFilter}` : ''}`).then((payload) => setOrders(payload.orders)).catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Orders could not be loaded.')), [statusFilter]);
  useEffect(() => { void load(); }, [load]);
  async function updateStatus(order: AdminOrder, status: string): Promise<void> {
    try { await adminRequest(`/admin/orders/${order.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); await load(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Order status could not be changed.'); }
  }
  return <><PageHeading eyebrow="Customer fulfillment" title="Orders" /><div className="mt-6"><label htmlFor="order-status" className="sr-only">Filter order status</label><select id="order-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-full border border-[#32457b]/20 bg-white px-4 py-2.5 text-sm"><option value="">All orders</option>{['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => <option className="capitalize" value={status} key={status}>{status}</option>)}</select></div>{errorMessage && <ErrorPanel message={errorMessage} retry={() => { setErrorMessage(''); void load(); }} />}<div className="mt-5 overflow-x-auto bg-white"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="border-b border-[#32457b]/10 text-xs uppercase tracking-wider text-[#5067aa]"><th className="p-4">Order</th><th className="p-4">Customer</th><th className="p-4">Payment</th><th className="p-4">Total</th><th className="p-4">Fulfillment</th><th className="p-4">Update</th></tr></thead><tbody>{orders.map((order) => { const nextStatus = order.status === 'paid' ? 'processing' : order.status === 'processing' ? 'shipped' : order.status === 'shipped' ? 'delivered' : ''; return <tr key={order.id} className="border-b border-[#32457b]/10"><td className="p-4"><Link className="underline" to={`/admin/orders/${order.order_number}`}>{order.order_number}</Link><span className="block text-xs text-[#5067aa]">{new Date(order.created_at).toLocaleDateString()}</span></td><td className="p-4">{order.customer_name}<span className="block text-xs text-[#5067aa]">{order.customer_email}</span></td><td className="p-4 capitalize">{order.payment_status}</td><td className="p-4">${Number(order.total_amount).toFixed(2)}</td><td className="p-4 capitalize">{order.status}</td><td className="p-4">{nextStatus ? <button onClick={() => void updateStatus(order, nextStatus)} className="rounded-full border border-[#32457b] px-3 py-2 text-xs capitalize">Mark {nextStatus}</button> : <span className="text-xs text-[#5067aa]">—</span>}</td></tr>; })}</tbody></table>{!orders.length && <p className="p-6 text-sm text-[#5067aa]">No orders to display.</p>}</div></>;
}

export function AdminOrderDetailPage() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState<{ order_number: string; status: string; payment_status: string; total_amount: string; customer_name: string; customer_email: string; customer_phone: string; shipping_address: Record<string, string>; items: Array<{ product_name: string; variant_name: string; sku: string; unit_price: string; quantity: number; subtotal: string }> } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const load = useCallback(() => adminRequest<{ order: NonNullable<typeof order> }>(`/admin/orders/${encodeURIComponent(orderNumber ?? '')}`).then((payload) => setOrder(payload.order)).catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Order could not be loaded.')), [orderNumber]);
  useEffect(() => { void load(); }, [load]);
  async function advanceOrder(): Promise<void> {
    if (!order) return;
    const nextStatus = order.status === 'paid' ? 'processing' : order.status === 'processing' ? 'shipped' : order.status === 'shipped' ? 'delivered' : null;
    if (!nextStatus) return;
    try { await adminRequest(`/admin/orders/${encodeURIComponent(orderNumber ?? '')}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) }); await load(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Order status could not be updated.'); }
  }
  if (errorMessage && !order) return <ErrorPanel message={errorMessage} retry={() => { setErrorMessage(''); void load(); }} />;
  if (!order) return <p role="status" className="text-sm text-[#5067aa]">Loading order…</p>;
  const nextStatus = order.status === 'paid' ? 'processing' : order.status === 'processing' ? 'shipped' : order.status === 'shipped' ? 'delivered' : null;
  return <><Link to="/admin/orders" className="text-sm text-[#5067aa] underline">← Orders</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><PageHeading eyebrow="Order details" title={order.order_number} />{nextStatus && <button onClick={() => void advanceOrder()} className="rounded-full bg-[#32457b] px-5 py-3 text-sm text-white">Mark {nextStatus}</button>}</div>{errorMessage && <ErrorPanel message={errorMessage} retry={() => setErrorMessage('')} />}<p className="mt-4 text-sm">Status: <span className="capitalize">{order.status}</span> · Payment: <span className="capitalize">{order.payment_status}</span></p><section className="mt-8 bg-white p-5"><h2 className="font-serif text-2xl">Customer</h2><p className="mt-3 text-sm">{order.customer_name} · {order.customer_email} · {order.customer_phone}</p><h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-[#5067aa]">Ship to</h3><address className="mt-2 text-sm not-italic leading-6">{order.shipping_address.line1}<br />{order.shipping_address.line2}<br />{order.shipping_address.city}, {order.shipping_address.region} {order.shipping_address.postalCode}<br />{order.shipping_address.country}</address></section><section className="mt-8 bg-white p-5"><h2 className="font-serif text-2xl">Items</h2><div className="mt-4 divide-y divide-[#32457b]/10">{order.items.map((item) => <div key={`${item.sku}-${item.variant_name}`} className="flex justify-between gap-4 py-4 text-sm"><span>{item.product_name}<span className="block text-xs text-[#5067aa]">{item.variant_name} · {item.sku} · Qty {item.quantity}</span></span><span>${Number(item.subtotal).toFixed(2)}</span></div>)}</div><p className="mt-4 flex justify-between border-t border-[#32457b]/10 pt-4 font-medium"><span>Total</span><span>${Number(order.total_amount).toFixed(2)}</span></p></section></>;
}

function PageHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">{eyebrow}</p><h1 className="mt-2 font-serif text-4xl">{title}</h1></header>; }
function ErrorPanel({ message, retry }: { message: string; retry: () => void }) { return <p role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-4 bg-red-50 p-4 text-sm text-red-800">{message}<button className="underline" onClick={retry}>Try again</button></p>; }
