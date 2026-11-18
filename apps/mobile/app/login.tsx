import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';

export default function LoginScreen() {
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.user && auth.state !== 'reauth_required') {
    return <Redirect href="/(tabs)" />;
  }

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.startLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.completeLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Decidarr Mobile</Text>
      <Text style={styles.subtitle}>
        Sign in with Plex to spin your library. Tokens stay in secure storage — never SQLite.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={handleStart}
        disabled={loading || !auth.isOnline}
        accessibilityRole="button"
        accessibilityLabel="Sign in with Plex"
      >
        {loading ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.buttonText}>Sign in with Plex</Text>
        )}
      </Pressable>

      {!auth.isOnline ? (
        <Text style={styles.offline}>Connect to the internet to sign in.</Text>
      ) : null}

      {auth.pendingDeviceCode ? (
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={handleComplete}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Complete sign in after Plex authorization"
        >
          <Text style={styles.secondaryButtonText}>I authorized in Plex</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    gap: 16,
    justifyContent: 'center',
  },
  heading: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 16,
    lineHeight: 22,
  },
  button: {
    minHeight: 48,
    backgroundColor: '#e5a00d',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: 48,
    backgroundColor: '#334155',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: { opacity: 0.85 },
  label: { color: '#cbd5e1', fontSize: 14 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    color: '#f8fafc',
    fontSize: 16,
  },
  error: { color: '#f87171', fontSize: 14 },
  offline: { color: '#fbbf24', fontSize: 14 },
});
