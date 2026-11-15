'use client';

import { SettingsResponse } from '@/lib/api';
import { inputClass, inputStyle, labelClass } from '../shared';

interface OverseerrIntegrationProps {
  settings: SettingsResponse | null;
  overseerrUrl: string;
  onOverseerrUrlChange: (value: string) => void;
  overseerrApiKey: string;
  onOverseerrApiKeyChange: (value: string) => void;
  overseerrFilterEnabled: boolean;
  onOverseerrFilterEnabledChange: (enabled: boolean) => void;
  overseerrValid: boolean | null;
  overseerrVersion: string | null;
  saving: boolean;
  onTest: () => void;
  onSave: () => void;
  onClearValidation: () => void;
}

export default function OverseerrIntegration({
  settings,
  overseerrUrl,
  onOverseerrUrlChange,
  overseerrApiKey,
  onOverseerrApiKeyChange,
  overseerrFilterEnabled,
  onOverseerrFilterEnabledChange,
  overseerrValid,
  overseerrVersion,
  saving,
  onTest,
  onSave,
  onClearValidation,
}: OverseerrIntegrationProps) {
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
            onOverseerrUrlChange(e.target.value);
            onClearValidation();
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
            onOverseerrApiKeyChange(e.target.value);
            onClearValidation();
          }}
          placeholder="Enter Overseerr API key"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={overseerrFilterEnabled}
          onChange={(e) => onOverseerrFilterEnabledChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
        />
        <span className="text-decidarr-text text-sm">Exclude fully available titles from the spin pool</span>
      </label>

      {overseerrValid && overseerrVersion && (
        <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
          <p className="text-green-400 text-sm">Connected (v{overseerrVersion})</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={saving || !overseerrUrl.trim() || !overseerrApiKey.trim()}
          className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
        >
          {saving ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !overseerrUrl.trim() || !overseerrApiKey.trim()}
          className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
