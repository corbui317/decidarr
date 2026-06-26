'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  settingsApi,
  tautulliApi,
  overseerrApi,
  adminUsersApi,
  spinHistoryApi,
  userPreferencesApi,
  SettingsResponse,
  PlexTestResponse,
  TautulliUser,
  PlexFriendUser,
  isAuthError,
  AnimationStyle,
  AnimationSpeed,
} from '@/lib/api';
import { useTheme, AppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from './LoadingSpinner';
import GeneralTab from './settings/GeneralTab';
import IntegrationsTab from './settings/IntegrationsTab';
import AppearanceTab from './settings/AppearanceTab';
import AdminTab from './settings/AdminTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'general' | 'integrations' | 'appearance' | 'admin';

const LOAD_TIMEOUT_MS = 15000;

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme: currentTheme, saveTheme } = useTheme();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('appearance');
  const [plexFriends, setPlexFriends] = useState<PlexFriendUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [isAuthErrorState, setIsAuthErrorState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  const [plexToken, setPlexToken] = useState('');
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexValidation, setPlexValidation] = useState<PlexTestResponse | null>(null);
  const [availableServers, setAvailableServers] = useState<Array<{ name: string; uri: string }>>([]);

  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbValid, setTmdbValid] = useState<boolean | null>(null);

  const [syncFrequencyHours, setSyncFrequencyHours] = useState(24);

  const [tautulliUrl, setTautulliUrl] = useState('');
  const [tautulliApiKey, setTautulliApiKey] = useState('');
  const [tautulliEnabled, setTautulliEnabled] = useState(false);
  const [tautulliUsers, setTautulliUsers] = useState<TautulliUser[]>([]);
  const [tautulliValid, setTautulliValid] = useState<boolean | null>(null);
  const [syncingTautulli, setSyncingTautulli] = useState(false);

  const [overseerrUrl, setOverseerrUrl] = useState('');
  const [overseerrApiKey, setOverseerrApiKey] = useState('');
  const [overseerrFilterEnabled, setOverseerrFilterEnabled] = useState(false);
  const [overseerrValid, setOverseerrValid] = useState<boolean | null>(null);
  const [overseerrVersion, setOverseerrVersion] = useState<string | null>(null);

  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(currentTheme);
  const [defaultMediaType, setDefaultMediaType] = useState<'movie' | 'show'>('movie');
  const [tvSelectionMode, setTvSelectionMode] = useState<'show' | 'episode'>('show');
  const [animationStyle, setAnimationStyle] = useState<AnimationStyle>('slots');
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>('normal');

  const [spinHistoryEnabled, setSpinHistoryEnabled] = useState(true);
  const [spinHistoryRetention, setSpinHistoryRetention] = useState(50);
  const [spinHistoryStoreSnapshots, setSpinHistoryStoreSnapshots] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const switchTab = useCallback((tab: Tab) => {
    if (saving) return;
    setActiveTab(tab);
    clearMessages();
  }, [saving, clearMessages]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => closeButtonRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, activeTab, loading]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadingTimedOut(false);
    setIsAuthErrorState(false);

    try {
      let adminUiDefaults: SettingsResponse['uiPreferences'] | null = null;

      if (isAdmin) {
        const data = await settingsApi.getSettings();
        setSettings(data);
        adminUiDefaults = data.uiPreferences;
        setPlexServerUrl(data.plex.serverUrl || '');
        setSyncFrequencyHours(data.syncFrequencyHours);
        setTautulliUrl(data.tautulli?.url || '');
        setTautulliEnabled(data.tautulli?.enabled || false);
        setOverseerrUrl(data.overseerr?.url || '');
        setOverseerrFilterEnabled(data.overseerr?.filterEnabled || false);
        setSelectedTheme(data.uiPreferences.theme as AppTheme);
        setDefaultMediaType(data.uiPreferences.defaultMediaType);
        setTvSelectionMode(data.uiPreferences.tvSelectionMode);
      }

      try {
        const prefs = await userPreferencesApi.get();
        const spinHistory = prefs.spinHistory ?? prefs.preferences.spinHistory;
        if (spinHistory) {
          setSpinHistoryEnabled(spinHistory.enabled);
          setSpinHistoryRetention(spinHistory.retentionLimit);
          setSpinHistoryStoreSnapshots(spinHistory.storeFilterSnapshot);
        }
        if (prefs.preferences.theme) {
          setSelectedTheme(prefs.preferences.theme as AppTheme);
        }
        if (prefs.preferences.defaultMediaType) {
          setDefaultMediaType(prefs.preferences.defaultMediaType);
        }
        if (prefs.preferences.tvSelectionMode) {
          setTvSelectionMode(prefs.preferences.tvSelectionMode);
        }
        setAnimationStyle(
          prefs.preferences.animationStyle ?? adminUiDefaults?.animationStyle ?? 'slots'
        );
        setAnimationSpeed(
          prefs.preferences.animationSpeed ?? adminUiDefaults?.animationSpeed ?? 'normal'
        );
      } catch (prefsErr) {
        console.warn('[SettingsModal] Could not load user preferences:', prefsErr);
        if (adminUiDefaults) {
          setAnimationStyle(adminUiDefaults.animationStyle ?? 'slots');
          setAnimationSpeed(adminUiDefaults.animationSpeed ?? 'normal');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      console.error('[SettingsModal] Load error:', message);
      setError(message);

      if (isAuthError(err)) {
        setIsAuthErrorState(true);
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isOpen && !isAdmin && activeTab !== 'appearance') {
      setActiveTab('appearance');
    }
  }, [isOpen, isAdmin, activeTab]);

  const loadUserAnimationPrefs = useCallback(async () => {
    try {
      const { preferences } = await userPreferencesApi.get();
      if (preferences.animationStyle) setAnimationStyle(preferences.animationStyle);
      if (preferences.animationSpeed) setAnimationSpeed(preferences.animationSpeed);
    } catch {
      // Non-fatal; fall back to settings defaults
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadUserAnimationPrefs();

      const timeoutId = setTimeout(() => {
        setLoadingTimedOut(true);
      }, LOAD_TIMEOUT_MS);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, loadSettings, loadUserAnimationPrefs]);

  useEffect(() => {
    setSelectedTheme(currentTheme);
  }, [currentTheme]);

  const handleTestPlex = async () => {
    if (!plexToken.trim()) {
      setError('Please enter a new Plex token');
      return;
    }
    setSaving(true);
    clearMessages();
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
    clearMessages();
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
    clearMessages();
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
    clearMessages();
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
    clearMessages();
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
    clearMessages();
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
    if (tautulliEnabled && !tautulliUrl.trim()) {
      setError('Tautulli URL is required when sync is enabled');
      return;
    }
    if (tautulliEnabled && !tautulliApiKey.trim() && !settings?.tautulli?.hasKey) {
      setError('Tautulli API key is required when sync is enabled');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      await settingsApi.updateSettings({
        tautulli: {
          url: tautulliUrl.trim(),
          enabled: tautulliEnabled,
          ...(tautulliApiKey.trim() ? { apiKey: tautulliApiKey.trim() } : {}),
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
    if (!settings?.tautulli?.url || !settings?.tautulli?.hasKey) {
      setError('Save your Tautulli URL and API key before syncing watch history');
      return;
    }

    setSyncingTautulli(true);
    clearMessages();
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

  const handleTestOverseerr = async () => {
    if (!overseerrUrl.trim() || !overseerrApiKey.trim()) {
      setError('Please enter Overseerr URL and API key');
      return;
    }
    setSaving(true);
    clearMessages();
    try {
      const result = await overseerrApi.test(overseerrUrl.trim(), overseerrApiKey.trim());
      setOverseerrValid(result.success);
      if (result.success) {
        setOverseerrVersion(result.version || null);
        setSuccess(
          result.version
            ? `Connected to Overseerr ${result.version}`
            : 'Connected to Overseerr'
        );
      } else {
        setError(result.error || 'Failed to connect to Overseerr');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test Overseerr');
      setOverseerrValid(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOverseerr = async () => {
    setSaving(true);
    clearMessages();
    try {
      await settingsApi.updateSettings({
        overseerr: {
          url: overseerrUrl.trim() || undefined,
          apiKey: overseerrApiKey.trim() || undefined,
          filterEnabled: overseerrFilterEnabled,
        },
      });
      setSuccess('Overseerr settings saved');
      setOverseerrApiKey('');
      setOverseerrValid(null);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Overseerr settings');
    } finally {
      setSaving(false);
    }
  };

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const data = await adminUsersApi.list();
      setPlexFriends(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isOpen && activeTab === 'admin' && isAdmin) {
      loadUsers();
    }
  }, [isOpen, activeTab, isAdmin, loadUsers]);

  const handleToggleUser = async (plexUserId: string, approved: boolean) => {
    setSaving(true);
    clearMessages();
    try {
      await adminUsersApi.setApproved(plexUserId, approved);
      setPlexFriends((prev) =>
        prev.map((u) => (u.id === plexUserId ? { ...u, isApproved: approved } : u))
      );
      setSuccess(approved ? 'User access granted' : 'User access revoked');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    clearMessages();
    try {
      await saveTheme(selectedTheme);
      if (isAdmin) {
        await settingsApi.updateSettings({
          uiPreferences: {
            theme: selectedTheme,
            defaultMediaType,
            tvSelectionMode,
            animationStyle,
            animationSpeed,
          },
        });
      }
      await userPreferencesApi.update({
        theme: selectedTheme,
        defaultMediaType,
        tvSelectionMode,
        animationStyle,
        animationSpeed,
      });
      await userPreferencesApi.updateSpinHistory({
        enabled: spinHistoryEnabled,
        retentionLimit: Math.max(1, Math.min(500, spinHistoryRetention)),
        storeFilterSnapshot: spinHistoryStoreSnapshots,
      });
      window.dispatchEvent(new CustomEvent('decidarr:preferences-updated', {
        detail: {
          animationStyle,
          animationSpeed,
          defaultMediaType,
          tvSelectionMode,
        },
      }));
      setSuccess('Preferences saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleClearSpinHistory = async () => {
    setClearingHistory(true);
    clearMessages();
    try {
      const result = await spinHistoryApi.clearAll();
      setSuccess(`Cleared ${result.deleted} spin history ${result.deleted === 1 ? 'entry' : 'entries'}`);
      setShowClearConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear spin history');
    } finally {
      setClearingHistory(false);
    }
  };

  const visibleTabs: { id: Tab; label: string }[] = isAdmin
    ? [
        { id: 'appearance', label: 'Appearance' },
        { id: 'integrations', label: 'Integrations' },
        { id: 'general', label: 'General' },
        { id: 'admin', label: 'Users' },
      ]
    : [{ id: 'appearance', label: 'Preferences' }];

  if (!isOpen) return null;

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-decidarr-border">
          <h2 id="settings-modal-title" className="text-xl font-bold text-decidarr-text">
            Settings
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-decidarr-text-muted hover:text-decidarr-text transition-colors rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-decidarr-primary"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-decidarr-border overflow-x-auto" role="tablist" aria-label="Settings sections">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tab-panel-${tab.id}`}
              disabled={saving}
              onClick={() => switchTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-decidarr-primary disabled:opacity-50 ${
                activeTab === tab.id
                  ? 'text-decidarr-primary border-b-2 border-decidarr-primary'
                  : 'text-decidarr-text-muted hover:text-decidarr-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12" role="status" aria-label="Loading settings">
              <LoadingSpinner size="lg" />
              {loadingTimedOut && (
                <div className="mt-4 text-center">
                  <p className="text-decidarr-text-muted text-sm">Taking longer than expected...</p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 text-decidarr-primary hover:underline text-sm"
                  >
                    Close and try again later
                  </button>
                </div>
              )}
            </div>
          ) : isAuthErrorState ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-4">🔐</div>
              <h3 className="text-lg font-semibold text-decidarr-text mb-2">Session Expired</h3>
              <p className="text-decidarr-text-muted mb-4">
                Your session has expired. Please log in again.
              </p>
              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                className="px-4 py-2 bg-decidarr-primary text-decidarr-dark font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                Re-Login
              </button>
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

              {activeTab === 'general' && isAdmin && (
                <GeneralTab
                  syncFrequencyHours={syncFrequencyHours}
                  onSyncFrequencyChange={setSyncFrequencyHours}
                  saving={saving}
                  onSave={handleSaveSync}
                />
              )}

              {activeTab === 'integrations' && isAdmin && (
                <IntegrationsTab
                  settings={settings}
                  plexToken={plexToken}
                  onPlexTokenChange={setPlexToken}
                  plexServerUrl={plexServerUrl}
                  onPlexServerUrlChange={setPlexServerUrl}
                  plexValidation={plexValidation}
                  onPlexValidationClear={() => setPlexValidation(null)}
                  availableServers={availableServers}
                  tmdbApiKey={tmdbApiKey}
                  onTmdbApiKeyChange={setTmdbApiKey}
                  tmdbValid={tmdbValid}
                  onTmdbValidClear={() => setTmdbValid(null)}
                  tautulliUrl={tautulliUrl}
                  onTautulliUrlChange={setTautulliUrl}
                  tautulliApiKey={tautulliApiKey}
                  onTautulliApiKeyChange={setTautulliApiKey}
                  tautulliEnabled={tautulliEnabled}
                  onTautulliEnabledChange={setTautulliEnabled}
                  tautulliUsers={tautulliUsers}
                  tautulliValid={tautulliValid}
                  syncingTautulli={syncingTautulli}
                  overseerrUrl={overseerrUrl}
                  onOverseerrUrlChange={setOverseerrUrl}
                  overseerrApiKey={overseerrApiKey}
                  onOverseerrApiKeyChange={setOverseerrApiKey}
                  overseerrFilterEnabled={overseerrFilterEnabled}
                  onOverseerrFilterEnabledChange={setOverseerrFilterEnabled}
                  overseerrValid={overseerrValid}
                  overseerrVersion={overseerrVersion}
                  saving={saving}
                  onTestPlex={handleTestPlex}
                  onSavePlex={handleSavePlex}
                  onTestTmdb={handleTestTmdb}
                  onSaveTmdb={handleSaveTmdb}
                  onTestTautulli={handleTestTautulli}
                  onSaveTautulli={handleSaveTautulli}
                  onSyncTautulli={handleSyncTautulli}
                  onTestOverseerr={handleTestOverseerr}
                  onSaveOverseerr={handleSaveOverseerr}
                  onClearMessages={clearMessages}
                />
              )}

              {activeTab === 'appearance' && (
                <AppearanceTab
                  selectedTheme={selectedTheme}
                  onThemeChange={setSelectedTheme}
                  defaultMediaType={defaultMediaType}
                  onDefaultMediaTypeChange={setDefaultMediaType}
                  tvSelectionMode={tvSelectionMode}
                  onTvSelectionModeChange={setTvSelectionMode}
                  spinHistoryEnabled={spinHistoryEnabled}
                  onSpinHistoryEnabledChange={setSpinHistoryEnabled}
                  spinHistoryRetention={spinHistoryRetention}
                  onSpinHistoryRetentionChange={setSpinHistoryRetention}
                  spinHistoryStoreSnapshots={spinHistoryStoreSnapshots}
                  onSpinHistoryStoreSnapshotsChange={setSpinHistoryStoreSnapshots}
                  showClearConfirm={showClearConfirm}
                  onShowClearConfirm={setShowClearConfirm}
                  clearingHistory={clearingHistory}
                  onClearSpinHistory={handleClearSpinHistory}
                  animationStyle={animationStyle}
                  onAnimationStyleChange={setAnimationStyle}
                  animationSpeed={animationSpeed}
                  onAnimationSpeedChange={setAnimationSpeed}
                  saving={saving}
                  onSave={handleSavePreferences}
                />
              )}

              {activeTab === 'admin' && isAdmin && (
                <AdminTab
                  plexFriends={plexFriends}
                  loadingUsers={loadingUsers}
                  saving={saving}
                  onToggleUser={handleToggleUser}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
