'use client';

import { useState, useEffect, useCallback } from 'react';
import { settingsApi, SettingsResponse } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';
import PlexIntegration from './integrations/PlexIntegration';
import TmdbIntegration from './integrations/TmdbIntegration';
import TautulliIntegration from './integrations/TautulliIntegration';
import OverseerrIntegration from './integrations/OverseerrIntegration';

type IntegrationSubTab = 'plex' | 'tmdb' | 'tautulli' | 'overseerr';

export default function IntegrationsTab() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<IntegrationSubTab>('plex');
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!isAdmin) {
        setLoading(false);
        setError('Admin access required');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await settingsApi.getSettings();
        setSettings(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load settings';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAdmin]);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
    setSuccess(null);
  }, []);

  const handleSuccess = useCallback(async (message: string) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);

    // Reload settings after successful save
    try {
      const data = await settingsApi.getSettings();
      setSettings(data);
    } catch {
      // Silently fail settings reload
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-decidarr-text-muted text-lg">Admin access required</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {error && (
        <div className="mb-5 bg-red-500/10 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-5 bg-green-500/10 border border-green-500/50 rounded-lg p-4">
          <p className="text-green-400">{success}</p>
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b border-decidarr-border" role="tablist" aria-label="Integration types">
        {(['plex', 'tmdb', 'tautulli', 'overseerr'] as const).map((tab) => (
          <button
            key={tab}
            id={`${tab}-tab`}
            role="tab"
            aria-selected={subTab === tab}
            aria-controls={`${tab}-panel`}
            onClick={() => {
              setSubTab(tab);
              clearMessages();
            }}
            className={`px-4 py-2 font-medium transition-colors ${
              subTab === tab
                ? 'text-decidarr-primary border-b-2 border-decidarr-primary'
                : 'text-decidarr-text-muted hover:text-decidarr-text'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {subTab === 'plex' && (
        <div role="tabpanel" id="plex-panel" aria-labelledby="plex-tab">
          <PlexIntegration
            settings={settings}
            onError={handleError}
            onSuccess={handleSuccess}
            onClearMessages={clearMessages}
          />
        </div>
      )}
      {subTab === 'tmdb' && (
        <div role="tabpanel" id="tmdb-panel" aria-labelledby="tmdb-tab">
          <TmdbIntegration
            settings={settings}
            onError={handleError}
            onSuccess={handleSuccess}
            onClearMessages={clearMessages}
          />
        </div>
      )}
      {subTab === 'tautulli' && (
        <div role="tabpanel" id="tautulli-panel" aria-labelledby="tautulli-tab">
          <TautulliIntegration
            settings={settings}
            onError={handleError}
            onSuccess={handleSuccess}
            onClearMessages={clearMessages}
          />
        </div>
      )}
      {subTab === 'overseerr' && (
        <div role="tabpanel" id="overseerr-panel" aria-labelledby="overseerr-tab">
          <OverseerrIntegration
            settings={settings}
            onError={handleError}
            onSuccess={handleSuccess}
            onClearMessages={clearMessages}
        />
      )}
    </div>
  );
}
