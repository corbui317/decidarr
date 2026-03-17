'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { settingsApi } from '@/lib/api';

export type AppTheme = 'dark' | 'light' | 'vegas' | 'macao' | 'poker';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  saveTheme: (theme: AppTheme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'decidarr-theme';

function applyTheme(theme: AppTheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function getStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem(STORAGE_KEY) as AppTheme) || 'dark';
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<AppTheme>(getStoredTheme);

  // Apply theme to <html> on mount and whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // On mount, sync theme from server settings (may update from localStorage default)
  useEffect(() => {
    settingsApi.getStatus().then(status => {
      if (status.setupComplete) {
        settingsApi.getSettings().then(settings => {
          const serverTheme = settings.uiPreferences.theme as AppTheme;
          if (serverTheme && serverTheme !== theme) {
            setThemeState(serverTheme);
            localStorage.setItem(STORAGE_KEY, serverTheme);
          }
        }).catch(() => {/* settings not available yet */});
      }
    }).catch(() => {/* status not available yet */});
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  // Persist theme to server settings
  const saveTheme = useCallback(async (newTheme: AppTheme) => {
    setTheme(newTheme);
    await settingsApi.updateSettings({
      uiPreferences: { theme: newTheme },
    });
  }, [setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, saveTheme }),
    [theme, setTheme, saveTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export const THEME_CONFIG: Record<
  AppTheme,
  { label: string; description: string; colors: { bg: string; primary: string; accent: string; surface: string } }
> = {
  dark: {
    label: 'Dark',
    description: 'Sleek dark interface with gold accents',
    colors: { bg: '#0f0f1a', primary: '#E5A00D', accent: '#cc7000', surface: '#1a1a2e' },
  },
  light: {
    label: 'Light',
    description: 'Clean light interface with warm gold',
    colors: { bg: '#f8f8fc', primary: '#d4820a', accent: '#b86a00', surface: '#ffffff' },
  },
  vegas: {
    label: 'Vegas Casino',
    description: 'Bright neon lights, red and gold glam',
    colors: { bg: '#0d0000', primary: '#FFD700', accent: '#FF3D00', surface: '#2a0808' },
  },
  macao: {
    label: 'Macao',
    description: 'Oriental luxury, deep crimson and gold',
    colors: { bg: '#0d0500', primary: '#C9A84C', accent: '#8B0000', surface: '#2d1500' },
  },
  poker: {
    label: 'Underground Poker',
    description: 'Green felt table, smoky atmosphere',
    colors: { bg: '#080e08', primary: '#4a9e4a', accent: '#2d7a2d', surface: '#1a2e1a' },
  },
};
