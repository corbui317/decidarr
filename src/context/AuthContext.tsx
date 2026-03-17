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

      // App is configured, now verify the session by calling an authenticated endpoint
      try {
        const me = await authApi.getCurrentUser();
        console.log('[Auth] Session valid, user:', me.user.username);
        setUser({
          username: me.user.username,
          plexServerUrl: me.user.serverUrl || '',
        });
      } catch (authErr) {
        // Session cookie might be missing or invalid
        console.log('[Auth] Session check failed:', authErr instanceof Error ? authErr.message : 'Unknown');
        // Still show as "authenticated" based on status if setup is complete
        // This allows the dashboard to load and show a proper error
        if (status.plexUsername) {
          setUser({
            username: status.plexUsername,
            plexServerUrl: '',
          });
        } else {
          setUser(null);
        }
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
    // In single-user mode, logout just clears the local state
    // The user can re-access by refreshing the page
    setUser(null);
    // Optionally redirect to home page
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
