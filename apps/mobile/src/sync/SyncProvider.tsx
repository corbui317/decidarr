import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SyncClientState } from '@decidarr/api-contracts';
import { syncApi, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import {
  getSyncState,
  saveBootstrapData,
  setSyncState,
} from '@/db/database';
import {
  getPendingCount,
  getPendingMutations,
  removeMutation,
  updateMutationStatus,
} from '@/sync/queue';

interface SyncContextValue {
  state: SyncClientState;
  lastSyncAt: string | null;
  pendingCount: number;
  bootstrap: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncStateLocal] = useState<SyncClientState>('signed_out');
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  const bootstrap = useCallback(async () => {
    if (!auth.user) return;
    const token = await auth.getValidAccessToken();
    if (!token) {
      setSyncStateLocal('reauth_required');
      return;
    }

    setSyncStateLocal('bootstrapping');
    try {
      const data = await syncApi.bootstrap();
      await saveBootstrapData(data.entities);
      await setSyncState('cursor', data.cursor);
      const now = new Date().toISOString();
      await setSyncState('lastSyncAt', now);
      setLastSyncAt(now);
      setSyncStateLocal(auth.isOnline ? 'ready_online' : 'ready_offline');
    } catch (err) {
      const cached = await getSyncState('lastSyncAt');
      if (cached) {
        setLastSyncAt(cached);
        setSyncStateLocal(auth.isOnline ? 'ready_online' : 'ready_offline');
      } else {
        setSyncStateLocal(auth.isOnline ? 'ready_online' : 'ready_offline');
      }
      if (err instanceof ApiError && err.status === 401) {
        setSyncStateLocal('reauth_required');
      }
    }
  }, [auth]);

  const processQueue = useCallback(async () => {
    if (syncingRef.current || !auth.isOnline) return;
    const token = await auth.getValidAccessToken();
    if (!token) return;

    const pending = await getPendingMutations();
    if (pending.length === 0) return;

    syncingRef.current = true;
    setSyncStateLocal('syncing');

    try {
      const result = await syncApi.mutations(pending);
      for (const item of result.results) {
        if (item.status === 'applied' || item.status === 'duplicate') {
          await removeMutation(item.mutationId);
        } else if (item.status === 'conflict') {
          await updateMutationStatus(item.mutationId, 'conflict');
          setSyncStateLocal('conflict');
        }
      }
      await setSyncState('cursor', result.nextCursor);
      const now = new Date().toISOString();
      await setSyncState('lastSyncAt', now);
      setLastSyncAt(now);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        await bootstrap();
        return;
      }
      for (const mutation of pending) {
        await updateMutationStatus(mutation.mutationId, 'failed');
      }
    } finally {
      syncingRef.current = false;
      await refreshPendingCount();
      if (syncState !== 'conflict') {
        setSyncStateLocal(auth.isOnline ? 'ready_online' : 'ready_offline');
      }
    }
  }, [auth, bootstrap, refreshPendingCount, syncState]);

  const syncNow = useCallback(async () => {
    if (!auth.isOnline) return;
    const cursor = (await getSyncState('cursor')) ?? '';
    const token = await auth.getValidAccessToken();
    if (!token) return;

    setSyncStateLocal('syncing');
    try {
      const changes = await syncApi.changes(cursor);
      if (changes.changes.length > 0) {
        await bootstrap();
      }
      await setSyncState('cursor', changes.nextCursor);
      await processQueue();
      const now = new Date().toISOString();
      await setSyncState('lastSyncAt', now);
      setLastSyncAt(now);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        await bootstrap();
        await processQueue();
      }
    } finally {
      setSyncStateLocal(auth.isOnline ? 'ready_online' : 'ready_offline');
    }
  }, [auth, bootstrap, processQueue]);

  useEffect(() => {
    (async () => {
      const stored = await getSyncState('lastSyncAt');
      if (stored) setLastSyncAt(stored);
      await refreshPendingCount();
    })();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (auth.state === 'bootstrapping' && auth.user) {
      bootstrap();
    }
  }, [auth.state, auth.user, bootstrap]);

  useEffect(() => {
    if (auth.isOnline && (syncState === 'ready_online' || syncState === 'ready_offline')) {
      syncNow();
    }
  }, [auth.isOnline, syncState, syncNow]);

  useEffect(() => {
    setSyncStateLocal(
      auth.state === 'signed_out' || auth.state === 'authorizing'
        ? auth.state
        : syncState
    );
  }, [auth.state, syncState]);

  const value = useMemo(
    () => ({
      state: syncState,
      lastSyncAt,
      pendingCount,
      bootstrap,
      syncNow,
    }),
    [syncState, lastSyncAt, pendingCount, bootstrap, syncNow]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
