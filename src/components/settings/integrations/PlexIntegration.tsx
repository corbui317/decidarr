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

export default function PlexIntegration({
  settings,
  onError,
  onSuccess,
  onClearMessages,
}: PlexIntegrationProps) {
  const [saving, setSaving] = useState(false);
  const [plexToken, setPlexToken] = useState('');
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexValidation, setPlexValidation] = useState<PlexTestResponse | null>(null);
  const [availableServers, setAvailableServers] = useState<Array<{ name: string; uri: string }>>([]);

  useEffect(() => {
    if (settings) {
      setPlexServerUrl(settings.plex.serverUrl || '');
    }
  }, [settings]);

  const handleTestPlex = useCallback(async () => {
    if (!plexToken.trim()) {
      onError('Please enter a Plex token');
      return;
    }

    setSaving(true);
    onClearMessages();
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
        onError('Plex token validation failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test Plex';
      onError(message);
    } finally {
      setSaving(false);
    }
  }, [plexToken, plexServerUrl, onError, onClearMessages]);

  const handleSavePlex = useCallback(async () => {
    if (!plexToken.trim() || !plexServerUrl.trim()) {
      onError('Please provide both Plex token and server URL');
      return;
    }

    setSaving(true);
    onClearMessages();
    try {
      await settingsApi.updateSettings({
        plex: {
          token: plexToken,
          serverUrl: plexServerUrl,
        },
      });
      onSuccess('Plex settings saved successfully');
      setPlexToken('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Plex settings';
      onError(message);
    } finally {
      setSaving(false);
    }
  }, [plexToken, plexServerUrl, onError, onSuccess, onClearMessages]);

  return (
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
  );
}
