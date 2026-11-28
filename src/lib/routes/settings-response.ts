import type { SettingsResponse } from '@decidarr/api-contracts';
import { findCredentialsNeedingReentry } from '@/lib/migrate';
import type { ISettings } from '@/lib/models/Settings';
import type { Json } from '@/lib/request/reply';

/** The first and last four characters of a secret, enough to recognize it. */
const maskValue = (value: string | undefined): string | null => {
  if (!value) return null;
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
};

/** The settings as the Admin's settings screens see them: integration keys only masked, never whole. */
export async function settingsResponseBody(settings: ISettings): Promise<Json<SettingsResponse>> {
  const tmdbKey = settings.getDecryptedTmdbKey();
  const tautulliKey = settings.getDecryptedTautulliKey();
  const overseerrKey = settings.getDecryptedOverseerrKey();

  return {
    setupComplete: settings.setupComplete,
    credentialsNeedingReentry: await findCredentialsNeedingReentry(),
    plex: {
      serverUrl: settings.plexServerUrl || null,
      username: settings.plexUsername || null,
      machineId: settings.plexMachineId || null,
    },
    tmdb: {
      hasKey: !!tmdbKey,
      keyMasked: maskValue(tmdbKey || undefined),
    },
    tautulli: {
      url: settings.tautulliUrl || null,
      enabled: settings.tautulliEnabled,
      hasKey: !!tautulliKey,
      keyMasked: maskValue(tautulliKey || undefined),
      syncIntervalMinutes: settings.tautulliSyncIntervalMinutes,
      lastSync: settings.tautulliLastSync || null,
    },
    overseerr: {
      url: settings.overseerrUrl || null,
      filterEnabled: settings.overseerrFilterEnabled ?? false,
      hasKey: !!overseerrKey,
      keyMasked: maskValue(overseerrKey || undefined),
      lastSyncAt: settings.overseerrLastSyncAt || null,
      lastSyncOk: settings.overseerrLastSyncOk ?? true,
    },
    syncFrequencyHours: settings.syncFrequencyHours,
    uiPreferences: {
      theme: settings.uiPreferences?.theme ?? 'dark',
      defaultMediaType: settings.uiPreferences?.defaultMediaType ?? 'movie',
      tvSelectionMode: settings.uiPreferences?.tvSelectionMode ?? 'show',
      animationStyle: settings.uiPreferences?.animationStyle ?? 'slots',
      animationSpeed: settings.uiPreferences?.animationSpeed ?? 'normal',
    },
  };
}
