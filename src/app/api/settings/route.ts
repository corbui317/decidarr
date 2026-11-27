import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { invalidateAccessibleLibraryCache } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { findCredentialsNeedingReentry } from '@/lib/migrate';
import { assertSafeServiceUrl } from '@/lib/security/service-url';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { setPlexServer } from '@/lib/plex-server-move';
import {
  APP_THEMES,
  ANIMATION_STYLES,
  ANIMATION_SPEEDS,
  settingsUpdateBodySchema,
} from '@decidarr/api-contracts';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:Settings');

// Helper to mask sensitive values
const maskValue = (value: string | undefined): string | null => {
  if (!value) return null;
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
};

async function settingsResponseBody(settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
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

export const GET = route({ access: 'admin' }, async () => {
  logger.debug('Fetching settings');
  const settings = await getOrCreateSettings();
  logger.debug('Settings fetched successfully');
  return NextResponse.json(await settingsResponseBody(settings));
});

export const PUT = route({ access: 'admin', body: settingsUpdateBodySchema }, async ({ body, session }) => {
  const settings = await getOrCreateSettings();
  // Moving servers writes users' tokens, so it runs after every other check in this request.
  let nextPlexServerUrl: string | null = null;

  if (body.plex) {
    if (body.plex.serverUrl !== undefined && body.plex.serverUrl) {
      const urlCheck = await assertSafeServiceUrl(body.plex.serverUrl);
      if (!urlCheck.valid) {
        throw new DomainError('VALIDATION_FAILED', urlCheck.error || 'Invalid or disallowed service URL');
      }
      const nextServerUrl = urlCheck.normalized || body.plex.serverUrl;
      if (nextServerUrl !== settings.plexServerUrl) nextPlexServerUrl = nextServerUrl;
    }
  }

  if (body.tmdb) {
    if (body.tmdb.apiKey !== undefined) {
      if (body.tmdb.apiKey && !body.tmdb.apiKey.includes('****')) {
        settings.tmdbApiKey = body.tmdb.apiKey;
      } else if (body.tmdb.apiKey === '') {
        settings.tmdbApiKey = undefined;
      }
    }
  }

  if (body.syncFrequencyHours !== undefined) {
    settings.syncFrequencyHours = Math.max(1, Math.min(168, body.syncFrequencyHours));
  }

  if (body.overseerr) {
    if (body.overseerr.url !== undefined) {
      if (body.overseerr.url) {
        const urlCheck = await assertSafeServiceUrl(body.overseerr.url);
        if (!urlCheck.valid) {
          throw new DomainError('VALIDATION_FAILED', urlCheck.error || 'Invalid or disallowed service URL');
        }
        settings.overseerrUrl = urlCheck.normalized;
      } else {
        settings.overseerrUrl = undefined;
      }
    }
    if (body.overseerr.apiKey !== undefined) {
      if (body.overseerr.apiKey && !body.overseerr.apiKey.includes('****')) {
        settings.overseerrApiKey = body.overseerr.apiKey;
      } else if (body.overseerr.apiKey === '') {
        settings.overseerrApiKey = undefined;
      }
    }
    if (body.overseerr.filterEnabled !== undefined) {
      settings.overseerrFilterEnabled = !!body.overseerr.filterEnabled;
    }
  }

  if (body.tautulli) {
    if (body.tautulli.url !== undefined) {
      if (body.tautulli.url) {
        const urlCheck = await assertSafeServiceUrl(body.tautulli.url);
        if (!urlCheck.valid) {
          throw new DomainError('VALIDATION_FAILED', urlCheck.error || 'Invalid or disallowed service URL');
        }
        settings.tautulliUrl = urlCheck.normalized;
      } else {
        settings.tautulliUrl = undefined;
      }
    }
    if (body.tautulli.apiKey !== undefined) {
      if (body.tautulli.apiKey && !body.tautulli.apiKey.includes('****')) {
        settings.tautulliApiKey = body.tautulli.apiKey;
      } else if (body.tautulli.apiKey === '') {
        settings.tautulliApiKey = undefined;
      }
    }
    if (body.tautulli.enabled !== undefined) {
      settings.tautulliEnabled = !!body.tautulli.enabled;
    }
    if (body.tautulli.syncIntervalMinutes !== undefined) {
      settings.tautulliSyncIntervalMinutes = Math.max(5, Math.min(1440, body.tautulli.syncIntervalMinutes));
    }

    if (settings.tautulliEnabled) {
      const tautulliKey = settings.getDecryptedTautulliKey();
      if (!settings.tautulliUrl) {
        throw new DomainError('VALIDATION_FAILED', 'Tautulli URL is required when sync is enabled');
      }
      if (!tautulliKey) {
        throw new DomainError('VALIDATION_FAILED', 'Tautulli API key is required when sync is enabled');
      }
    }
  }

  if (body.uiPreferences) {
    if (body.uiPreferences.theme && APP_THEMES.includes(body.uiPreferences.theme as (typeof APP_THEMES)[number])) {
      settings.uiPreferences.theme = body.uiPreferences.theme as (typeof APP_THEMES)[number];
    }
    if (body.uiPreferences.defaultMediaType) {
      settings.uiPreferences.defaultMediaType = body.uiPreferences.defaultMediaType as typeof settings.uiPreferences.defaultMediaType;
    }
    if (body.uiPreferences.tvSelectionMode) {
      settings.uiPreferences.tvSelectionMode = body.uiPreferences.tvSelectionMode as typeof settings.uiPreferences.tvSelectionMode;
    }
    if (
      body.uiPreferences.animationStyle &&
      ANIMATION_STYLES.includes(body.uiPreferences.animationStyle as (typeof ANIMATION_STYLES)[number])
    ) {
      settings.uiPreferences.animationStyle = body.uiPreferences.animationStyle as (typeof ANIMATION_STYLES)[number];
    }
    if (
      body.uiPreferences.animationSpeed &&
      ANIMATION_SPEEDS.includes(body.uiPreferences.animationSpeed as (typeof ANIMATION_SPEEDS)[number])
    ) {
      settings.uiPreferences.animationSpeed = body.uiPreferences.animationSpeed as (typeof ANIMATION_SPEEDS)[number];
    }
  }

  if (nextPlexServerUrl) {
    await setPlexServer(settings, nextPlexServerUrl, session.userId);
  }
  await settings.save();

  if (nextPlexServerUrl) {
    invalidateAccessibleLibraryCache();
  }

  return NextResponse.json({ success: true, settings: await settingsResponseBody(settings) });
});
