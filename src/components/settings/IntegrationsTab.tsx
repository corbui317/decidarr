'use client';

import { useState } from 'react';
import {
  SettingsResponse,
  PlexTestResponse,
  TautulliUser,
} from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { inputClass, inputStyle, labelClass } from './shared';

type IntegrationSubTab = 'plex' | 'tmdb' | 'tautulli' | 'overseerr';

interface IntegrationsTabProps {
  settings: SettingsResponse | null;
  plexToken: string;
  onPlexTokenChange: (value: string) => void;
  plexServerUrl: string;
  onPlexServerUrlChange: (value: string) => void;
  plexValidation: PlexTestResponse | null;
  onPlexValidationClear: () => void;
  availableServers: Array<{ name: string; uri: string }>;
  tmdbApiKey: string;
  onTmdbApiKeyChange: (value: string) => void;
  tmdbValid: boolean | null;
  onTmdbValidClear: () => void;
  tautulliUrl: string;
  onTautulliUrlChange: (value: string) => void;
  tautulliApiKey: string;
  onTautulliApiKeyChange: (value: string) => void;
  tautulliEnabled: boolean;
  onTautulliEnabledChange: (enabled: boolean) => void;
  tautulliUsers: TautulliUser[];
  tautulliValid: boolean | null;
  syncingTautulli: boolean;
  overseerrUrl: string;
  onOverseerrUrlChange: (value: string) => void;
  overseerrApiKey: string;
  onOverseerrApiKeyChange: (value: string) => void;
  overseerrFilterEnabled: boolean;
  onOverseerrFilterEnabledChange: (enabled: boolean) => void;
  overseerrValid: boolean | null;
  overseerrVersion: string | null;
  saving: boolean;
  onTestPlex: () => void;
  onSavePlex: () => void;
  onTestTmdb: () => void;
  onSaveTmdb: () => void;
  onTestTautulli: () => void;
  onSaveTautulli: () => void;
  onSyncTautulli: () => void;
  onTestOverseerr: () => void;
  onSaveOverseerr: () => void;
  onClearMessages: () => void;
}

