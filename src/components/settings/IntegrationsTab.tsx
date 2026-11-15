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
import { inputClass, inputStyle, labelClass } from './shared';
import { useAuth } from '@/context/AuthContext';

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
      const validation = await settingsApi.testPlex({ token: plexToken });
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
      await settingsApi.saveSettings({
        plexToken,
        plexServerUrl,
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
      const result = await settingsApi.testTmdb({ apiKey: tmdbApiKey });
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
      await settingsApi.saveSettings({
        tmdbApiKey,
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
      const result = await tautulliApi.testConnection({ url: tautulliUrl, apiKey: tautulliApiKey });
      setTautulliValid(result.valid);
      if (result.valid && result.users) {
        setTautulliUsers(result.users);
      }
      if (!result.valid) {
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
      await settingsApi.saveSettings({
        tautulliUrl,
        tautulliApiKey,
        tautulliEnabled,
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
      await tautulliApi.syncWatchHistory();
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
      const result = await overseerrApi.testConnection({ url: overseerrUrl, apiKey: overseerrApiKey });
      setOverseerrValid(result.valid);
      if (result.version) {
        setOverseerrVersion(result.version);
      }
      if (!result.valid) {
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
      await settingsApi.saveSettings({
        overseerrUrl,
        overseerrApiKey,
        overseerrFilterEnabled,
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
        <div className="space-y-5">
          {settings?.plex.hasToken && (
            <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
              <p className="text-decidarr-text text-sm">
                <span className="text-decidarr-text-muted">Connected as: </span>
                <strong>{settings.plex.username || 'Unknown'}</strong>
              </p>
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>Server: </span>{settings.plex.serverUrl || 'Not set'}
              </p>
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>Token: </span>{settings.plex.tokenMasked}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="plex-token" className={labelClass}>
              {settings?.plex.hasToken ? 'Update Plex Token' : 'Plex Token'}
            </label>
            <input
              id="plex-token"
              type="password"
              value={plexToken}
              onChange={(e) => {
                setPlexToken(e.target.value);
                setPlexValidation(null);
                clearMessages();
              }}
              placeholder="Enter new Plex token"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {plexValidation?.valid && (
            <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
              <p className="text-green-400 text-sm">
                Validated as <strong>{plexValidation.user?.username}</strong>
              </p>
            </div>
          )}

          <div>
            <label htmlFor="plex-server-url" className={labelClass}>Server URL</label>
            {availableServers.length > 0 ? (
              <select
                id="plex-server-url"
                value={plexServerUrl}
                onChange={(e) => setPlexServerUrl(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                {availableServers.map((server) => (
                  <option key={server.uri} value={server.uri}>{server.name}</option>
                ))}
              </select>
            ) : (
              <input
                id="plex-server-url"
                type="url"
                value={plexServerUrl}
                onChange={(e) => setPlexServerUrl(e.target.value)}
                placeholder="http://192.168.1.100:32400"
                className={inputClass}
                style={inputStyle}
              />
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTestPlex}
              disabled={saving || !plexToken.trim()}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
            >
              {saving ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSavePlex}
              disabled={saving || !plexToken.trim() || !plexServerUrl.trim()}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {subTab === 'tmdb' && (
        <div className="space-y-5">
          {settings?.tmdb.hasApiKey && (
            <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
              <p className="text-decidarr-text text-sm">
                <span className="text-decidarr-text-muted">API Key: </span>
                <strong>{settings.tmdb.apiKeyMasked}</strong>
              </p>
            </div>
          )}

          <div>
            <label htmlFor="tmdb-api-key" className={labelClass}>
              {settings?.tmdb.hasApiKey ? 'Update TMDB API Key' : 'TMDB API Key'}
            </label>
            <input
              id="tmdb-api-key"
              type="password"
              value={tmdbApiKey}
              onChange={(e) => {
                setTmdbApiKey(e.target.value);
                setTmdbValid(null);
                clearMessages();
              }}
              placeholder="Enter new TMDB API key"
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-decidarr-text-muted text-xs mt-2">
              Get a free API key from{' '}
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-decidarr-primary hover:underline"
              >
                TMDB
              </a>
            </p>
          </div>

          {tmdbValid === true && (
            <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
              <p className="text-green-400 text-sm">TMDB API key is valid</p>
            </div>
          )}
          {tmdbValid === false && (
            <div role="status" className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm">TMDB API key is invalid</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTestTmdb}
              disabled={saving || !tmdbApiKey.trim()}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
            >
              {saving ? 'Testing...' : 'Test API Key'}
            </button>
            <button
              type="button"
              onClick={handleSaveTmdb}
              disabled={saving || !tmdbApiKey.trim()}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {subTab === 'tautulli' && (
        <div className="space-y-5">
          {settings?.tautulli?.url && (
            <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
              <p className="text-decidarr-text text-sm">
                <span className="text-decidarr-text-muted">URL: </span>
                <strong>{settings.tautulli.url}</strong>
              </p>
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>Status: </span>{settings.tautulli.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="tautulli-url" className={labelClass}>Tautulli URL</label>
            <input
              id="tautulli-url"
              type="url"
              value={tautulliUrl}
              onChange={(e) => {
                setTautulliUrl(e.target.value);
                setTautulliValid(null);
                clearMessages();
              }}
              placeholder="http://192.168.1.100:8181"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="tautulli-api-key" className={labelClass}>Tautulli API Key</label>
            <input
              id="tautulli-api-key"
              type="password"
              value={tautulliApiKey}
              onChange={(e) => {
                setTautulliApiKey(e.target.value);
                setTautulliValid(null);
                clearMessages();
              }}
              placeholder="Enter Tautulli API key"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tautulliEnabled}
              onChange={(e) => setTautulliEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
            />
            <span className="text-decidarr-text text-sm">Enable Tautulli Integration</span>
          </label>

          {tautulliValid && tautulliUsers.length > 0 && (
            <div className="bg-decidarr-dark/50 rounded-lg p-3 border border-decidarr-border">
              <p className="text-decidarr-text text-sm font-medium mb-2">Found {tautulliUsers.length} users</p>
              <ul className="text-decidarr-text-muted text-xs space-y-1">
                {tautulliUsers.slice(0, 5).map((user) => (
                  <li key={user.user_id}>{user.friendly_name || user.username}</li>
                ))}
                {tautulliUsers.length > 5 && (
                  <li>... and {tautulliUsers.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTestTautulli}
              disabled={saving || !tautulliUrl.trim() || !tautulliApiKey.trim()}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
            >
              {saving ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSaveTautulli}
              disabled={saving || !tautulliUrl.trim() || !tautulliApiKey.trim()}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          {settings?.tautulli?.enabled && (
            <button
              type="button"
              onClick={handleSyncTautulli}
              disabled={syncingTautulli}
              className="w-full bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
            >
              {syncingTautulli ? (
                <>
                  <LoadingSpinner size="sm" />
                  Syncing...
                </>
              ) : (
                'Sync Watch History Now'
              )}
            </button>
          )}
        </div>
      )}

      {subTab === 'overseerr' && (
        <div className="space-y-5">
          {settings?.overseerr?.url && (
            <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
              <p className="text-decidarr-text text-sm">
                <span className="text-decidarr-text-muted">URL: </span>
                <strong>{settings.overseerr.url}</strong>
              </p>
              {overseerrVersion && (
                <p className="text-decidarr-text-muted text-sm mt-1">
                  <span>Version: </span>{overseerrVersion}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="overseerr-url" className={labelClass}>Overseerr URL</label>
            <input
              id="overseerr-url"
              type="url"
              value={overseerrUrl}
              onChange={(e) => {
                setOverseerrUrl(e.target.value);
                setOverseerrValid(null);
                clearMessages();
              }}
              placeholder="http://192.168.1.100:5055"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="overseerr-api-key" className={labelClass}>Overseerr API Key</label>
            <input
              id="overseerr-api-key"
              type="password"
              value={overseerrApiKey}
              onChange={(e) => {
                setOverseerrApiKey(e.target.value);
                setOverseerrValid(null);
                clearMessages();
              }}
              placeholder="Enter Overseerr API key"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overseerrFilterEnabled}
              onChange={(e) => setOverseerrFilterEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
            />
            <span className="text-decidarr-text text-sm">Enable Overseerr Filter</span>
          </label>
          <p className="text-decidarr-text-muted text-xs -mt-2">
            Only show movies that have been requested in Overseerr
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTestOverseerr}
              disabled={saving || !overseerrUrl.trim() || !overseerrApiKey.trim()}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
            >
              {saving ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSaveOverseerr}
              disabled={saving || !overseerrUrl.trim() || !overseerrApiKey.trim()}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
