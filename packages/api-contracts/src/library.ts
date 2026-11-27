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
