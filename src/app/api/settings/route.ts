import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { invalidateAccessibleLibraryCache } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { assertSafeServiceUrl } from '@/lib/security/service-url';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { settingsResponseBody } from '@/lib/routes/settings-response';
import { setPlexServer } from '@/lib/plex-server-move';
import {
  APP_THEMES,
  ANIMATION_STYLES,
  ANIMATION_SPEEDS,
  settingsResponseSchema,
  settingsUpdateBodySchema,
  settingsUpdateResponseSchema,
} from '@decidarr/api-contracts';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:Settings');

export const GET = route({ access: 'admin', response: settingsResponseSchema }, async ({ reply }) => {
  logger.debug('Fetching settings');
  const settings = await getOrCreateSettings();
  logger.debug('Settings fetched successfully');
  return reply(await settingsResponseBody(settings));
});

export const PUT = route(
  { access: 'admin', body: settingsUpdateBodySchema, response: settingsUpdateResponseSchema },
  async ({ body, session, reply }) => {
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

    return reply({ success: true, settings: await settingsResponseBody(settings) });
  }
);
