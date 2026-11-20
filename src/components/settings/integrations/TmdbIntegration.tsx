'use client';

import { useState, useCallback } from 'react';
import { settingsApi, SettingsResponse } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';

interface TmdbIntegrationProps {
  settings: SettingsResponse | null;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  onClearMessages: () => void;
}

export default function TmdbIntegration({
  settings,
  onError,
  onSuccess,
  onClearMessages,
}: TmdbIntegrationProps) {
  const [saving, setSaving] = useState(false);
  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbValid, setTmdbValid] = useState<boolean | null>(null);

  const handleTestTmdb = useCallback(async () => {
    if (!tmdbApiKey.trim()) {
      onError('Please enter a TMDB API key');
      return;
    }

    setSaving(true);
    onClearMessages();
    try {
      const result = await settingsApi.testTmdb(tmdbApiKey);
      setTmdbValid(result.valid);
      if (!result.valid) {
        onError('TMDB API key validation failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test TMDB';
      onError(message);
      setTmdbValid(false);
    } finally {
      setSaving(false);
    }
  }, [tmdbApiKey, onError, onClearMessages]);

  const handleSaveTmdb = useCallback(async () => {
    if (!tmdbApiKey.trim()) {
      onError('Please provide a TMDB API key');
      return;
    }

    setSaving(true);
    onClearMessages();
    try {
      await settingsApi.updateSettings({
        tmdb: {
          apiKey: tmdbApiKey,
        },
      });
      onSuccess('TMDB settings saved successfully');
      setTmdbApiKey('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save TMDB settings';
      onError(message);
    } finally {
      setSaving(false);
    }
  }, [tmdbApiKey, onError, onSuccess, onClearMessages]);

  return (
    <div className="space-y-5">
      {settings?.tmdb.hasKey && (
        <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
          <p className="text-decidarr-text text-sm">
            <span className="text-decidarr-text-muted">API Key: </span>
            <strong>{settings.tmdb.keyMasked}</strong>
          </p>
        </div>
      )}

      <div>
        <label htmlFor="tmdb-api-key" className={labelClass}>
          {settings?.tmdb.hasKey ? 'Update TMDB API Key' : 'TMDB API Key'}
        </label>
        <input
          id="tmdb-api-key"
          type="password"
          value={tmdbApiKey}
          onChange={(e) => {
            setTmdbApiKey(e.target.value);
            setTmdbValid(null);
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
  );
}
