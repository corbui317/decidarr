'use client';

import { SettingsResponse, TautulliUser } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';
import LoadingSpinner from '@/components/LoadingSpinner';

interface TautulliIntegrationProps {
  settings: SettingsResponse | null;
  tautulliUrl: string;
  onTautulliUrlChange: (value: string) => void;
  tautulliApiKey: string;
  onTautulliApiKeyChange: (value: string) => void;
  tautulliEnabled: boolean;
  onTautulliEnabledChange: (enabled: boolean) => void;
  tautulliUsers: TautulliUser[];
  tautulliValid: boolean | null;
  saving: boolean;
  syncingTautulli: boolean;
  onTest: () => void;
  onSave: () => void;
  onSync: () => void;
  onClearValidation: () => void;
}

export default function TautulliIntegration({
  settings,
  tautulliUrl,
  onTautulliUrlChange,
  tautulliApiKey,
  onTautulliApiKeyChange,
  tautulliEnabled,
  onTautulliEnabledChange,
  tautulliUsers,
  tautulliValid,
  saving,
  syncingTautulli,
  onTest,
  onSave,
  onSync,
  onClearValidation,
}: TautulliIntegrationProps) {
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
            onTautulliUrlChange(e.target.value);
            onClearValidation();
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
            onTautulliApiKeyChange(e.target.value);
            onClearValidation();
          }}
          placeholder="Enter Tautulli API key"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={tautulliEnabled}
          onChange={(e) => onTautulliEnabledChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
        />
        <span className="text-decidarr-text text-sm">Enable Tautulli Integration</span>
      </label>

      {tautulliValid && tautulliUsers.length > 0 && (
        <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
          <p className="text-green-400 text-sm font-medium mb-2">Connected! Found {tautulliUsers.length} users</p>
          <ul className="text-decidarr-text-muted text-xs space-y-1">
            {tautulliUsers.slice(0, 5).map((user) => (
              <li key={user.id}>{user.friendlyName || user.username}</li>
            ))}
            {tautulliUsers.length > 5 && (
              <li>... and {tautulliUsers.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={saving || !tautulliUrl.trim() || !tautulliApiKey.trim()}
          className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
        >
          {saving ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !tautulliUrl.trim() || !tautulliApiKey.trim()}
          className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {settings?.tautulli?.enabled && (
        <button
          type="button"
          onClick={onSync}
          disabled={syncingTautulli}
          className="w-full bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {syncingTautulli ? (
            <>
              <LoadingSpinner size="sm" />
              Syncing...
            </>
          ) : (
            'Sync Watch History Now'
          )}
        </button>
      )}
    </div>
  );
}
