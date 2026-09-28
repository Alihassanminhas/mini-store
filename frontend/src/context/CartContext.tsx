import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type CartItem = {
  id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  price: string;
  quantity: number;
  image_url: string | null;
  line_total: string;
  in_stock: boolean;
  quantity_available: boolean;
};
export type CartData = { items: CartItem[]; itemCount: number; subtotal: string; total: string };
type NewCartItem = { variantId: string; productName: string; variantName: string; price: number; imageUrl: string };
type CartContextValue = {
  cart: CartData;
  isLoading: boolean;
  isUpdating: boolean;
  errorMessage: string;
  refresh: () => Promise<void>;
  addItem: (item: NewCartItem, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const emptyCart: CartData = { items: [], itemCount: 0, subtotal: '0.00', total: '0.00' };
const CartContext = createContext<CartContextValue | null>(null);

async function readCart(response: Response): Promise<CartData> {
  const payload = await response.json().catch(() => null) as { cart?: CartData; error?: { message?: string } } | null;
  if (!response.ok || !payload?.cart) throw new Error(payload?.error?.message ?? 'Your bag could not be updated. Please try again.');
  return payload.cart;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartData>(emptyCart);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!user) { setCart(emptyCart); return; }
    setIsLoading(true);
    try {
      setCart(await readCart(await fetch(`${apiBaseUrl}/cart`, { credentials: 'include' })));
      setErrorMessage('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Your bag could not be loaded.';
      setErrorMessage(message);
      throw error;
    } finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => {
    void refresh().catch((error: unknown) => console.error('Could not load shopping bag', error));
  }, [refresh]);

  const addItem = useCallback(async (newItem: NewCartItem, quantity = 1) => {
    if (!user) throw new Error('Sign in to add items to your bag.');
    const previousCart = cart;
    const matchingItem = cart.items.find((item) => item.variant_id === newItem.variantId);
    const nextItems = matchingItem
      ? cart.items.map((item) => item.variant_id === newItem.variantId ? { ...item, quantity: item.quantity + quantity, line_total: ((item.quantity + quantity) * Number(item.price)).toFixed(2) } : item)
      : [...cart.items, { id: `pending-${newItem.variantId}`, variant_id: newItem.variantId, product_name: newItem.productName, variant_name: newItem.variantName, price: newItem.price.toFixed(2), quantity, image_url: newItem.imageUrl || null, line_total: (newItem.price * quantity).toFixed(2), in_stock: true, quantity_available: true }];
    const optimisticSubtotal = nextItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    setCart({ items: nextItems, itemCount: nextItems.reduce((sum, item) => sum + item.quantity, 0), subtotal: optimisticSubtotal.toFixed(2), total: optimisticSubtotal.toFixed(2) });
    setIsUpdating(true);
    setErrorMessage('');
    try {
      setCart(await readCart(await fetch(`${apiBaseUrl}/cart/items`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variantId: newItem.variantId, quantity }) })));
    } catch (error) {
      setCart(previousCart);
      setErrorMessage(error instanceof Error ? error.message : 'The item could not be added.');
      throw error;
    } finally { setIsUpdating(false); }
  }, [cart, user]);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    const previousCart = cart;
    const nextItems = cart.items.map((item) => item.id === itemId ? { ...item, quantity, line_total: (Number(item.price) * quantity).toFixed(2) } : item);
    const optimisticSubtotal = nextItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    setCart({ items: nextItems, itemCount: nextItems.reduce((sum, item) => sum + item.quantity, 0), subtotal: optimisticSubtotal.toFixed(2), total: optimisticSubtotal.toFixed(2) });
    setIsUpdating(true);
    try {
      setCart(await readCart(await fetch(`${apiBaseUrl}/cart/items/${itemId}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity }) })));
    } catch (error) { setCart(previousCart); throw error; }
    finally { setIsUpdating(false); }
  }, [cart]);

  const removeItem = useCallback(async (itemId: string) => {
    const previousCart = cart;
    const nextItems = cart.items.filter((item) => item.id !== itemId);
    const optimisticSubtotal = nextItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    setCart({ items: nextItems, itemCount: nextItems.reduce((sum, item) => sum + item.quantity, 0), subtotal: optimisticSubtotal.toFixed(2), total: optimisticSubtotal.toFixed(2) });
    setIsUpdating(true);
    try {
      setCart(await readCart(await fetch(`${apiBaseUrl}/cart/items/${itemId}`, { method: 'DELETE', credentials: 'include' })));
    } catch (error) { setCart(previousCart); throw error; }
    finally { setIsUpdating(false); }
  }, [cart]);

  const value = useMemo(() => ({ cart, isLoading, isUpdating, errorMessage, refresh, addItem, updateQuantity, removeItem }), [cart, isLoading, isUpdating, errorMessage, refresh, addItem, updateQuantity, removeItem]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
