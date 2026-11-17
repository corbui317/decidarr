'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { settingsApi, authApi, formatPlexLoginError, setStoredSetupSecret } from '@/lib/api';
import StepIndicator from './setup/StepIndicator';
import WelcomeStep from './setup/WelcomeStep';
import PlexStep from './setup/PlexStep';
import TmdbStep from './setup/TmdbStep';
import CompleteStep from './setup/CompleteStep';

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
        <StepIndicator currentStep={step} />

        {step === 'welcome' && (
          <WelcomeStep onGetStarted={() => setStep('plex')} />
        )}

        {step === 'plex' && (
          <PlexStep
            error={error}
            setupSecret={setupSecret}
            onSetupSecretChange={setSetupSecret}
            plexConnected={plexConnected}
            plexUsername={plexUsername}
            loading={loading}
            onBack={() => setStep('welcome')}
            onPlexOAuth={handlePlexOAuth}
            onNext={() => setStep('tmdb')}
          />
        )}

        {step === 'tmdb' && (
          <TmdbStep
            error={error}
            tmdbApiKey={tmdbApiKey}
            onTmdbApiKeyChange={(value) => {
              setTmdbApiKey(value);
              setTmdbValid(null);
              setError(null);
            }}
            tmdbValid={tmdbValid}
            loading={loading}
            onBack={() => setStep('plex')}
            onTestTmdb={handleTestTmdb}
            onComplete={handleComplete}
          />
        )}

        {step === 'complete' && (
          <CompleteStep onStartExploring={onComplete} />
        )}
      </div>
    </div>
  );
}
