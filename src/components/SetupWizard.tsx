'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { settingsApi, authApi, formatPlexLoginError, setStoredSetupSecret } from '@/lib/api';
import LoadingSpinner from './LoadingSpinner';

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'plex' | 'tmdb' | 'complete';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plexConnected, setPlexConnected] = useState(false);
  const [plexUsername, setPlexUsername] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbValid, setTmdbValid] = useState<boolean | null>(null);
  const [setupSecret, setSetupSecret] = useState('');

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handlePlexOAuth = async () => {
    setLoading(true);
    setError(null);
    stopPolling();

    if (setupSecret.trim()) {
      setStoredSetupSecret(setupSecret.trim());
    }

    try {
      const { authUrl, state } = await authApi.startPlexLogin();
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
          const result = await authApi.pollPlexLogin(state);
          if (!result.authorized) return;

          stopPolling();

          if (result.success && result.user) {
            setPlexConnected(true);
            setPlexUsername(result.user.username);
            setStep('tmdb');
            setLoading(false);
          } else {
            setError(result.error || 'Plex sign-in failed');
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

  const handleTestTmdb = async () => {
    if (!tmdbApiKey.trim()) {
      setTmdbValid(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await settingsApi.testTmdb(tmdbApiKey.trim());
      setTmdbValid(result.valid);
      if (!result.valid) {
        setError(result.error || 'Invalid TMDB API key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate TMDB key');
      setTmdbValid(false);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);

    try {
      if (tmdbApiKey.trim()) {
        await settingsApi.setup({ tmdbApiKey: tmdbApiKey.trim() });
      }
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-decidarr-dark flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-decidarr-secondary rounded-xl shadow-2xl p-8">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-2">
            {['welcome', 'plex', 'tmdb', 'complete'].map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full ${
                    step === s
                      ? 'bg-decidarr-primary'
                      : ['welcome', 'plex', 'tmdb', 'complete'].indexOf(step) > i
                      ? 'bg-decidarr-primary/50'
                      : 'bg-gray-600'
                  }`}
                />
                {i < 3 && <div className="w-8 h-0.5 bg-gray-600" />}
              </div>
            ))}
          </div>
        </div>

        {step === 'welcome' && (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-decidarr-primary mb-4">Welcome to Decidarr</h1>
            <p className="text-gray-300 mb-2">Your personal movie and TV show randomizer</p>
            <p className="text-gray-400 text-sm mb-8">
              Sign in with Plex as the server owner to get started.
            </p>
            <button
              onClick={() => setStep('plex')}
              className="w-full bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 'plex' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Connect with Plex</h2>
            <p className="text-gray-400 text-sm mb-6">
              Sign in with your Plex account. You must be the owner of the Plex Media Server.
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="setup-secret" className="block text-sm text-gray-400 mb-1">
                Setup key (required on public production installs)
              </label>
              <input
                id="setup-secret"
                type="password"
                value={setupSecret}
                onChange={(e) => setSetupSecret(e.target.value)}
                placeholder="Optional for local development"
                className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>

            {plexConnected && plexUsername && (
              <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 mb-4">
                <p className="text-green-400 text-sm">
                  Connected as <strong>{plexUsername}</strong>
                </p>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <button
                onClick={() => setStep('welcome')}
                className="flex-1 bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Back
              </button>
              {!plexConnected ? (
                <button
                  onClick={handlePlexOAuth}
                  disabled={loading}
                  className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? <LoadingSpinner size="sm" /> : 'Sign in with Plex'}
                </button>
              ) : (
                <button
                  onClick={() => setStep('tmdb')}
                  className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'tmdb' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">TMDB Integration</h2>
            <p className="text-gray-400 text-sm mb-6">
              Optional: Add your TMDB API key for enhanced movie data and ratings.
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  TMDB API Key <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="password"
                  value={tmdbApiKey}
                  onChange={(e) => {
                    setTmdbApiKey(e.target.value);
                    setTmdbValid(null);
                    setError(null);
                  }}
                  placeholder="Enter your TMDB API key"
                  className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-decidarr-primary"
                />
              </div>

              {tmdbValid === true && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
                  <p className="text-green-400 text-sm">TMDB API key is valid</p>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setStep('plex')}
                  className="flex-1 bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                {tmdbApiKey.trim() && tmdbValid !== true ? (
                  <button
                    onClick={handleTestTmdb}
                    disabled={loading}
                    className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? <LoadingSpinner size="sm" /> : 'Validate'}
                  </button>
                ) : (
                  <button
                    onClick={handleComplete}
                    disabled={loading}
                    className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? <LoadingSpinner size="sm" /> : tmdbApiKey.trim() ? 'Complete Setup' : 'Skip & Complete'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
            <p className="text-gray-400 mb-8">Decidarr is ready to help you discover your next watch.</p>
            <button
              onClick={onComplete}
              className="w-full bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors"
            >
              Start Exploring
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
