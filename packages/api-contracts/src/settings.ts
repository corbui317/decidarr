import { z } from 'zod';
import { appThemeSchema, mediaTypeSchema, tvSelectionModeSchema, animationStyleSchema, animationSpeedSchema } from './shared';

export const settingsUpdateBodySchema = z.object({
  plex: z
    .object({
      serverUrl: z.string().optional(),
    })
    .optional(),
  tmdb: z
    .object({
      apiKey: z.string().optional(),
    })
    .optional(),
  syncFrequencyHours: z.number().optional(),
  overseerr: z
    .object({
      url: z.string().optional(),
      apiKey: z.string().optional(),
      filterEnabled: z.boolean().optional(),
    })
    .optional(),
  tautulli: z
    .object({
      url: z.string().optional(),
      apiKey: z.string().optional(),
      enabled: z.boolean().optional(),
      syncIntervalMinutes: z.number().optional(),
    })
    .optional(),
  uiPreferences: z
    .object({
      theme: z.string().optional(),
      defaultMediaType: z.string().optional(),
      tvSelectionMode: z.string().optional(),
      animationStyle: z.string().optional(),
      animationSpeed: z.string().optional(),
    })
    .optional(),
});
export type SettingsUpdateBody = z.infer<typeof settingsUpdateBodySchema>;

export const settingsSetupBodySchema = z.object({ tmdbApiKey: z.string().optional() });
export type SettingsSetupBody = z.infer<typeof settingsSetupBodySchema>;

export const settingsTestPlexBodySchema = z.object({
  plexServerUrl: z.string().min(1, 'Plex server URL is required'),
});
export type SettingsTestPlexBody = z.infer<typeof settingsTestPlexBodySchema>;

export const settingsTestTmdbBodySchema = z.object({
  apiKey: z.string().min(1, 'TMDB API key is required'),
});
export type SettingsTestTmdbBody = z.infer<typeof settingsTestTmdbBodySchema>;

export const settingsResponseSchema = z.object({
  setupComplete: z.boolean(),
  /** Stored credentials that cannot be decrypted with the current keys; kept until re-entered. */
  credentialsNeedingReentry: z.array(z.string()),
  plex: z.object({
    serverUrl: z.string().nullable(),
    username: z.string().nullable(),
    machineId: z.string().nullable(),
  }),
  tmdb: z.object({
    hasKey: z.boolean(),
    keyMasked: z.string().nullable(),
  }),
  tautulli: z.object({
    url: z.string().nullable(),
    enabled: z.boolean(),
    hasKey: z.boolean(),
    keyMasked: z.string().nullable(),
    syncIntervalMinutes: z.number(),
    lastSync: z.string().nullable(),
  }),
  overseerr: z.object({
    url: z.string().nullable(),
    filterEnabled: z.boolean(),
    hasKey: z.boolean(),
    keyMasked: z.string().nullable(),
    lastSyncAt: z.string().nullable(),
    lastSyncOk: z.boolean(),
  }),
  syncFrequencyHours: z.number(),
  uiPreferences: z.object({
    theme: appThemeSchema,
    defaultMediaType: mediaTypeSchema,
    tvSelectionMode: tvSelectionModeSchema,
    animationStyle: animationStyleSchema,
    animationSpeed: animationSpeedSchema,
  }),
});
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

export const settingsUpdateResponseSchema = z.object({
  success: z.boolean(),
  settings: settingsResponseSchema,
});
export type SettingsUpdateResponse = z.infer<typeof settingsUpdateResponseSchema>;

export const settingsStatusResponseSchema = z.object({
  setupComplete: z.boolean(),
  hasPlexToken: z.boolean(),
  hasPlexServer: z.boolean(),
  hasTmdbKey: z.boolean(),
  setupSecretRequired: z.boolean(),
});
export type SettingsStatusResponse = z.infer<typeof settingsStatusResponseSchema>;

export const settingsSetupResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type SettingsSetupResponse = z.infer<typeof settingsSetupResponseSchema>;

export const fetchMachineIdResponseSchema = z.object({
  success: z.boolean(),
  machineId: z.string(),
  /** The machine id was already stored, so the Plex server was not asked. */
  cached: z.boolean(),
});
export type FetchMachineIdResponse = z.infer<typeof fetchMachineIdResponseSchema>;

export const plexTestResponseSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  libraryCount: z.number().optional(),
  /** The URL reaches a Plex server other than this install's; saving it moves the install there. */
  differentServer: z.boolean().optional(),
});
export type PlexTestResponse = z.infer<typeof plexTestResponseSchema>;

export const tmdbTestResponseSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  message: z.string().optional(),
  imageBaseUrl: z.string().nullable().optional(),
});
export type TmdbTestResponse = z.infer<typeof tmdbTestResponseSchema>;
