import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { getCachedSpinHistory } from '@/db/database';

export default function HistoryScreen() {
  const auth = useAuth();
  const sync = useSync();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    (async () => {
      setItems(await getCachedSpinHistory());
    })();
  }, [sync.lastSyncAt]);

  if (!auth.user) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.container}>
      <OfflineBanner
        state={sync.state}
        isOnline={auth.isOnline}
        lastSyncAt={sync.lastSyncAt}
        pendingCount={sync.pendingCount}
      />

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No spin history yet</Text>
          <Text style={styles.emptyText}>
            {sync.lastSyncAt
              ? 'Spin something to build your history.'
              : 'Connect to finish setup and sync your history.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row} accessibilityRole="text">
              <Text style={styles.title}>{String(item.title)}</Text>
              <Text style={styles.meta}>
                {item.year ? `${item.year} · ` : ''}
                {item.spunAt ? new Date(String(item.spunAt)).toLocaleString() : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  list: { padding: 16, gap: 10 },
  row: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  meta: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '600' },
  emptyText: { color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
});
