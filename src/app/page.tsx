'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import SetupWizard from '@/components/SetupWizard';
import LoginScreen from '@/components/LoginScreen';
import LoadingSpinner from '@/components/LoadingSpinner';
import { settingsApi } from '@/lib/api';

export default function Home() {
  const { isAuthenticated, loading: authLoading, login } = useAuth();
  const { configured, loading: appLoading, checkStatus, setConfigured, status } = useApp();
  const router = useRouter();
  const [showReconfigure, setShowReconfigure] = useState(false);

  useEffect(() => {
    if (appLoading || authLoading) return;

    console.log('[Home] State:', { configured, isAuthenticated, appLoading, authLoading });

    if (configured && isAuthenticated) {
      console.log('[Home] Configured and authenticated, going to dashboard');
      router.replace('/dashboard');
    }
    // If configured but not authenticated → LoginScreen will be shown
    // If not configured → SetupWizard will be shown
  }, [isAuthenticated, authLoading, appLoading, configured, router]);

  // Show full-page loading while checking initial state
  if (appLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-decidarr-dark">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // App is not configured (or user wants to reconfigure) — show setup wizard
  if (!configured || showReconfigure) {
    return (
      <SetupWizard
        onComplete={async () => {
          setShowReconfigure(false);
          await checkStatus();
          await login();
          router.push('/dashboard');
        }}
      />
    );
  }

  // App is configured but session is expired/missing — show login screen
  if (!isAuthenticated) {
    return (
      <LoginScreen
        username={status?.plexUsername ?? null}
        onLoginSuccess={async (username, serverUrl) => {
          console.log('[Home] Login successful for:', username);
          // Refresh auth state so AuthContext picks up the new cookie
          await login();
          router.replace('/dashboard');
        }}
        onReconfigure={() => {
          // Allow force-reconfigure: temporarily mark as unconfigured in UI only
          setShowReconfigure(true);
        }}
      />
    );
  }

  // Configured and authenticated — spinner while redirect fires
  return (
    <div className="min-h-screen flex items-center justify-center bg-decidarr-dark">
      <LoadingSpinner size="lg" />
    </div>
  );
}
