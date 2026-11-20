'use client';

import { useState, useEffect, useCallback } from 'react';
import { settingsApi, overseerrApi, SettingsResponse } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';

interface OverseerrIntegrationProps {
  settings: SettingsResponse | null;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  onClearMessages: () => void;
}

export default function OverseerrIntegration({
  settings,
  onError,
  onSuccess,
  onClearMessages,
}: OverseerrIntegrationProps) {
  const [saving, setSaving] = useState(false);
  const [overseerrUrl, setOverseerrUrl] = useState('');
  const [overseerrApiKey, setOverseerrApiKey] = useState('');
  const [overseerrFilterEnabled, setOverseerrFilterEnabled] = useState(false);
  const [overseerrValid, setOverseerrValid] = useState<boolean | null>(null);
  const [overseerrVersion, setOverseerrVersion] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setOverseerrUrl(settings.overseerr?.url || '');
      setOverseerrFilterEnabled(settings.overseerr?.filterEnabled || false);
    }
  }, [settings]);

  const handleTestOverseerr = useCallback(async () => {
    if (!overseerrUrl.trim() || !overseerrApiKey.trim()) {
      onError('Please provide both Overseerr URL and API key');
      return;
    }

    setSaving(true);
    onClearMessages();
    try {
      const result = await overseerrApi.test(overseerrUrl, overseerrApiKey);
      setOverseerrValid(result.success);
      if (result.version) {
        setOverseerrVersion(result.version);
      }
      if (!result.success) {
        onError('Overseerr connection test failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test Overseerr';
      onError(message);
      setOverseerrValid(false);
    } finally {
      setSaving(false);
    }
  }, [overseerrUrl, overseerrApiKey, onError, onClearMessages]);

  const handleSaveOverseerr = useCallback(async () => {
    if (!overseerrUrl.trim() || !overseerrApiKey.trim()) {
      onError('Please provide both Overseerr URL and API key');
      return;
    }

    setSaving(true);
    onClearMessages();
    try {
      await settingsApi.updateSettings({
        overseerr: {
          url: overseerrUrl,
          apiKey: overseerrApiKey,
          filterEnabled: overseerrFilterEnabled,
        },
      });
      onSuccess('Overseerr settings saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Overseerr settings';
      onError(message);
    } finally {
      setSaving(false);
    }
  }, [overseerrUrl, overseerrApiKey, overseerrFilterEnabled, onError, onSuccess, onClearMessages]);

  return (
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
          }}
          placeholder="Enter Overseerr API key"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="overseerr-filter" className="flex items-center gap-2 cursor-pointer">
          <input
            id="overseerr-filter"
            type="checkbox"
            checked={overseerrFilterEnabled}
            onChange={(e) => setOverseerrFilterEnabled(e.target.checked)}
            className="rounded border-decidarr-border bg-decidarr-surface text-decidarr-primary focus:ring-decidarr-primary focus:ring-offset-decidarr-dark"
          />
          <span className={labelClass} style={{ marginBottom: 0 }}>Exclude fully available titles from the spin pool</span>
        </label>
        <p className="text-decidarr-text-muted text-xs mt-1 ml-6">
          Only spin items that are not yet available in Overseerr
        </p>
      </div>

      {overseerrValid === true && (
        <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
          <p className="text-green-400 text-sm">
            {overseerrVersion ? `Connected to Overseerr ${overseerrVersion}` : 'Connection successful!'}
          </p>
        </div>
      )}
      {overseerrValid === false && (
        <div role="status" className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
          <p className="text-red-400 text-sm">Connection test failed</p>
        </div>
      )}

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
  );
}
