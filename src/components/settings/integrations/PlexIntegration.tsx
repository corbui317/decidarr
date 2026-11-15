'use client';

import { SettingsResponse, PlexTestResponse } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';

interface PlexIntegrationProps {
  settings: SettingsResponse | null;
  plexToken: string;
  onPlexTokenChange: (value: string) => void;
  plexServerUrl: string;
  onPlexServerUrlChange: (value: string) => void;
  plexValidation: PlexTestResponse | null;
  onPlexValidationClear: () => void;
  availableServers: Array<{ name: string; uri: string }>;
  saving: boolean;
  onTest: () => void;
  onSave: () => void;
}

export default function PlexIntegration({
  settings,
  plexToken,
  onPlexTokenChange,
  plexServerUrl,
  onPlexServerUrlChange,
  plexValidation,
  onPlexValidationClear,
  availableServers,
  saving,
  onTest,
  onSave,
}: PlexIntegrationProps) {
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
            onPlexTokenChange(e.target.value);
            onPlexValidationClear();
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
            onChange={(e) => onPlexServerUrlChange(e.target.value)}
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
            onChange={(e) => onPlexServerUrlChange(e.target.value)}
            placeholder="http://192.168.1.100:32400"
            className={inputClass}
            style={inputStyle}
          />
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={saving || !plexToken.trim()}
          className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
        >
          {saving ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !plexToken.trim() || !plexServerUrl.trim()}
          className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
