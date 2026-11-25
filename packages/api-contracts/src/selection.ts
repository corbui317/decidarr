import { z } from 'zod';
import { mediaTypeSchema, tvSelectionModeSchema } from './shared';
import { filtersSchema } from './filters';

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
