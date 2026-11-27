import { z } from 'zod';
import { mediaTypeSchema, tvSelectionModeSchema } from './shared';
import { filtersSchema, type Filters } from './filters';

export const tmdbMatchSchema = z.object({
  voteAverage: z.number().optional(),
  runtime: z.number().optional(),
  tagline: z.string().optional(),
  overview: z.string().optional(),
});
export type TmdbMatch = z.infer<typeof tmdbMatchSchema>;

export const playLinksSchema = z.object({
  web: z.string(),
  app: z.string(),
  ios: z.string(),
  android: z.string(),
  machineId: z.string().nullable(),
});
export type PlayLinks = z.infer<typeof playLinksSchema>;

export const sanitizedLibraryItemSchema = z.object({
  plexId: z.string(),
  title: z.string(),
  type: z.string(),
  year: z.number().optional(),
  rating: z.number().optional(),
  duration: z.number().optional(),
  contentRating: z.string().optional(),
  seasonCount: z.number().optional(),
  art: z.string().optional(),
  posterUrl: z.string().optional(),
  thumbPath: z.string().optional(),
  artPath: z.string().optional(),
  tagline: z.string().optional(),
  genres: z.array(z.string()).optional(),
  summary: z.string().optional(),
  directors: z.array(z.string()).optional(),
  actors: z.array(z.string()).optional(),
  studio: z.string().optional(),
  networks: z.array(z.string()).optional(),
  studios: z.array(z.string()).optional(),
  overseerrStatus: z.enum(['available', 'partially_available']).nullable().optional(),
});
export type SanitizedLibraryItem = z.infer<typeof sanitizedLibraryItemSchema>;

export const selectionResultResponseSchema = z.object({
  selection: sanitizedLibraryItemSchema.extend({ tmdb: tmdbMatchSchema.nullable().optional() }),
  playLinks: playLinksSchema.nullable(),
  stats: z.object({ totalMatches: z.number() }),
  tvSelectionMode: tvSelectionModeSchema.optional(),
});
export type SelectionResultResponse = z.infer<typeof selectionResultResponseSchema>;

export const selectionParametersSchema = z.object({
  libraryIds: z.array(z.string()),
  mediaType: mediaTypeSchema,
  filters: filtersSchema,
  tvSelectionMode: tvSelectionModeSchema.optional(),
});
export type SelectionParameters = z.infer<typeof selectionParametersSchema>;

/**
 * The request-handling module's body contract for `/selection/random` and
 * `/selection/pool-count`. Unlike `selectionParametersSchema` above (the fully
 * resolved shape clients send), this stays lenient: a field a caller leaves out
 * stays undefined rather than being defaulted, matching the legacy hand-written
 * parser's behavior so older or partial requests keep working.
 */
export const selectionRequestFiltersSchema = z
  .object({
    genres: z.array(z.string()).optional(),
    contentRatings: z.array(z.string()).optional(),
    studios: z.array(z.string()).optional(),
    collections: z.array(z.string()).optional(),
    unwatchedOnly: z.boolean().optional(),
    ratingFilter: z.string().nullable().optional(),
    yearRange: z
      .object({ start: z.number().optional(), end: z.number().optional() })
      .nullable()
      .optional(),
    ratingRange: z
      .object({ min: z.number().optional(), max: z.number().optional() })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional()
  .transform((value): Filters => (value ?? {}) as Filters);

export const selectionRequestBodySchema = z.object({
  libraryIds: z.array(z.string().min(1)),
  mediaType: z.enum(['movie', 'show']).default('movie'),
  filters: selectionRequestFiltersSchema,
  tvSelectionMode: z.enum(['show', 'episode']).optional(),
});
export type SelectionRequestBody = z.infer<typeof selectionRequestBodySchema>;

export const awardCategorySchema = z.object({ id: z.string(), name: z.string(), icon: z.string() });
export type AwardCategory = z.infer<typeof awardCategorySchema>;

export const awardCategoriesResponseSchema = z.object({ categories: z.array(awardCategorySchema) });
export type AwardCategoriesResponse = z.infer<typeof awardCategoriesResponseSchema>;
