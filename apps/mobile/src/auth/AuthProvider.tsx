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
import { getValidAccessToken as getValidMobileAccessToken, mobileAuthApi, onReauthRequired } from '@/api/client';
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

  // A revoked refresh token can be discovered by any screen's call - coreApi, syncApi,
  // not only an explicit getValidAccessToken - so this lands every one of them in the
  // same signed-out state, not only the calls that already went through this provider.
  useEffect(() => {
    return onReauthRequired(() => setState('reauth_required'));
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

  const getValidAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getValidMobileAccessToken();
      if (!token) setState('reauth_required');
      return token;
    } catch {
      // The refresh call failed transiently (offline, server error), not because the
      // server rejected the refresh token, so this is not a sign-out condition.
      return null;
    }
  }, []);

  const startLogin = useCallback(async () => {
    const id = deviceId ?? (await getOrCreateDeviceId());
    setDeviceId(id);
    setState('authorizing');

    const start = await mobileAuthApi.start({ deviceId: id, deviceName: 'Decidarr Mobile' });
    setPendingDeviceCode(start.deviceCode);
    await WebBrowser.openBrowserAsync(start.authUrl);
  }, [deviceId]);

  const completeLogin = useCallback(async () => {
    if (!pendingDeviceCode) {
      throw new Error('Start Plex sign-in first.');
    }
    const id = deviceId ?? (await getOrCreateDeviceId());
    setState('authorizing');

    const result = await mobileAuthApi.exchange({ deviceCode: pendingDeviceCode, deviceId: id });
    await storeTokens(result.accessToken, result.refreshToken, Date.now() + result.expiresIn * 1000);
    await storeUserMetadata(result.user);
    setUser(result.user);
    setPendingDeviceCode(null);
    setState('bootstrapping');
  }, [deviceId, pendingDeviceCode]);

  const logout = useCallback(
    async (clearCache = false) => {
      const refreshToken = await getRefreshToken();
      try {
        await mobileAuthApi.logout({ refreshToken: refreshToken ?? undefined });
      } catch {
        // Revocation is best-effort when offline.
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
