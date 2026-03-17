'use client';

import { useState } from 'react';
import { authApi } from '@/lib/api';

interface LoginScreenProps {
  username: string | null;
  onLoginSuccess: (username: string, serverUrl: string) => void;
  onReconfigure: () => void;
}

export default function LoginScreen({ username, onLoginSuccess, onReconfigure }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresSetup, setRequiresSetup] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setRequiresSetup(false);

    try {
      console.log('[LoginScreen] Attempting login...');
      const result = await authApi.login();
      console.log('[LoginScreen] Login successful:', result.user.username);
      onLoginSuccess(result.user.username, result.user.serverUrl || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      console.error('[LoginScreen] Login failed:', message);
      setError(message);

      if (message.includes('expired') || message.includes('requiresSetup')) {
        setRequiresSetup(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-decidarr-dark p-4">
      <div className="w-full max-w-md">
        <div className="bg-decidarr-secondary rounded-2xl shadow-2xl border border-decidarr-border p-8 text-center">
          {/* Logo */}
          <div className="text-6xl mb-4">🎰</div>
          <h1 className="text-3xl font-bold text-decidarr-primary mb-1">Decidarr</h1>
          <p className="text-decidarr-text-muted text-sm mb-8">Plex Movie Roulette</p>

          {/* User info */}
          {username && (
            <div className="bg-decidarr-dark/50 rounded-xl p-4 border border-decidarr-border mb-6">
              <p className="text-decidarr-text-muted text-sm">Welcome back,</p>
              <p className="text-decidarr-text font-semibold text-lg">{username}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4 text-left">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {requiresSetup ? (
            <div className="space-y-3">
              <p className="text-decidarr-text-muted text-sm">
                Your Plex token has expired and needs to be refreshed. Please reconfigure the app.
              </p>
              <button
                onClick={onReconfigure}
                className="w-full bg-decidarr-primary text-decidarr-dark font-bold py-3 px-6 rounded-xl
                           hover:opacity-90 transition-opacity"
              >
                Reconfigure App
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-decidarr-primary text-decidarr-dark font-bold py-3 px-6 rounded-xl
                           hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connecting to Plex...
                  </>
                ) : (
                  'Connect to Plex'
                )}
              </button>

              <button
                onClick={onReconfigure}
                className="w-full text-decidarr-text-muted hover:text-decidarr-text text-sm py-2 transition-colors"
              >
                Reconfigure / Change Plex Account
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-decidarr-text-muted text-xs mt-4">
          Self-hosted · Single user
        </p>
      </div>
    </div>
  );
}
