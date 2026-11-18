import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SpinResult } from '@/components/SpinResult';
import { coreApi } from '@/api/client';
import { canSpin } from '@/sync/state';
import { getCachedPreferences } from '@/db/database';

interface SpinResultData {
  title: string;
  year?: number;
  plexId: string;
  mediaType: string;
  playLinks?: { ios?: string; android?: string; web?: string };
}

export default function SpinScreen() {
  const auth = useAuth();
  const sync = useSync();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResultData | null>(null);
  const [libraries, setLibraries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const prefs = await getCachedPreferences();
      if (prefs?.selectedLibraries && Array.isArray(prefs.selectedLibraries)) {
        setLibraries(prefs.selectedLibraries as string[]);
      }
    })();
  }, [sync.lastSyncAt]);

  if (!auth.user) {
    return <Redirect href="/login" />;
  }

  const spinAllowed = canSpin(sync.state, auth.isOnline);

  const handleSpin = useCallback(async () => {
    if (!spinAllowed) {
      Alert.alert(
        'Offline',
        auth.isOnline
          ? 'Wait for sync to finish before spinning.'
          : 'Spin requires a network connection.'
      );
      return;
    }

    setSpinning(true);
    setError(null);
    try {
      const token = await auth.getValidAccessToken();
      if (!token) throw new Error('Session expired');

      const prefs = await getCachedPreferences();
      const libraryIds =
        libraries.length > 0
          ? libraries
          : ((prefs?.selectedLibraries as string[]) ?? []);

      if (libraryIds.length === 0) {
        throw new Error('Select at least one library in Settings.');
      }

      const response = await coreApi.spin(token, {
        libraryIds,
        mediaType: (prefs?.defaultMediaType as 'movie' | 'show') ?? 'movie',
        filters: (prefs?.savedFilters as Record<string, unknown>) ?? {},
        tvSelectionMode: prefs?.tvSelectionMode as 'show' | 'episode' | undefined,
      });

      setResult({
        title: response.item.title,
        year: response.item.year,
        plexId: response.item.plexId,
        mediaType: response.item.mediaType,
        playLinks: response.item.playLinks,
      });

      await coreApi.recordSpinHistory(token, {
        plexId: response.item.plexId,
        title: response.item.title,
        mediaType: response.item.mediaType,
        thumbPath: response.item.thumbPath,
        year: response.item.year,
        libraryIds,
        poolSizeAtSpin: response.poolSize,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSpinning(false);
    }
  }, [auth, libraries, spinAllowed]);

  return (
    <View style={styles.container}>
      <OfflineBanner
        state={sync.state}
        isOnline={auth.isOnline}
        lastSyncAt={sync.lastSyncAt}
        pendingCount={sync.pendingCount}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>What should we watch?</Text>
        <Text style={styles.subtitle}>
          {libraries.length > 0
            ? `${libraries.length} librar${libraries.length === 1 ? 'y' : 'ies'} selected`
            : 'Using preferences from your last sync'}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.spinButton,
            (!spinAllowed || spinning) && styles.disabled,
            pressed && spinAllowed && styles.pressed,
          ]}
          onPress={handleSpin}
          disabled={!spinAllowed || spinning}
          accessibilityRole="button"
          accessibilityLabel="Spin for a random title"
        >
          {spinning ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.spinText}>Spin</Text>
          )}
        </Pressable>

        {!auth.isOnline ? (
          <Text style={styles.offlineNote}>
            Cached data is available offline. Spin and Plex links require a connection.
          </Text>
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {result ? (
          <SpinResult
            title={result.title}
            year={result.year}
            playLinks={result.playLinks}
            disabled={!auth.isOnline}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, gap: 16 },
  heading: { color: '#f8fafc', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#94a3b8', fontSize: 15 },
  spinButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#e5a00d',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  spinText: { color: '#0f172a', fontSize: 20, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9 },
  error: { color: '#f87171' },
  offlineNote: { color: '#fbbf24', fontSize: 14, lineHeight: 20 },
});
