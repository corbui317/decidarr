import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';

export default function IndexScreen() {
  const auth = useAuth();

  useEffect(() => {
    if (auth.state === 'bootstrapping' && auth.user) {
      // SyncProvider handles bootstrap.
    }
  }, [auth.state, auth.user]);

  if (auth.state === 'signed_out' || auth.state === 'reauth_required') {
    return <Redirect href="/login" />;
  }

  if (auth.user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
