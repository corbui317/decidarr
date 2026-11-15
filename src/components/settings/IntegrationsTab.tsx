'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  settingsApi,
  tautulliApi,
  overseerrApi,
  SettingsResponse,
  PlexTestResponse,
  TautulliUser,
} from '@/lib/api';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<IntegrationSubTab>('plex');
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  // Plex state
  const [plexToken, setPlexToken] = useState('');
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexValidation, setPlexValidation] = useState<PlexTestResponse | null>(null);
  const [availableServers, setAvailableServers] = useState<Array<{ name: string; uri: string }>>([]);

  // TMDB state
  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbValid, setTmdbValid] = useState<boolean | null>(null);

  // Tautulli state
  const [tautulliUrl, setTautulliUrl] = useState('');
  const [tautulliApiKey, setTautulliApiKey] = useState('');
  const [tautulliEnabled, setTautulliEnabled] = useState(false);
  const [tautulliUsers, setTautulliUsers] = useState<TautulliUser[]>([]);
  const [tautulliValid, setTautulliValid] = useState<boolean | null>(null);
  const [syncingTautulli, setSyncingTautulli] = useState(false);

  // Overseerr state
  const [overseerrUrl, setOverseerrUrl] = useState('');
  const [overseerrApiKey, setOverseerrApiKey] = useState('');
  const [overseerrFilterEnabled, setOverseerrFilterEnabled] = useState(false);
  const [overseerrValid, setOverseerrValid] = useState<boolean | null>(null);
  const [overseerrVersion, setOverseerrVersion] = useState<string | null>(null);

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
        setPlexServerUrl(data.plex.serverUrl || '');
        setTautulliUrl(data.tautulli?.url || '');
        setTautulliEnabled(data.tautulli?.enabled || false);
        setOverseerrUrl(data.overseerr?.url || '');
        setOverseerrFilterEnabled(data.overseerr?.filterEnabled || false);
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

  // Plex handlers
  const handleTestPlex = useCallback(async () => {
    if (!plexToken.trim()) {
      setError('Please enter a Plex token');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      const validation = await settingsApi.testPlex(plexToken, plexServerUrl || undefined);
      setPlexValidation(validation);
      if (validation.valid && validation.servers) {
        setAvailableServers(validation.servers);
        if (validation.servers.length > 0 && !plexServerUrl) {
          setPlexServerUrl(validation.servers[0].uri);
        }
      }
      if (!validation.valid) {
        setError('Plex token validation failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test Plex';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [plexToken, plexServerUrl, clearMessages]);

  const handleSavePlex = useCallback(async () => {
    if (!plexToken.trim() || !plexServerUrl.trim()) {
      setError('Please provide both Plex token and server URL');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      await settingsApi.updateSettings({
        plex: {
          token: plexToken,
          serverUrl: plexServerUrl,
        },
      });
      setSuccess('Plex settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload to get updated masked token
      const data = await settingsApi.getSettings();
      setSettings(data);
      setPlexToken('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Plex settings';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [plexToken, plexServerUrl, clearMessages]);

  // TMDB handlers
  const handleTestTmdb = useCallback(async () => {
    if (!tmdbApiKey.trim()) {
      setError('Please enter a TMDB API key');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      const result = await settingsApi.testTmdb(tmdbApiKey);
      setTmdbValid(result.valid);
      if (!result.valid) {
        setError('TMDB API key validation failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test TMDB';
      setError(message);
      setTmdbValid(false);
    } finally {
      setSaving(false);
    }
  }, [tmdbApiKey, clearMessages]);

  const handleSaveTmdb = useCallback(async () => {
    if (!tmdbApiKey.trim()) {
      setError('Please provide a TMDB API key');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      await settingsApi.updateSettings({
        tmdb: {
          apiKey: tmdbApiKey,
        },
      });
      setSuccess('TMDB settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
      setTmdbApiKey('');

      // Reload settings
      const data = await settingsApi.getSettings();
      setSettings(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save TMDB settings';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [tmdbApiKey, clearMessages]);

  // Tautulli handlers
  const handleTestTautulli = useCallback(async () => {
    if (!tautulliUrl.trim() || !tautulliApiKey.trim()) {
      setError('Please provide both Tautulli URL and API key');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      const result = await tautulliApi.test(tautulliUrl, tautulliApiKey);
      setTautulliValid(result.success);
      if (result.success && result.users) {
        setTautulliUsers(result.users);
      }
      if (!result.success) {
        setError('Tautulli connection test failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test Tautulli';
      setError(message);
      setTautulliValid(false);
    } finally {
      setSaving(false);
    }
  }, [tautulliUrl, tautulliApiKey, clearMessages]);

  const handleSaveTautulli = useCallback(async () => {
    if (!tautulliUrl.trim() || !tautulliApiKey.trim()) {
      setError('Please provide both Tautulli URL and API key');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      await settingsApi.updateSettings({
        tautulli: {
          url: tautulliUrl,
          apiKey: tautulliApiKey,
          enabled: tautulliEnabled,
        },
      });
      setSuccess('Tautulli settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload settings
      const data = await settingsApi.getSettings();
      setSettings(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Tautulli settings';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [tautulliUrl, tautulliApiKey, tautulliEnabled, clearMessages]);

  const handleSyncTautulli = useCallback(async () => {
    setSyncingTautulli(true);
    clearMessages();
    try {
      await tautulliApi.sync();
      setSuccess('Tautulli watch history synced successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync Tautulli';
      setError(message);
    } finally {
      setSyncingTautulli(false);
    }
  }, [clearMessages]);

  // Overseerr handlers
  const handleTestOverseerr = useCallback(async () => {
    if (!overseerrUrl.trim() || !overseerrApiKey.trim()) {
      setError('Please provide both Overseerr URL and API key');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      const result = await overseerrApi.test(overseerrUrl, overseerrApiKey);
      setOverseerrValid(result.success);
      if (result.version) {
        setOverseerrVersion(result.version);
      }
      if (!result.success) {
        setError('Overseerr connection test failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test Overseerr';
      setError(message);
      setOverseerrValid(false);
    } finally {
      setSaving(false);
    }
  }, [overseerrUrl, overseerrApiKey, clearMessages]);

  const handleSaveOverseerr = useCallback(async () => {
    if (!overseerrUrl.trim() || !overseerrApiKey.trim()) {
      setError('Please provide both Overseerr URL and API key');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      await settingsApi.updateSettings({
        overseerr: {
          url: overseerrUrl,
          apiKey: overseerrApiKey,
          filterEnabled: overseerrFilterEnabled,
        },
      });
      setSuccess('Overseerr settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload settings
      const data = await settingsApi.getSettings();
      setSettings(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Overseerr settings';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [overseerrUrl, overseerrApiKey, overseerrFilterEnabled, clearMessages]);

  if (loading) {
    return (
      <div id="tab-panel-integrations" role="tabpanel" className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div id="tab-panel-integrations" role="tabpanel" className="p-4">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
          Admin access required to manage integrations
        </div>
      </div>
    );
  }

  const subTabs: { id: IntegrationSubTab; label: string }[] = [
    { id: 'plex', label: 'Plex' },
    { id: 'tmdb', label: 'TMDB' },
    { id: 'tautulli', label: 'Tautulli' },
    { id: 'overseerr', label: 'Overseerr' },
  ];

  return (
    <div id="tab-panel-integrations" role="tabpanel" className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      <div className="flex gap-1 border-b border-decidarr-border pb-2" role="tablist" aria-label="Integrations">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={subTab === tab.id}
            onClick={() => {
              setSubTab(tab.id);
              clearMessages();
            }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-decidarr-primary ${
              subTab === tab.id
                ? 'bg-decidarr-primary/20 text-decidarr-primary'
                : 'text-decidarr-text-muted hover:text-decidarr-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'plex' && (
        <PlexIntegration
          settings={settings}
          plexToken={plexToken}
          onPlexTokenChange={setPlexToken}
          plexServerUrl={plexServerUrl}
          onPlexServerUrlChange={setPlexServerUrl}
          plexValidation={plexValidation}
          onPlexValidationClear={() => { setPlexValidation(null); clearMessages(); }}
          availableServers={availableServers}
          saving={saving}
          onTest={handleTestPlex}
          onSave={handleSavePlex}
        />
      )}

      {subTab === 'tmdb' && (
        <TmdbIntegration
          settings={settings}
          tmdbApiKey={tmdbApiKey}
          onTmdbApiKeyChange={setTmdbApiKey}
          tmdbValid={tmdbValid}
          onTmdbValidClear={() => { setTmdbValid(null); clearMessages(); }}
          saving={saving}
          onTest={handleTestTmdb}
          onSave={handleSaveTmdb}
        />
      )}

      {subTab === 'tautulli' && (
        <TautulliIntegration
          settings={settings}
          tautulliUrl={tautulliUrl}
          onTautulliUrlChange={setTautulliUrl}
          tautulliApiKey={tautulliApiKey}
          onTautulliApiKeyChange={setTautulliApiKey}
          tautulliEnabled={tautulliEnabled}
          onTautulliEnabledChange={setTautulliEnabled}
          tautulliUsers={tautulliUsers}
          tautulliValid={tautulliValid}
          saving={saving}
          syncingTautulli={syncingTautulli}
          onTest={handleTestTautulli}
          onSave={handleSaveTautulli}
          onSync={handleSyncTautulli}
          onClearValidation={() => { setTautulliValid(null); clearMessages(); }}
        />
      )}

      {subTab === 'overseerr' && (
        <OverseerrIntegration
          settings={settings}
          overseerrUrl={overseerrUrl}
          onOverseerrUrlChange={setOverseerrUrl}
          overseerrApiKey={overseerrApiKey}
          onOverseerrApiKeyChange={setOverseerrApiKey}
          overseerrFilterEnabled={overseerrFilterEnabled}
          onOverseerrFilterEnabledChange={setOverseerrFilterEnabled}
          overseerrValid={overseerrValid}
          overseerrVersion={overseerrVersion}
          saving={saving}
          onTest={handleTestOverseerr}
          onSave={handleSaveOverseerr}
          onClearValidation={() => { setOverseerrValid(null); clearMessages(); }}
        />
      )}
    </div>
  );
}
