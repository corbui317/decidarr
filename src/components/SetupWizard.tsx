'use client';

import { useState } from 'react';
import { settingsApi, PlexTestResponse } from '@/lib/api';
import LoadingSpinner from './LoadingSpinner';

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'plex' | 'tmdb' | 'complete';

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plex form state
  const [plexToken, setPlexToken] = useState('');
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexValidation, setPlexValidation] = useState<PlexTestResponse | null>(null);
  const [availableServers, setAvailableServers] = useState<Array<{ name: string; uri: string }>>([]);

  // TMDB form state
  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbValid, setTmdbValid] = useState<boolean | null>(null);

  const handleTestPlex = async () => {
    if (!plexToken.trim()) {
      setError('Please enter your Plex token');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await settingsApi.testPlex(plexToken.trim(), plexServerUrl.trim() || undefined);
      setPlexValidation(result);

      if (result.valid && result.servers && result.servers.length > 0) {
        setAvailableServers(result.servers);
        // Auto-select first server (prefer local connection)
        if (!plexServerUrl) {
          setPlexServerUrl(result.servers[0].uri);
        }
      } else if (result.valid && (!result.servers || result.servers.length === 0)) {
        // Token valid but no servers discovered - show manual entry
        setAvailableServers([]);
      } else if (!result.valid) {
        setError(result.error || 'Invalid Plex token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate Plex token');
    } finally {
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
      await settingsApi.setup({
        plexToken: plexToken.trim(),
        plexServerUrl: plexServerUrl.trim() || undefined,
        tmdbApiKey: tmdbApiKey.trim() || undefined,
      });
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
        {/* Progress indicator */}
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

        {/* Welcome Step */}
        {step === 'welcome' && (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-decidarr-primary mb-4">
              Welcome to Decidarr
            </h1>
            <p className="text-gray-300 mb-2">
              Your personal movie and TV show randomizer
            </p>
            <p className="text-gray-400 text-sm mb-8">
              Let&apos;s get you set up in just a few steps.
            </p>
            <button
              onClick={() => setStep('plex')}
              className="w-full bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Plex Step */}
        {step === 'plex' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Connect to Plex</h2>
            <p className="text-gray-400 text-sm mb-6">
              Enter your Plex token to connect your media library.
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">
                  Plex Token <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={plexToken}
                  onChange={(e) => {
                    setPlexToken(e.target.value);
                    setPlexValidation(null);
                    setError(null);
                  }}
                  placeholder="Enter your Plex token"
                  className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-decidarr-primary"
                />
                <p className="text-gray-500 text-xs mt-1">
                  <a
                    href="https://www.plex.tv/claim/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decidarr-primary hover:underline"
                  >
                    How to get your Plex token
                  </a>
                </p>
              </div>

              {plexValidation?.valid && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
                  <p className="text-green-400 text-sm">
                    Connected as <strong>{plexValidation.user?.username}</strong>
                  </p>
                </div>
              )}

              {plexValidation?.valid && (
                <div>
                  <label className="block text-gray-300 text-sm mb-2">
                    Plex Server {availableServers.length > 0 && <span className="text-green-400 text-xs ml-2">(Auto-discovered)</span>}
                  </label>
                  {availableServers.length > 0 ? (
                    <>
                      <select
                        value={plexServerUrl}
                        onChange={(e) => setPlexServerUrl(e.target.value)}
                        className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-decidarr-primary"
                      >
                        {availableServers.map((server) => (
                          <option key={server.uri} value={server.uri}>
                            {server.name} ({server.uri})
                          </option>
                        ))}
                      </select>
                      <p className="text-gray-500 text-xs mt-1">
                        {availableServers.length} server{availableServers.length !== 1 ? 's' : ''} found
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={plexServerUrl}
                        onChange={(e) => setPlexServerUrl(e.target.value)}
                        placeholder="http://192.168.1.100:32400"
                        className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-decidarr-primary"
                      />
                      <p className="text-yellow-500 text-xs mt-1">
                        No servers auto-discovered. Please enter your server URL manually.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setStep('welcome')}
                  className="flex-1 bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                {!plexValidation?.valid ? (
                  <button
                    onClick={handleTestPlex}
                    disabled={loading || !plexToken.trim()}
                    className="flex-1 bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {loading ? <LoadingSpinner size="sm" /> : 'Validate'}
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
          </div>
        )}

        {/* TMDB Step */}
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
                <p className="text-gray-500 text-xs mt-1">
                  <a
                    href="https://www.themoviedb.org/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decidarr-primary hover:underline"
                  >
                    Get a free TMDB API key
                  </a>
                </p>
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
                {tmdbApiKey.trim() && tmdbValid === null ? (
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

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
            <p className="text-gray-400 mb-8">
              Decidarr is ready to help you discover your next watch.
            </p>
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
