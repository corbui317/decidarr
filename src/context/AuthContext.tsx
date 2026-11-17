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
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const status = await settingsApi.getStatus();

      if (!status.setupComplete) {
        setUser(null);
        setExpiresAt(null);
        setLoading(false);
        return;
      }

      try {
        const me = await authApi.getCurrentUser();
        setUser(me.user);
        setExpiresAt(me.expiresAt);
      } catch {
        setUser(null);
        setExpiresAt(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setUser(null);
      setExpiresAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Silent refresh logic: refresh proactively 24h before expiry
  useEffect(() => {
    if (!user || !expiresAt) return;

    const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
    const timeUntilExpiry = expiresAt - Date.now();
    const timeUntilRefresh = timeUntilExpiry - REFRESH_THRESHOLD_MS;

    const doRefresh = async () => {
      try {
        const response = await authApi.refreshSession();
        setExpiresAt(response.expiresAt);
      } catch {
        setUser(null);
        setExpiresAt(null);
      }
    };

    // If less than 24h left, refresh immediately
    if (timeUntilRefresh <= 0) {
      doRefresh();
      return;
    }

    // Otherwise schedule refresh for expiresAt - 24h
    const refreshTimer = setTimeout(doRefresh, timeUntilRefresh);

    // Re-check on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const remaining = expiresAt - Date.now();
        if (remaining < REFRESH_THRESHOLD_MS) {
          doRefresh();
        }
      }
    };

    // Re-check on window focus
    const handleFocus = () => {
      const remaining = expiresAt - Date.now();
      if (remaining < REFRESH_THRESHOLD_MS) {
        doRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, expiresAt]);

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
    setExpiresAt(null);
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
