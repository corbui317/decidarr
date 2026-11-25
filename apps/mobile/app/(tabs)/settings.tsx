import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { coreApi } from '@/api/client';
import { getCachedPreferences } from '@/db/database';

interface LibrarySection {
  id: string;
  title: string;
  type: string;
}

export default function SettingsScreen() {
  const auth = useAuth();
  const sync = useSync();
  const [sections, setSections] = useState<LibrarySection[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLibraries = useCallback(async () => {
    const prefs = await getCachedPreferences();
    if (prefs?.selectedLibraries) {
      setSelected(prefs.selectedLibraries as string[]);
    }

    if (!auth.isOnline) return;
    const token = await auth.getValidAccessToken();
    if (!token) return;

    setLoading(true);
    try {
      const response = await coreApi.getSections();
      setSections(
        response.sections.filter((s) => s.type === 'movie' || s.type === 'show')
      );
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    loadLibraries();
  }, [loadLibraries, sync.lastSyncAt]);

  if (!auth.user) {
    return <Redirect href="/login" />;
  }

  const toggleLibrary = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveLibraries = async () => {
    if (!auth.isOnline) {
      Alert.alert('Offline', 'Library changes require a network connection.');
      return;
    }
    const token = await auth.getValidAccessToken();
    if (!token) return;

    await coreApi.updatePreferences({ selectedLibraries: selected });
    await sync.syncNow();
    Alert.alert('Saved', 'Library selection updated.');
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Remove cached data from this device?', [
      { text: 'Keep cache', onPress: () => auth.logout(false) },
      { text: 'Remove cache', style: 'destructive', onPress: () => auth.logout(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <OfflineBanner
        state={sync.state}
        isOnline={auth.isOnline}
        lastSyncAt={sync.lastSyncAt}
        pendingCount={sync.pendingCount}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Signed in as {auth.user.username}</Text>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => sync.syncNow()}
          disabled={!auth.isOnline || sync.state === 'syncing'}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
        >
          <Text style={styles.buttonText}>
            {sync.state === 'syncing' ? 'Syncing…' : 'Sync now'}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Libraries</Text>
        {loading ? <ActivityIndicator color="#e5a00d" /> : null}
        {sections.map((section) => {
          const active = selected.includes(section.id);
          return (
            <Pressable
              key={section.id}
              style={[styles.libraryRow, active && styles.libraryActive]}
              onPress={() => toggleLibrary(section.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={section.title}
            >
              <Text style={styles.libraryText}>
                {active ? '✓ ' : ''}
                {section.title} ({section.type})
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={saveLibraries}
          disabled={!auth.isOnline}
          accessibilityRole="button"
          accessibilityLabel="Save library selection"
        >
          <Text style={styles.buttonText}>Save libraries</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.dangerText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, gap: 12 },
  heading: { color: '#f8fafc', fontSize: 18, fontWeight: '600' },
  sectionTitle: { color: '#cbd5e1', fontSize: 16, fontWeight: '600', marginTop: 8 },
  libraryRow: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  libraryActive: { borderColor: '#e5a00d', backgroundColor: '#1a2438' },
  libraryText: { color: '#f8fafc', fontSize: 15 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  dangerButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#450a0a',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  dangerText: { color: '#fecaca', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