export default function IntegrationsTab({
  settings,
  plexToken,
  onPlexTokenChange,
  plexServerUrl,
  onPlexServerUrlChange,
  plexValidation,
  onPlexValidationClear,
  availableServers,
  tmdbApiKey,
  onTmdbApiKeyChange,
  tmdbValid,
  onTmdbValidClear,
  tautulliUrl,
  onTautulliUrlChange,
  tautulliApiKey,
  onTautulliApiKeyChange,
  tautulliEnabled,
  onTautulliEnabledChange,
  tautulliUsers,
  tautulliValid,
  syncingTautulli,
  overseerrUrl,
  onOverseerrUrlChange,
  overseerrApiKey,
  onOverseerrApiKeyChange,
  overseerrFilterEnabled,
  onOverseerrFilterEnabledChange,
  overseerrValid,
  overseerrVersion,
  saving,
  onTestPlex,
  onSavePlex,
  onTestTmdb,
  onSaveTmdb,
  onTestTautulli,
  onSaveTautulli,
  onSyncTautulli,
  onTestOverseerr,
  onSaveOverseerr,
  onClearMessages,
}: IntegrationsTabProps) {
  const [subTab, setSubTab] = useState<IntegrationSubTab>('plex');

  const subTabs: { id: IntegrationSubTab; label: string }[] = [
    { id: 'plex', label: 'Plex' },
    { id: 'tmdb', label: 'TMDB' },
    { id: 'tautulli', label: 'Tautulli' },
    { id: 'overseerr', label: 'Overseerr' },
  ];

  return (
    <div id="tab-panel-integrations" role="tabpanel" className="space-y-4">
      <div className="flex gap-1 border-b border-decidarr-border pb-2" role="tablist" aria-label="Integrations">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={subTab === tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-decidarr-primary ${
              subTab === tab.id
                ? 'bg-decidarr-primary/20 text-decidarr-primary'
                : 'text-decidarr-text-muted hover:text-decidarr-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'plex' && (
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
                onClearMessages();
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

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onTestPlex}
              disabled={saving || !plexToken.trim()}
              aria-busy={saving}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <LoadingSpinner size="sm" /> : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={onSavePlex}
              disabled={saving || (!plexToken.trim() && !plexServerUrl.trim())}
              aria-busy={saving}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {saving ? <LoadingSpinner size="sm" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {subTab === 'tmdb' && (
        <div className="space-y-5">
          <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
            <p className="text-decidarr-text text-sm">
              <span className="text-decidarr-text-muted">Status: </span>
              {settings?.tmdb.hasKey ? (
                <span className="text-green-400">Configured</span>
              ) : (
                <span className="text-decidarr-text-muted">Not configured</span>
              )}
            </p>
            {settings?.tmdb.keyMasked && (
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>Key: </span>{settings.tmdb.keyMasked}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="tmdb-key" className={labelClass}>
              {settings?.tmdb.hasKey ? 'Update TMDB API Key' : 'TMDB API Key'}
            </label>
            <input
              id="tmdb-key"
              type="password"
              value={tmdbApiKey}
              onChange={(e) => {
                onTmdbApiKeyChange(e.target.value);
                onTmdbValidClear();
                onClearMessages();
              }}
              placeholder="Enter TMDB API key"
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-decidarr-text-muted text-xs mt-1">
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-decidarr-primary hover:underline"
              >
                Get a free TMDB API key
              </a>
            </p>
          </div>

          {tmdbValid === true && (
            <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
              <p className="text-green-400 text-sm">API key is valid</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onTestTmdb}
              disabled={saving || !tmdbApiKey.trim()}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Test API Key
            </button>
            <button
              type="button"
              onClick={onSaveTmdb}
              disabled={saving}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {saving ? <LoadingSpinner size="sm" /> : tmdbApiKey.trim() ? 'Save' : 'Remove Key'}
            </button>
          </div>
        </div>
      )}

      {subTab === 'tautulli' && (
        <div className="space-y-5">
          <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
            <p className="text-decidarr-text text-sm">
              <span className="text-decidarr-text-muted">Status: </span>
              {settings?.tautulli?.enabled ? (
                settings?.tautulli?.url && settings?.tautulli?.hasKey ? (
                  <span className="text-green-400">Enabled</span>
                ) : (
                  <span className="text-yellow-400">Enabled (incomplete — save URL and API key)</span>
                )
              ) : settings?.tautulli?.hasKey ? (
                <span className="text-yellow-400">Configured (disabled)</span>
              ) : (
                <span className="text-decidarr-text-muted">Not configured</span>
              )}
            </p>
            {settings?.tautulli?.url && (
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>URL: </span>{settings.tautulli.url}
              </p>
            )}
            {settings?.tautulli?.lastSync && (
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>Last sync: </span>{new Date(settings.tautulli.lastSync).toLocaleString()}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="tautulli-url" className={labelClass}>Tautulli URL</label>
            <input
              id="tautulli-url"
              type="url"
              value={tautulliUrl}
              onChange={(e) => {
                onTautulliUrlChange(e.target.value);
                onClearMessages();
              }}
              placeholder="http://192.168.1.100:8181"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="tautulli-key" className={labelClass}>
              {settings?.tautulli?.hasKey ? 'Update API Key' : 'API Key'}
            </label>
            <input
              id="tautulli-key"
              type="password"
              value={tautulliApiKey}
              onChange={(e) => {
                onTautulliApiKeyChange(e.target.value);
                onClearMessages();
              }}
              placeholder="Enter Tautulli API key"
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-decidarr-text-muted text-xs mt-1">
              Find your API key in Tautulli Settings &rarr; Web Interface &rarr; API Key
            </p>
          </div>

          {tautulliValid && tautulliUsers.length > 0 && (
            <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
              <p className="text-green-400 text-sm mb-1">Connected! Users found:</p>
              <div className="flex flex-wrap gap-2">
                {tautulliUsers.map((u) => (
                  <span key={u.id} className="text-xs bg-green-500/20 px-2 py-1 rounded">
                    {u.friendlyName || u.username}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tautulliEnabled}
                onChange={(e) => onTautulliEnabledChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
              />
              <span className="text-decidarr-text text-sm">Enable Tautulli watch history sync</span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onTestTautulli}
              disabled={saving || !tautulliUrl.trim() || !tautulliApiKey.trim()}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Test Connection
            </button>
            <button
              type="button"
              onClick={onSaveTautulli}
              disabled={saving}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {saving ? <LoadingSpinner size="sm" /> : 'Save'}
            </button>
          </div>

          {settings?.tautulli?.enabled && settings?.tautulli?.url && settings?.tautulli?.hasKey && (
            <button
              type="button"
              onClick={onSyncTautulli}
              disabled={syncingTautulli}
              className="w-full bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50"
            >
              {syncingTautulli ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" /> Syncing...
                </span>
              ) : (
                'Sync Watch History Now'
              )}
            </button>
          )}
        </div>
      )}

      {subTab === 'overseerr' && (
        <div className="space-y-5">
          <div className="bg-decidarr-dark/50 rounded-lg p-4 border border-decidarr-border">
            <p className="text-decidarr-text text-sm">
              <span className="text-decidarr-text-muted">Status: </span>
              {settings?.overseerr?.filterEnabled ? (
                <span className="text-green-400">Filter enabled</span>
              ) : settings?.overseerr?.hasKey ? (
                <span className="text-yellow-400">Configured (filter off)</span>
              ) : (
                <span className="text-decidarr-text-muted">Not configured</span>
              )}
            </p>
            {settings?.overseerr?.url && (
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>URL: </span>{settings.overseerr.url}
              </p>
            )}
            {settings?.overseerr?.lastSyncAt && (
              <p className="text-decidarr-text-muted text-sm mt-1">
                <span>Last sync: </span>
                {new Date(settings.overseerr.lastSyncAt).toLocaleString()}
                {!settings.overseerr.lastSyncOk && (
                  <span className="text-yellow-400 ml-2">(stale data)</span>
                )}
              </p>
            )}
          </div>

          <p className="text-decidarr-text-muted text-sm">
            Exclude fully available titles from the spin pool. Partially available titles stay in the
            pool and show a badge on the result card.
          </p>

          <div>
            <label htmlFor="overseerr-url" className={labelClass}>Overseerr URL</label>
            <input
              id="overseerr-url"
              type="url"
              value={overseerrUrl}
              onChange={(e) => {
                onOverseerrUrlChange(e.target.value);
                onClearMessages();
              }}
              placeholder="http://192.168.1.100:5055"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="overseerr-key" className={labelClass}>
              {settings?.overseerr?.hasKey ? 'Update API Key' : 'API Key'}
            </label>
            <input
              id="overseerr-key"
              type="password"
              value={overseerrApiKey}
              onChange={(e) => {
                onOverseerrApiKeyChange(e.target.value);
                onClearMessages();
              }}
              placeholder="Enter Overseerr API key"
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-decidarr-text-muted text-xs mt-1">
              Find your API key in Overseerr Settings &rarr; General
            </p>
          </div>

          {overseerrValid && (
            <div role="status" className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
              <p className="text-green-400 text-sm">
                Connected{overseerrVersion ? ` (v${overseerrVersion})` : ''}
              </p>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overseerrFilterEnabled}
                onChange={(e) => onOverseerrFilterEnabledChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-decidarr-primary focus:ring-decidarr-primary"
              />
              <span className="text-decidarr-text text-sm">
                Exclude fully available titles from the spin pool
              </span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onTestOverseerr}
              disabled={saving || !overseerrUrl.trim() || !overseerrApiKey.trim()}
              className="flex-1 bg-decidarr-surface text-decidarr-text font-medium py-2 px-4 rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Test Connection
            </button>
            <button
              type="button"
              onClick={onSaveOverseerr}
              disabled={saving}
              className="flex-1 bg-decidarr-primary text-black font-medium py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {saving ? <LoadingSpinner size="sm" /> : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
