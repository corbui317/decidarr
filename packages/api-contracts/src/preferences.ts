import { z } from 'zod';
import { APP_THEMES, ANIMATION_STYLES, ANIMATION_SPEEDS } from './shared';

export const spinHistoryPreferencesPatchSchema = z.object({
  enabled: z.boolean().optional(),
  retentionLimit: z.number().optional(),
  storeFilterSnapshot: z.boolean().optional(),
});
export type SpinHistoryPreferencesPatch = z.infer<typeof spinHistoryPreferencesPatchSchema>;

export const savedFiltersPreferenceSchema = z.object({
  genres: z.array(z.string()).optional(),
  studios: z.array(z.string()).optional(),
  contentRatings: z.array(z.string()).optional(),
  collections: z.array(z.string()).optional(),
  yearRange: z.object({ start: z.number().optional(), end: z.number().optional() }).optional(),
  ratingRange: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  ratingFilter: z.string().nullable().optional(),
  unwatchedOnly: z.boolean().optional(),
});
export type SavedFiltersPreference = z.infer<typeof savedFiltersPreferenceSchema>;

export const preferencesPatchBodySchema = z
  .object({
    spinHistory: spinHistoryPreferencesPatchSchema,
  })
  .refine((value) => Object.keys(value.spinHistory).length > 0, {
    message: 'No valid preference fields provided',
  });
export type PreferencesPatchBody = z.infer<typeof preferencesPatchBodySchema>;

export const preferencesPutBodySchema = z
  .object({
    theme: z.enum(APP_THEMES).optional(),
    defaultMediaType: z.enum(['movie', 'show']).optional(),
    tvSelectionMode: z.enum(['show', 'episode']).optional(),
    savedFilters: savedFiltersPreferenceSchema.optional(),
    selectedLibraries: z.array(z.string()).optional(),
    animationStyle: z.enum(ANIMATION_STYLES).optional(),
    animationSpeed: z.enum(ANIMATION_SPEEDS).optional(),
    spinHistory: spinHistoryPreferencesPatchSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No valid preference fields provided',
  });
export type PreferencesPutBody = z.infer<typeof preferencesPutBodySchema>;
