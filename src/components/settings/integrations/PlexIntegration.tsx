'use client';

import { useState, useEffect, useCallback } from 'react';
import { settingsApi, SettingsResponse, PlexTestResponse } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';

interface PlexIntegrationProps {
  settings: SettingsResponse | null;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  onClearMessages: () => void;
}

/**
 * The Plex server this install uses. Each user reaches it with their own access token
 * from signing in with Plex, so there is no token to enter here; only the URL can change.
 */
export default function PlexIntegration({
  settings,
  onError,
  onSuccess,
  onClearMessages,
}: PlexIntegrationProps) {
  const [saving, setSaving] = useState(false);
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexValidation, setPlexValidation] = useState<PlexTestResponse | null>(null);

  useEffect(() => {
    if (settings) {
      setPlexServerUrl(settings.plex.serverUrl || '');
    }
  }, [settings]);

  const handleTestPlex = useCallback(async () => {
    setSaving(true);
    onClearMessages();
    try {
      const validation = await settingsApi.testPlex(plexServerUrl.trim());
      setPlexValidation(validation);
      if (!validation.valid) {
        onError(validation.error || 'Plex server test failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test Plex';
      onError(message);
    } finally {
      setSaving(false);
    }
  }, [plexServerUrl, onError, onClearMessages]);

  const handleSavePlex = useCallback(async () => {
    setSaving(true);
    onClearMessages();
    try {
      await settingsApi.updateSettings({ plex: { serverUrl: plexServerUrl.trim() } });
      onSuccess('Plex settings saved successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Plex settings';
      onError(message);
    } finally {
      setSaving(false);
    }
  }, [plexServerUrl, onError, onSuccess, onClearMessages]);

  return (
    <div className="space-y-5">
      {settings && (
        <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
          <p className="text-decidarr-text text-sm">
            <span className="text-decidarr-text-muted">Connected as: </span>
            <strong>{settings.plex.username || 'Unknown'}</strong>
          </p>
          <p className="text-decidarr-text-muted text-sm mt-1">
            <span>Server: </span>{settings.plex.serverUrl || 'Not set'}
          </p>
          <p className="text-decidarr-text-muted text-sm mt-1">
            Everyone reaches this server with their own Plex sign-in.
          </p>
        </div>
      )}

      {plexValidation?.valid && (
        <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
          <p className="text-green-400 text-sm">
            Connected: {plexValidation.libraryCount ?? 0} {plexValidation.libraryCount === 1 ? 'library' : 'libraries'} found
          </p>
        </div>
      )}

      <div>
        <label htmlFor="plex-server-url" className={labelClass}>Server URL</label>
        <input
          id="plex-server-url"
          type="url"
          value={plexServerUrl}
          onChange={(e) => {
            setPlexServerUrl(e.target.value);
            setPlexValidation(null);
          }}
          placeholder="http://192.168.1.100:32400"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleTestPlex}
          disabled={saving || !plexServerUrl.trim()}
          className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
        >
          {saving ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          type="button"
          onClick={handleSavePlex}
          disabled={saving || !plexServerUrl.trim()}
          className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
