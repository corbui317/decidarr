'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { settingsApi, authApi } from '@/lib/api';

interface User {
  username: string;
  plexServerUrl: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // First check if app is configured
      const status = await settingsApi.getStatus();
      
      if (!status.setupComplete) {
        console.log('[Auth] Setup not complete');
        setUser(null);
        setLoading(false);
        return;
      }

      // App is configured — verify the session cookie is valid
      try {
        const me = await authApi.getCurrentUser();
        console.log('[Auth] Session valid, user:', me.user.username);
        setUser({
          username: me.user.username,
          plexServerUrl: me.user.serverUrl || '',
        });
      } catch (authErr) {
        // Session cookie is missing or expired — user must log in
        console.log('[Auth] Session invalid or missing:', authErr instanceof Error ? authErr.message : 'Unknown');
        // Do NOT fall back to plexUsername from status — that would bypass authentication
        setUser(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      console.error('[Auth] Status check failed:', errorMessage);
      setError(errorMessage);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await checkAuth();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call the logout API to clear the server-side session cookie
      await authApi.logout();
      console.log('[Auth] Logged out successfully');
    } catch (err) {
      // Log but don't block - we still want to clear local state
      console.warn('[Auth] Logout API call failed:', err instanceof Error ? err.message : 'Unknown error');
    }
    
    // Always clear local state and redirect
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
      isAuthenticated: !!user,
    }),
    [user, loading, error, login, logout]
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
