'use client';

import { useState, useCallback, useRef } from 'react';
import { authApi, AuthUser, formatPlexLoginError } from '@/lib/api';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
  onReconfigure: () => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export default function LoginScreen({ onLoginSuccess, onReconfigure }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    stopPolling();

    try {
      const { authUrl, pinId } = await authApi.startPlexLogin();
      window.open(authUrl, '_blank', 'noopener,noreferrer');

      const startedAt = Date.now();
      pollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopPolling();
          setError('Plex authorization expired, please try again.');
          setLoading(false);
          return;
        }

        try {
          const result = await authApi.pollPlexLogin(pinId);
          if (!result.authorized) return;

          stopPolling();

          if (result.success && result.user) {
            onLoginSuccess(result.user);
          } else {
            setError(result.error || 'Login was not completed');
            setLoading(false);
          }
        } catch (pollErr) {
          stopPolling();
          setError(formatPlexLoginError(pollErr));
          setLoading(false);
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setError(formatPlexLoginError(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-decidarr-dark p-4">
      <div className="w-full max-w-md">
        <div className="bg-decidarr-secondary rounded-2xl shadow-2xl border border-decidarr-border p-8 text-center">
          <div className="text-6xl mb-4">🎰</div>
          <h1 className="text-3xl font-bold text-decidarr-primary mb-1">Decidarr</h1>
          <p className="text-decidarr-text-muted text-sm mb-8">Plex Movie Roulette</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4 text-left">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

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
                  Waiting for Plex authorization...
                </>
              ) : (
                'Login with Plex'
              )}
            </button>

            {loading && (
              <p className="text-decidarr-text-muted text-xs">
                Complete sign-in in the Plex window that opened, then return here.
              </p>
            )}

            <button
              onClick={onReconfigure}
              className="w-full text-decidarr-text-muted hover:text-decidarr-text text-sm py-2 transition-colors"
            >
              Reconfigure server
            </button>
          </div>
        </div>

        <p className="text-center text-decidarr-text-muted text-xs mt-4">
          Multi-user · Sign in with your Plex account
        </p>
      </div>
    </div>
  );
}
