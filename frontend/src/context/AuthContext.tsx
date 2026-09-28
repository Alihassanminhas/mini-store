import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type StoreUser = { id: string; email: string; name: string; role: 'user' | 'admin' };
type AuthContextValue = {
  user: StoreUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const AuthContext = createContext<AuthContextValue | null>(null);

async function requestUser(path: string, body?: Record<string, string>, method?: 'POST' | 'PATCH'): Promise<StoreUser> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    credentials: 'include',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null) as { user?: StoreUser; error?: { message?: string } } | null;
  if (!response.ok || !payload?.user) {
    throw new Error(payload?.error?.message ?? 'We could not complete that request. Please try again.');
  }
  return payload.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoreUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void requestUser('/auth/me').then((currentUser) => {
      if (isMounted) setUser(currentUser);
    }).catch(() => {
      if (isMounted) setUser(null);
    }).finally(() => {
      if (isMounted) setIsLoading(false);
    });
    return () => { isMounted = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await requestUser('/auth/login', { email, password }));
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setUser(await requestUser('/auth/register', { name, email, password }));
  }, []);

  const updateProfile = useCallback(async (name: string) => {
    setUser(await requestUser('/auth/me', { name }, 'PATCH'));
  }, []);

  const logout = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new Error('We could not sign you out. Please try again.');
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, register, updateProfile, logout }), [user, isLoading, login, register, updateProfile, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
