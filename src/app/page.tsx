'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import SetupWizard from '@/components/SetupWizard';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Home() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { configured, loading: appLoading, checkStatus, setConfigured } = useApp();
  const router = useRouter();

  useEffect(() => {
    // If app is configured and user is authenticated, go to dashboard
    if (!appLoading && !authLoading && configured && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, appLoading, configured, router]);

  // Show loading while checking status
  if (appLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-decidarr-dark">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If app is not configured, show setup wizard
  if (!configured) {
    return (
      <SetupWizard
        onComplete={() => {
          setConfigured(true);
          checkStatus();
          router.push('/dashboard');
        }}
      />
    );
  }

  // If configured and authenticated, show loading (will redirect)
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-decidarr-dark">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // App is configured but user not authenticated
  // In single-user mode, try to auto-authenticate from stored session
  // For now, redirect to dashboard which will handle auth
  router.push('/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center bg-decidarr-dark">
      <LoadingSpinner size="lg" />
    </div>
  );
}
