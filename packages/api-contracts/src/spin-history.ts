import { z } from 'zod';
import { mediaTypeWithEpisodeSchema, mongoIdSchema, tvSelectionModeSchema } from './shared';

export const spinHistoryEntryParamsSchema = z.object({ id: mongoIdSchema });
export type SpinHistoryEntryParams = z.infer<typeof spinHistoryEntryParamsSchema>;

export const spinHistoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SpinHistoryListQuery = z.infer<typeof spinHistoryListQuerySchema>;

export const spinHistoryCreateBodySchema = z.object({
  plexId: z.string().min(1),
  title: z.string().min(1),
  mediaType: mediaTypeWithEpisodeSchema,
  thumbPath: z.string().nullish(),
  year: z.number().int().nullish(),
  libraryIds: z.array(z.string()).default([]),
  filtersSnapshot: z.unknown().optional(),
  tvSelectionMode: tvSelectionModeSchema.nullish(),
  poolSizeAtSpin: z.number().int().min(0).nullish(),
});
export type SpinHistoryCreateBody = z.infer<typeof spinHistoryCreateBodySchema>;
