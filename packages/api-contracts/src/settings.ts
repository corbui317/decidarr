import { z } from 'zod';

export const settingsUpdateBodySchema = z.object({
  plex: z
    .object({
      token: z.string().optional(),
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
  plexToken: z.string().min(1, 'Plex token is required'),
  plexServerUrl: z.string().optional(),
});
export type SettingsTestPlexBody = z.infer<typeof settingsTestPlexBodySchema>;

export const settingsTestTmdbBodySchema = z.object({
  apiKey: z.string().min(1, 'TMDB API key is required'),
});
export type SettingsTestTmdbBody = z.infer<typeof settingsTestTmdbBodySchema>;
