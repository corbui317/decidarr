'use client';

import { useState, useEffect } from 'react';
import { settingsApi, SettingsResponse, PlexTestResponse } from '@/lib/api';
import LoadingSpinner from './LoadingSpinner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'plex' | 'tmdb' | 'sync' | 'preferences';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('plex');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  // Form states
  const [plexToken, setPlexToken] = useState('');
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexValidation, setPlexValidation] = useState<PlexTestResponse | null>(null);
  const [availableServers, setAvailableServers] = useState<Array<{ name: string; uri: string }>>([]);

  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbValid, setTmdbValid] = useState<boolean | null>(null);

  const [syncFrequencyHours, setSyncFrequencyHours] = useState(24);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [defaultMediaType, setDefaultMediaType] = useState<'movie' | 'show'>('movie');
  const [tvSelectionMode, setTvSelectionMode] = useState<'show' | 'episode'>('show');

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await settingsApi.getSettings();
      setSettings(data);
      setPlexServerUrl(data.plex.serverUrl || '');
      setSyncFrequencyHours(data.syncFrequencyHours);
      setTheme(data.uiPreferences.theme);
      setDefaultMediaType(data.uiPreferences.defaultMediaType);
      setTvSelectionMode(data.uiPreferences.tvSelectionMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleTestPlex = async () => {
    if (!plexToken.trim()) {
      setError('Please enter a new Plex token');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await settingsApi.testPlex(plexToken.trim(), plexServerUrl.trim() || undefined);
      setPlexValidation(result);

      if (result.valid && result.servers) {
        setAvailableServers(result.servers);
        if (!plexServerUrl && result.servers.length > 0) {
          setPlexServerUrl(result.servers[0].uri);
        }
        setSuccess('Plex token is valid');
      } else if (!result.valid) {
        setError(result.error || 'Invalid Plex token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate Plex token');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlex = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await settingsApi.updateSettings({
        plex: {
          token: plexToken.trim() || undefined,
          serverUrl: plexServerUrl.trim() || undefined,
        },
      });
      setSuccess('Plex settings saved');
      setPlexToken('');
      setPlexValidation(null);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Plex settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestTmdb = async () => {
    if (!tmdbApiKey.trim()) {
      setError('Please enter a TMDB API key');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await settingsApi.testTmdb(tmdbApiKey.trim());
      setTmdbValid(result.valid);
      if (result.valid) {
        setSuccess('TMDB API key is valid');
      } else {
        setError(result.error || 'Invalid TMDB API key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate TMDB key');
      setTmdbValid(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTmdb = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await settingsApi.updateSettings({
        tmdb: { apiKey: tmdbApiKey.trim() || '' },
      });
      setSuccess('TMDB settings saved');
      setTmdbApiKey('');
      setTmdbValid(null);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save TMDB settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSync = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await settingsApi.updateSettings({ syncFrequencyHours });
      setSuccess('Sync settings saved');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sync settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await settingsApi.updateSettings({
        uiPreferences: { theme, defaultMediaType, tvSelectionMode },
      });
      setSuccess('Preferences saved');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-decidarr-secondary rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {[
            { id: 'plex', label: 'Plex' },
            { id: 'tmdb', label: 'TMDB' },
            { id: 'sync', label: 'Sync' },
            { id: 'preferences', label: 'Preferences' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as Tab);
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-decidarr-primary border-b-2 border-decidarr-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <>
              {/* Alerts */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              {success && (
                <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 mb-4">
                  <p className="text-green-400 text-sm">{success}</p>
                </div>
              )}

              {/* Plex Tab */}
              {activeTab === 'plex' && (
                <div className="space-y-6">
                  {/* Current Status */}
                  {settings?.plex.hasToken && (
                    <div className="bg-decidarr-dark/50 rounded-lg p-4">
                      <p className="text-gray-300 text-sm">
                        <span className="text-gray-500">Connected as:</span>{' '}
                        <strong>{settings.plex.username || 'Unknown'}</strong>
                      </p>
                      <p className="text-gray-400 text-sm mt-1">
                        <span className="text-gray-500">Server:</span>{' '}
                        {settings.plex.serverUrl || 'Not set'}
                      </p>
                      <p className="text-gray-400 text-sm mt-1">
                        <span className="text-gray-500">Token:</span>{' '}
                        {settings.plex.tokenMasked}
                      </p>
                    </div>
                  )}

                  {/* Update Token */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      {settings?.plex.hasToken ? 'Update Plex Token' : 'Plex Token'}
                    </label>
                    <input
                      type="password"
                      value={plexToken}
                      onChange={(e) => {
                        setPlexToken(e.target.value);
                        setPlexValidation(null);
                        setError(null);
                        setSuccess(null);
                      }}
                      placeholder="Enter new Plex token"
                      className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-decidarr-primary"
                    />
                  </div>

                  {plexValidation?.valid && (
                    <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
                      <p className="text-green-400 text-sm">
                        Validated as <strong>{plexValidation.user?.username}</strong>
                      </p>
                    </div>
                  )}

                  {/* Server URL */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Server URL</label>
                    {availableServers.length > 0 ? (
                      <select
                        value={plexServerUrl}
                        onChange={(e) => setPlexServerUrl(e.target.value)}
                        className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-decidarr-primary"
                      >
                        {availableServers.map((server) => (
                          <option key={server.uri} value={server.uri}>
                            {server.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={plexServerUrl}
                        onChange={(e) => setPlexServerUrl(e.target.value)}
                        placeholder="http://192.168.1.100:32400"
                        className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-decidarr-primary"
                      />
                    )}
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={handleTestPlex}
                      disabled={saving || !plexToken.trim()}
                      className="flex-1 bg-gray-700 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Test Connection
                    </button>
                    <button
                      onClick={handleSavePlex}
                      disabled={saving || (!plexToken.trim() && !plexServerUrl.trim())}
                      className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {saving ? <LoadingSpinner size="sm" /> : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* TMDB Tab */}
              {activeTab === 'tmdb' && (
                <div className="space-y-6">
                  {/* Current Status */}
                  <div className="bg-decidarr-dark/50 rounded-lg p-4">
                    <p className="text-gray-300 text-sm">
                      <span className="text-gray-500">Status:</span>{' '}
                      {settings?.tmdb.hasKey ? (
                        <span className="text-green-400">Configured</span>
                      ) : (
                        <span className="text-gray-400">Not configured</span>
                      )}
                    </p>
                    {settings?.tmdb.keyMasked && (
                      <p className="text-gray-400 text-sm mt-1">
                        <span className="text-gray-500">Key:</span> {settings.tmdb.keyMasked}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      {settings?.tmdb.hasKey ? 'Update TMDB API Key' : 'TMDB API Key'}
                    </label>
                    <input
                      type="password"
                      value={tmdbApiKey}
                      onChange={(e) => {
                        setTmdbApiKey(e.target.value);
                        setTmdbValid(null);
                        setError(null);
                        setSuccess(null);
                      }}
                      placeholder="Enter TMDB API key"
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
                      <p className="text-green-400 text-sm">API key is valid</p>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={handleTestTmdb}
                      disabled={saving || !tmdbApiKey.trim()}
                      className="flex-1 bg-gray-700 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Test API Key
                    </button>
                    <button
                      onClick={handleSaveTmdb}
                      disabled={saving}
                      className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {saving ? <LoadingSpinner size="sm" /> : tmdbApiKey.trim() ? 'Save' : 'Remove Key'}
                    </button>
                  </div>
                </div>
              )}

              {/* Sync Tab */}
              {activeTab === 'sync' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      Library Sync Frequency
                    </label>
                    <select
                      value={syncFrequencyHours}
                      onChange={(e) => setSyncFrequencyHours(Number(e.target.value))}
                      className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-decidarr-primary"
                    >
                      <option value={1}>Every hour</option>
                      <option value={6}>Every 6 hours</option>
                      <option value={12}>Every 12 hours</option>
                      <option value={24}>Every 24 hours</option>
                      <option value={48}>Every 2 days</option>
                      <option value={168}>Every week</option>
                    </select>
                    <p className="text-gray-500 text-xs mt-2">
                      How often to refresh your library cache from Plex. More frequent syncs ensure
                      new content appears faster but use more resources.
                    </p>
                  </div>

                  <button
                    onClick={handleSaveSync}
                    disabled={saving}
                    className="w-full bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {saving ? <LoadingSpinner size="sm" /> : 'Save'}
                  </button>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Theme</label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
                      className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-decidarr-primary"
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light (Coming Soon)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      Default Media Type
                    </label>
                    <select
                      value={defaultMediaType}
                      onChange={(e) => setDefaultMediaType(e.target.value as 'movie' | 'show')}
                      className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-decidarr-primary"
                    >
                      <option value="movie">Movies</option>
                      <option value="show">TV Shows</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      TV Selection Mode
                    </label>
                    <select
                      value={tvSelectionMode}
                      onChange={(e) => setTvSelectionMode(e.target.value as 'show' | 'episode')}
                      className="w-full bg-decidarr-dark border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-decidarr-primary"
                    >
                      <option value="show">Pick a Show</option>
                      <option value="episode">Pick an Episode</option>
                    </select>
                    <p className="text-gray-500 text-xs mt-2">
                      &quot;Pick a Show&quot; selects a random TV series. &quot;Pick an Episode&quot; selects a
                      specific random episode.
                    </p>
                  </div>

                  <button
                    onClick={handleSavePreferences}
                    disabled={saving}
                    className="w-full bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:bg-decidarr-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {saving ? <LoadingSpinner size="sm" /> : 'Save'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
