'use client';

import { SettingsResponse } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';

interface TmdbIntegrationProps {
  settings: SettingsResponse | null;
  tmdbApiKey: string;
  onTmdbApiKeyChange: (value: string) => void;
  tmdbValid: boolean | null;
  onTmdbValidClear: () => void;
  saving: boolean;
  onTest: () => void;
  onSave: () => void;
}

export default function TmdbIntegration({
  settings,
  tmdbApiKey,
  onTmdbApiKeyChange,
  tmdbValid,
  onTmdbValidClear,
  saving,
  onTest,
  onSave,
}: TmdbIntegrationProps) {
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
            onTmdbApiKeyChange(e.target.value);
            onTmdbValidClear();
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
          onClick={onTest}
          disabled={saving || !tmdbApiKey.trim()}
          className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
        >
          {saving ? 'Testing...' : 'Test API Key'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !tmdbApiKey.trim()}
          className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
