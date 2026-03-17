'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { settingsApi, tautulliApi, SettingsResponse, PlexTestResponse, TautulliUser } from '@/lib/api';
import { useTheme, THEME_CONFIG, AppTheme } from '@/context/ThemeContext';
import LoadingSpinner from './LoadingSpinner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'plex' | 'tmdb' | 'tautulli' | 'sync' | 'preferences';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme: currentTheme, saveTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('plex');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  // Plex tab
  const [plexToken, setPlexToken] = useState('');
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexValidation, setPlexValidation] = useState<PlexTestResponse | null>(null);
  const [availableServers, setAvailableServers] = useState<Array<{ name: string; uri: string }>>([]);

  // TMDB tab
  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbValid, setTmdbValid] = useState<boolean | null>(null);

  // Sync tab
  const [syncFrequencyHours, setSyncFrequencyHours] = useState(24);

  // Tautulli tab
  const [tautulliUrl, setTautulliUrl] = useState('');
  const [tautulliApiKey, setTautulliApiKey] = useState('');
  const [tautulliEnabled, setTautulliEnabled] = useState(false);
  const [tautulliUsers, setTautulliUsers] = useState<TautulliUser[]>([]);
  const [tautulliValid, setTautulliValid] = useState<boolean | null>(null);
  const [syncingTautulli, setSyncingTautulli] = useState(false);

  // Preferences tab
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(currentTheme);
  const [defaultMediaType, setDefaultMediaType] = useState<'movie' | 'show'>('movie');
  const [tvSelectionMode, setTvSelectionMode] = useState<'show' | 'episode'>('show');

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Trap focus inside modal
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => closeButtonRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await settingsApi.getSettings();
      setSettings(data);
      setPlexServerUrl(data.plex.serverUrl || '');
      setSyncFrequencyHours(data.syncFrequencyHours);
      setTautulliUrl(data.tautulli?.url || '');
      setTautulliEnabled(data.tautulli?.enabled || false);
      setSelectedTheme(data.uiPreferences.theme as AppTheme);
      setDefaultMediaType(data.uiPreferences.defaultMediaType);
      setTvSelectionMode(data.uiPreferences.tvSelectionMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, loadSettings]);

  // Keep selectedTheme in sync when currentTheme changes externally
  useEffect(() => {
    setSelectedTheme(currentTheme);
  }, [currentTheme]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sync settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestTautulli = async () => {
    if (!tautulliUrl.trim() || !tautulliApiKey.trim()) {
      setError('Please enter Tautulli URL and API key');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await tautulliApi.test(tautulliUrl.trim(), tautulliApiKey.trim());
      setTautulliValid(result.success);
      if (result.success && result.users) {
        setTautulliUsers(result.users);
        setSuccess(`Connected! Found ${result.users.length} users`);
      } else {
        setError(result.error || 'Failed to connect to Tautulli');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test Tautulli');
      setTautulliValid(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTautulli = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await settingsApi.updateSettings({
        tautulli: {
          url: tautulliUrl.trim() || undefined,
          apiKey: tautulliApiKey.trim() || undefined,
          enabled: tautulliEnabled,
        },
      });
      setSuccess('Tautulli settings saved');
      setTautulliApiKey('');
      setTautulliValid(null);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Tautulli settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncTautulli = async () => {
    setSyncingTautulli(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await tautulliApi.sync();
      if (result.success) {
        setSuccess(`Synced ${result.synced} items (${result.movies} movies, ${result.shows} shows)`);
        await loadSettings();
      } else {
        setError(result.error || 'Sync failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync with Tautulli');
    } finally {
      setSyncingTautulli(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveTheme(selectedTheme);
      await settingsApi.updateSettings({
        uiPreferences: { theme: selectedTheme, defaultMediaType, tvSelectionMode },
      });
      setSuccess('Preferences saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full bg-decidarr-input border border-decidarr-border rounded-lg px-4 py-3 text-decidarr-text placeholder-decidarr-text-muted focus:outline-none focus:border-decidarr-primary transition-colors';
  const labelClass = 'block text-decidarr-text-muted text-sm font-medium mb-2';

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-decidarr-secondary border border-decidarr-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-decidarr-border">
          <h2 id="settings-modal-title" className="text-xl font-bold text-decidarr-text">
            Settings
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close settings"
            className="text-decidarr-text-muted hover:text-decidarr-text transition-colors rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-decidarr-primary"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-decidarr-border overflow-x-auto" role="tablist" aria-label="Settings sections">
          {([
            { id: 'plex', label: 'Plex' },
            { id: 'tmdb', label: 'TMDB' },
            { id: 'tautulli', label: 'Tautulli' },
            { id: 'sync', label: 'Sync' },
            { id: 'preferences', label: 'Prefs' },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tab-panel-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-decidarr-primary ${
                activeTab === tab.id
                  ? 'text-decidarr-primary border-b-2 border-decidarr-primary'
                  : 'text-decidarr-text-muted hover:text-decidarr-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading settings">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              {success && (
                <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 mb-4">
                  <p className="text-green-400 text-sm">{success}</p>
                </div>
              )}

              {/* Plex Tab */}
              {activeTab === 'plex' && (
                <div id="tab-panel-plex" role="tabpanel" className="space-y-5">
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
                      onChange={e => {
                        setPlexToken(e.target.value);
                        setPlexValidation(null);
                        setError(null);
                        setSuccess(null);
                      }}
                      placeholder="Enter new Plex token"
                      className={inputClass}
                      style={{ background: 'var(--decidarr-input-bg)' }}
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
                        onChange={e => setPlexServerUrl(e.target.value)}
                        className={inputClass}
                        style={{ background: 'var(--decidarr-input-bg)' }}
                      >
                        {availableServers.map(server => (
                          <option key={server.uri} value={server.uri}>{server.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="plex-server-url"
                        type="url"
                        value={plexServerUrl}
                        onChange={e => setPlexServerUrl(e.target.value)}
                        placeholder="http://192.168.1.100:32400"
                        className={inputClass}
                        style={{ background: 'var(--decidarr-input-bg)' }}
                      />
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleTestPlex}
                      disabled={saving || !plexToken.trim()}
                      aria-busy={saving}
                      className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? <LoadingSpinner size="sm" /> : 'Test Connection'}
                    </button>
                    <button
                      onClick={handleSavePlex}
                      disabled={saving || (!plexToken.trim() && !plexServerUrl.trim())}
                      aria-busy={saving}
                      className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {saving ? <LoadingSpinner size="sm" /> : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* TMDB Tab */}
              {activeTab === 'tmdb' && (
                <div id="tab-panel-tmdb" role="tabpanel" className="space-y-5">
                  <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
                    <p className="text-decidarr-text text-sm">
                      <span className="text-decidarr-text-muted">Status: </span>
                      {settings?.tmdb.hasKey ? (
                        <span className="text-green-400">Configured</span>
                      ) : (
                        <span className="text-decidarr-text-muted">Not configured</span>
                      )}
                    </p>
                    {settings?.tmdb.keyMasked && (
                      <p className="text-decidarr-text-muted text-sm mt-1">
                        <span>Key: </span>{settings.tmdb.keyMasked}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="tmdb-key" className={labelClass}>
                      {settings?.tmdb.hasKey ? 'Update TMDB API Key' : 'TMDB API Key'}
                    </label>
                    <input
                      id="tmdb-key"
                      type="password"
                      value={tmdbApiKey}
                      onChange={e => {
                        setTmdbApiKey(e.target.value);
                        setTmdbValid(null);
                        setError(null);
                        setSuccess(null);
                      }}
                      placeholder="Enter TMDB API key"
                      className={inputClass}
                      style={{ background: 'var(--decidarr-input-bg)' }}
                    />
                    <p className="text-decidarr-text-muted text-xs mt-1">
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
                    <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
                      <p className="text-green-400 text-sm">API key is valid</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleTestTmdb}
                      disabled={saving || !tmdbApiKey.trim()}
                      className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Test API Key
                    </button>
                    <button
                      onClick={handleSaveTmdb}
                      disabled={saving}
                      className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {saving ? <LoadingSpinner size="sm" /> : tmdbApiKey.trim() ? 'Save' : 'Remove Key'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tautulli Tab */}
              {activeTab === 'tautulli' && (
                <div id="tab-panel-tautulli" role="tabpanel" className="space-y-5">
                  <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
                    <p className="text-decidarr-text text-sm">
                      <span className="text-decidarr-text-muted">Status: </span>
                      {settings?.tautulli?.enabled ? (
                        <span className="text-green-400">Enabled</span>
                      ) : settings?.tautulli?.hasKey ? (
                        <span className="text-yellow-400">Configured (disabled)</span>
                      ) : (
                        <span className="text-decidarr-text-muted">Not configured</span>
                      )}
                    </p>
                    {settings?.tautulli?.url && (
                      <p className="text-decidarr-text-muted text-sm mt-1">
                        <span>URL: </span>{settings.tautulli.url}
                      </p>
                    )}
                    {settings?.tautulli?.lastSync && (
                      <p className="text-decidarr-text-muted text-sm mt-1">
                        <span>Last sync: </span>{new Date(settings.tautulli.lastSync).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="tautulli-url" className={labelClass}>Tautulli URL</label>
                    <input
                      id="tautulli-url"
                      type="url"
                      value={tautulliUrl}
                      onChange={e => {
                        setTautulliUrl(e.target.value);
                        setTautulliValid(null);
                      }}
                      placeholder="http://192.168.1.100:8181"
                      className={inputClass}
                      style={{ background: 'var(--decidarr-input-bg)' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="tautulli-key" className={labelClass}>
                      {settings?.tautulli?.hasKey ? 'Update API Key' : 'API Key'}
                    </label>
                    <input
                      id="tautulli-key"
                      type="password"
                      value={tautulliApiKey}
                      onChange={e => {
                        setTautulliApiKey(e.target.value);
                        setTautulliValid(null);
                      }}
                      placeholder="Enter Tautulli API key"
                      className={inputClass}
                      style={{ background: 'var(--decidarr-input-bg)' }}
                    />
                    <p className="text-decidarr-text-muted text-xs mt-1">
                      Find your API key in Tautulli Settings &rarr; Web Interface &rarr; API Key
                    </p>
                  </div>

                  {tautulliValid && tautulliUsers.length > 0 && (
                    <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
                      <p className="text-green-400 text-sm mb-1">Connected! Users found:</p>
                      <div className="flex flex-wrap gap-2">
                        {tautulliUsers.map(u => (
                          <span key={u.id} className="text-xs bg-green-500/20 px-2 py-1 rounded">
                            {u.friendlyName || u.username}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tautulliEnabled}
                        onChange={e => setTautulliEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
                      />
                      <span className="text-decidarr-text text-sm">Enable Tautulli watch history sync</span>
                    </label>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleTestTautulli}
                      disabled={saving || !tautulliUrl.trim() || !tautulliApiKey.trim()}
                      className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Test Connection
                    </button>
                    <button
                      onClick={handleSaveTautulli}
                      disabled={saving}
                      className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {saving ? <LoadingSpinner size="sm" /> : 'Save'}
                    </button>
                  </div>

                  {settings?.tautulli?.enabled && (
                    <button
                      onClick={handleSyncTautulli}
                      disabled={syncingTautulli}
                      className="w-full bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
                    >
                      {syncingTautulli ? (
                        <span className="flex items-center justify-center gap-2">
                          <LoadingSpinner size="sm" /> Syncing...
                        </span>
                      ) : (
                        'Sync Watch History Now'
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Sync Tab */}
              {activeTab === 'sync' && (
                <div id="tab-panel-sync" role="tabpanel" className="space-y-5">
                  <div>
                    <label htmlFor="sync-frequency" className={labelClass}>
                      Library Sync Frequency
                    </label>
                    <select
                      id="sync-frequency"
                      value={syncFrequencyHours}
                      onChange={e => setSyncFrequencyHours(Number(e.target.value))}
                      className={inputClass}
                      style={{ background: 'var(--decidarr-input-bg)' }}
                    >
                      <option value={1}>Every hour</option>
                      <option value={6}>Every 6 hours</option>
                      <option value={12}>Every 12 hours</option>
                      <option value={24}>Every 24 hours</option>
                      <option value={48}>Every 2 days</option>
                      <option value={168}>Every week</option>
                    </select>
                    <p className="text-decidarr-text-muted text-xs mt-2">
                      How often to refresh your library cache from Plex. More frequent syncs ensure
                      new content appears faster but use more resources.
                    </p>
                  </div>

                  <button
                    onClick={handleSaveSync}
                    disabled={saving}
                    className="w-full bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving ? <LoadingSpinner size="sm" /> : 'Save'}
                  </button>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div id="tab-panel-preferences" role="tabpanel" className="space-y-6">
                  {/* Theme Picker */}
                  <div>
                    <p className={labelClass}>Theme</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(Object.entries(THEME_CONFIG) as [AppTheme, typeof THEME_CONFIG[AppTheme]][]).map(
                        ([themeKey, config]) => (
                          <button
                            key={themeKey}
                            onClick={() => setSelectedTheme(themeKey)}
                            aria-pressed={selectedTheme === themeKey}
                            className={`text-left rounded-xl p-3 border-2 transition-all focus:outline-none focus:ring-2 focus:ring-decidarr-primary ${
                              selectedTheme === themeKey
                                ? 'border-decidarr-primary shadow-lg'
                                : 'border-decidarr-border hover:border-decidarr-primary/50'
                            }`}
                            style={{ background: config.colors.bg }}
                          >
                            {/* Color swatches */}
                            <div className="flex gap-1.5 mb-2">
                              {[config.colors.bg, config.colors.surface, config.colors.primary, config.colors.accent].map(
                                (color, i) => (
                                  <div
                                    key={i}
                                    className="w-5 h-5 rounded-full border border-white/10"
                                    style={{ background: color }}
                                    aria-hidden="true"
                                  />
                                )
                              )}
                              {selectedTheme === themeKey && (
                                <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ background: config.colors.primary }}>
                                  <svg className="w-3 h-3" fill="none" stroke="#000" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <p className="font-semibold text-sm" style={{ color: config.colors.primary }}>
                              {config.label}
                            </p>
                            <p className="text-xs mt-0.5 opacity-75" style={{ color: config.colors.primary }}>
                              {config.description}
                            </p>
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="default-media-type" className={labelClass}>
                      Default Media Type
                    </label>
                    <select
                      id="default-media-type"
                      value={defaultMediaType}
                      onChange={e => setDefaultMediaType(e.target.value as 'movie' | 'show')}
                      className={inputClass}
                      style={{ background: 'var(--decidarr-input-bg)' }}
                    >
                      <option value="movie">Movies</option>
                      <option value="show">TV Shows</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="tv-selection-mode" className={labelClass}>
                      TV Selection Mode
                    </label>
                    <select
                      id="tv-selection-mode"
                      value={tvSelectionMode}
                      onChange={e => setTvSelectionMode(e.target.value as 'show' | 'episode')}
                      className={inputClass}
                      style={{ background: 'var(--decidarr-input-bg)' }}
                    >
                      <option value="show">Pick a Show</option>
                      <option value="episode">Pick an Episode</option>
                    </select>
                    <p className="text-decidarr-text-muted text-xs mt-1">
                      &quot;Pick a Show&quot; selects a random TV series. &quot;Pick an Episode&quot; selects a
                      specific random episode.
                    </p>
                  </div>

                  <button
                    onClick={handleSavePreferences}
                    disabled={saving}
                    className="w-full bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving ? <LoadingSpinner size="sm" /> : 'Save Preferences'}
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
