import { z } from 'zod';

/** Comma-separated library ids; shared by every library-aggregation query route. */
export const libraryIdsQuerySchema = z.object({
  libraryIds: z.string().optional(),
});
export type LibraryIdsQuery = z.infer<typeof libraryIdsQuerySchema>;

export const libraryItemsParamsSchema = z.object({ id: z.string().min(1) });
export type LibraryItemsParams = z.infer<typeof libraryItemsParamsSchema>;

export const libraryItemsQuerySchema = z.object({ forceRefresh: z.string().optional() });
export type LibraryItemsQuery = z.infer<typeof libraryItemsQuerySchema>;

/**
 * A Plex library section. The server's `/library/sections` passes through whatever
 * fields Plex returns; this types the ones both the web and mobile clients read and
 * leaves the rest as unknown passthrough so a real Plex payload still validates.
 */
export const plexLibrarySectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
});
export type PlexLibrarySection = z.infer<typeof plexLibrarySectionSchema>;

export const librarySectionsResponseSchema = z.object({ sections: z.array(plexLibrarySectionSchema) });
export type LibrarySectionsResponse = z.infer<typeof librarySectionsResponseSchema>;

export const libraryItemsResponseSchema = z.object({
  items: z.array(z.unknown()),
  fromCache: z.boolean(),
  lastSyncedAt: z.union([z.string(), z.date()]),
});
export type LibraryItemsResponse = z.infer<typeof libraryItemsResponseSchema>;

export const libraryGenresResponseSchema = z.object({ genres: z.array(z.string()) });
export type LibraryGenresResponse = z.infer<typeof libraryGenresResponseSchema>;

export const libraryYearsResponseSchema = z.object({ min: z.number(), max: z.number() });
export type LibraryYearsResponse = z.infer<typeof libraryYearsResponseSchema>;

export const libraryStudiosResponseSchema = z.object({
  studios: z.object({
    streaming: z.array(z.string()),
    anime: z.array(z.string()),
    traditional: z.array(z.string()),
  }),
});
export type LibraryStudiosResponse = z.infer<typeof libraryStudiosResponseSchema>;

export const libraryFilterOptionsResponseSchema = z.object({
  contentRatings: z.array(z.string()),
  hasRatings: z.boolean(),
  ratingRange: z.object({ min: z.number(), max: z.number() }),
  studios: z.array(z.string()),
});
export type LibraryFilterOptionsResponse = z.infer<typeof libraryFilterOptionsResponseSchema>;

export const plexCollectionSchema = z.object({
  ratingKey: z.string(),
  title: z.string(),
  childCount: z.number(),
  libraryId: z.string(),
});
export type PlexCollection = z.infer<typeof plexCollectionSchema>;

export const libraryCollectionsResponseSchema = z.object({ collections: z.array(plexCollectionSchema) });
export type LibraryCollectionsResponse = z.infer<typeof libraryCollectionsResponseSchema>;
