import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native';

interface SpinResultProps {
  title: string;
  year?: number;
  playLinks?: { ios?: string; android?: string; web?: string };
  watched?: boolean;
  onToggleWatched?: () => void;
  disabled?: boolean;
}

export function SpinResult({
  title,
  year,
  playLinks,
  watched,
  onToggleWatched,
  disabled,
}: SpinResultProps) {
  const playUrl =
    Platform.OS === 'ios'
      ? playLinks?.ios || playLinks?.web
      : playLinks?.android || playLinks?.web;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {year ? <Text style={styles.year}>{year}</Text> : null}

      <View style={styles.actions}>
        {playUrl ? (
          <Pressable
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
            onPress={() => Linking.openURL(playUrl)}
            accessibilityRole="button"
            accessibilityLabel="Open in Plex"
            disabled={disabled}
          >
            <Text style={styles.primaryText}>Open in Plex</Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>Plex link unavailable offline</Text>
        )}

        {onToggleWatched ? (
          <Pressable
            style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
            onPress={onToggleWatched}
            accessibilityRole="button"
            accessibilityLabel={watched ? 'Mark unwatched' : 'Mark watched'}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>{watched ? 'Mark unwatched' : 'Mark watched'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
  },
  year: {
    color: '#94a3b8',
    fontSize: 16,
  },
  actions: {
    marginTop: 12,
    gap: 10,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: {
    backgroundColor: '#e5a00d',
  },
  secondary: {
    backgroundColor: '#334155',
  },
  pressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: '#94a3b8',
    fontSize: 14,
  },
});
