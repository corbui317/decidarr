'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { settingsApi, authApi, AuthUser } from '@/lib/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  setAuthenticatedUser: (user: AuthUser) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const status = await settingsApi.getStatus();

      if (!status.setupComplete) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const me = await authApi.getCurrentUser();
        setUser(me.user);
      } catch {
        setUser(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await checkAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [checkAuth]);

  const setAuthenticatedUser = useCallback((authUser: AuthUser) => {
    setUser(authUser);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // still clear local state
    }
    setUser(null);
    window.location.href = '/';
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      logout,
      setAuthenticatedUser,
      isAuthenticated: !!user,
      isAdmin: !!user?.isAdmin,
    }),
    [user, loading, error, login, logout, setAuthenticatedUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
