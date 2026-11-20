'use client';

import { useState, useEffect, useCallback } from 'react';
import { settingsApi, tautulliApi, SettingsResponse, TautulliUser } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';
import LoadingSpinner from '@/components/LoadingSpinner';

interface TautulliIntegrationProps {
  settings: SettingsResponse | null;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  onClearMessages: () => void;
}

export default function TautulliIntegration({
  settings,
  onError,
  onSuccess,
  onClearMessages,
}: TautulliIntegrationProps) {
  const [saving, setSaving] = useState(false);
  const [syncingTautulli, setSyncingTautulli] = useState(false);
  const [tautulliUrl, setTautulliUrl] = useState('');
  const [tautulliApiKey, setTautulliApiKey] = useState('');
  const [tautulliEnabled, setTautulliEnabled] = useState(false);
  const [tautulliUsers, setTautulliUsers] = useState<TautulliUser[]>([]);
  const [tautulliValid, setTautulliValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (settings) {
      setTautulliUrl(settings.tautulli?.url || '');
      setTautulliEnabled(settings.tautulli?.enabled || false);
    }
  }, [settings]);

  const handleTestTautulli = useCallback(async () => {
    if (!tautulliUrl.trim() || !tautulliApiKey.trim()) {
      onError('Please provide both Tautulli URL and API key');
      return;
    }

    setSaving(true);
    onClearMessages();
    try {
      const result = await tautulliApi.test(tautulliUrl, tautulliApiKey);
      setTautulliValid(result.success);
      if (result.success && result.users) {
        setTautulliUsers(result.users);
      }
      if (!result.success) {
        onError('Tautulli connection test failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test Tautulli';
      onError(message);
      setTautulliValid(false);
    } finally {
      setSaving(false);
    }
  }, [tautulliUrl, tautulliApiKey, onError, onClearMessages]);

  const handleSaveTautulli = useCallback(async () => {
    if (!tautulliUrl.trim() || !tautulliApiKey.trim()) {
      onError('Please provide both Tautulli URL and API key');
      return;
    }

    setSaving(true);
    onClearMessages();
    try {
      await settingsApi.updateSettings({
        tautulli: {
          url: tautulliUrl,
          apiKey: tautulliApiKey,
          enabled: tautulliEnabled,
        },
      });
      onSuccess('Tautulli settings saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Tautulli settings';
      onError(message);
    } finally {
      setSaving(false);
    }
  }, [tautulliUrl, tautulliApiKey, tautulliEnabled, onError, onSuccess, onClearMessages]);

  const handleSyncTautulli = useCallback(async () => {
    setSyncingTautulli(true);
    onClearMessages();
    try {
      await tautulliApi.sync();
      onSuccess('Tautulli watch history synced successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync Tautulli';
      onError(message);
    } finally {
      setSyncingTautulli(false);
    }
  }, [onError, onSuccess, onClearMessages]);

  return (
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
          }}
          placeholder="Enter Tautulli API key"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="tautulli-enabled" className="flex items-center gap-2 cursor-pointer">
          <input
            id="tautulli-enabled"
            type="checkbox"
            checked={tautulliEnabled}
            onChange={(e) => setTautulliEnabled(e.target.checked)}
            className="rounded border-decidarr-border bg-decidarr-surface text-decidarr-primary focus:ring-decidarr-primary focus:ring-offset-decidarr-dark"
          />
          <span className={labelClass} style={{ marginBottom: 0 }}>Enable Tautulli Integration</span>
        </label>
      </div>

      {tautulliValid === true && tautulliUsers.length > 0 && (
        <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
          <p className="text-green-400 text-sm">Connected! Found {tautulliUsers.length} users</p>
        </div>
      )}
      {tautulliValid === false && (
        <div role="status" className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
          <p className="text-red-400 text-sm">Connection test failed</p>
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
        <div>
          <button
            type="button"
            onClick={handleSyncTautulli}
            disabled={syncingTautulli}
            className="w-full bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {syncingTautulli && <LoadingSpinner size="sm" />}
            {syncingTautulli ? 'Syncing...' : 'Sync Watch History'}
          </button>
          <p className="text-decidarr-text-muted text-xs mt-2">
            Imports watched status from Tautulli for all Plex users
          </p>
        </div>
      )}
    </div>
  );
}
