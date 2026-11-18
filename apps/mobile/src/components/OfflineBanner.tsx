import { View, Text, StyleSheet } from 'react-native';
import type { SyncClientState } from '@decidarr/api-contracts';
import { syncStatusLabel } from '@/sync/state';

interface OfflineBannerProps {
  state: SyncClientState;
  isOnline: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
}

export function OfflineBanner({ state, isOnline, lastSyncAt, pendingCount }: OfflineBannerProps) {
  const label = syncStatusLabel(state, isOnline, lastSyncAt, pendingCount);
  const isWarning = !isOnline || state === 'conflict' || state === 'reauth_required';

  return (
    <View
      style={[styles.banner, isWarning ? styles.warning : styles.ok]}
      accessibilityRole="text"
      accessibilityLabel={`Sync status: ${label}`}
    >
      <Text style={styles.icon}>{isOnline ? (pendingCount > 0 ? '◷' : '●') : '○'}</Text>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  ok: {
    backgroundColor: '#0f172a',
  },
  warning: {
    backgroundColor: '#422006',
  },
  icon: {
    color: '#f8fafc',
    fontSize: 14,
    minWidth: 16,
    textAlign: 'center',
  },
  text: {
    color: '#f8fafc',
    fontSize: 14,
    flex: 1,
  },
});
