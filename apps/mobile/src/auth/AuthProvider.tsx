import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as WebBrowser from 'expo-web-browser';
import type { SyncClientState } from '@decidarr/api-contracts';
import { mobileAuthApi, syncApi } from '@/api/client';
import {
  clearSecureSession,
  getAccessToken,
  getOrCreateDeviceId,
  getRefreshToken,
  getUserMetadata,
  storeTokens,
  storeUserMetadata,
  type StoredUserMetadata,
} from '@/auth/session';
import { clearLocalData } from '@/db/database';

interface AuthContextValue {
  state: SyncClientState;
  user: StoredUserMetadata | null;
  deviceId: string | null;
  isOnline: boolean;
  pendingDeviceCode: string | null;
  startLogin: () => Promise<void>;
  completeLogin: () => Promise<void>;
  logout: (clearCache?: boolean) => Promise<void>;
  getValidAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncClientState>('signed_out');
  const [user, setUser] = useState<StoredUserMetadata | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingDeviceCode, setPendingDeviceCode] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((info) => {
      setIsOnline(info.isConnected ?? false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    (async () => {
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
      const token = await getAccessToken();
      const metadata = await getUserMetadata();
      if (token && metadata) {
        setUser(metadata);
        setState('bootstrapping');
      }
    })();
  }, []);

  const refreshTokens = useCallback(async (): Promise<string | null> => {
    const refreshToken = await getRefreshToken();
    const id = deviceId ?? (await getOrCreateDeviceId());
    if (!refreshToken) return null;

    try {
      const result = await mobileAuthApi.refresh(refreshToken, id);
      await storeTokens(result.accessToken, result.refreshToken);
      return result.accessToken;
    } catch {
      setState('reauth_required');
      return null;
    }
  }, [deviceId]);

  const getValidAccessToken = useCallback(async (): Promise<string | null> => {
    const token = await getAccessToken();
    if (!token) return refreshTokens();
    return token;
  }, [refreshTokens]);

  const startLogin = useCallback(async () => {
    const id = deviceId ?? (await getOrCreateDeviceId());
    setDeviceId(id);
    setState('authorizing');

    const start = await mobileAuthApi.start(id, 'Decidarr Mobile');
    setPendingDeviceCode(start.deviceCode);
    await WebBrowser.openBrowserAsync(start.authUrl);
  }, [deviceId]);

  const completeLogin = useCallback(async () => {
    if (!pendingDeviceCode) {
      throw new Error('Start Plex sign-in first.');
    }
    const id = deviceId ?? (await getOrCreateDeviceId());
    setState('authorizing');

    const result = await mobileAuthApi.exchange(pendingDeviceCode, id);
    await storeTokens(result.accessToken, result.refreshToken);
    await storeUserMetadata(result.user);
    setUser(result.user);
    setPendingDeviceCode(null);
    setState('bootstrapping');
  }, [deviceId, pendingDeviceCode]);

  const logout = useCallback(
    async (clearCache = false) => {
      const token = await getAccessToken();
      const refreshToken = await getRefreshToken();
      if (token) {
        try {
          await mobileAuthApi.logout(token, refreshToken ?? undefined);
        } catch {
          // Revocation is best-effort when offline.
        }
      }
      await clearSecureSession();
      if (clearCache) {
        await clearLocalData();
      }
      setUser(null);
      setState('signed_out');
    },
    []
  );

  const value = useMemo(
    () => ({
      state,
      user,
      deviceId,
      isOnline,
      pendingDeviceCode,
      startLogin,
      completeLogin,
      logout,
      getValidAccessToken,
    }),
    [state, user, deviceId, isOnline, pendingDeviceCode, startLogin, completeLogin, logout, getValidAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
