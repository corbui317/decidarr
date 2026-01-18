'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { settingsApi, SettingsStatusResponse } from '@/lib/api';

interface AppContextType {
  loading: boolean;
  configured: boolean;
  status: SettingsStatusResponse | null;
  error: string | null;
  checkStatus: () => Promise<void>;
  setConfigured: (value: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<SettingsStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await settingsApi.getStatus();
      setStatus(data);
      setConfigured(data.setupComplete);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check app status');
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const value = useMemo(
    () => ({
      loading,
      configured,
      status,
      error,
      checkStatus,
      setConfigured,
    }),
    [loading, configured, status, error, checkStatus]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
