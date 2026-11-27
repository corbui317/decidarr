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

export const spinHistoryEntryResponseSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  plexId: z.string(),
  title: z.string(),
  mediaType: mediaTypeWithEpisodeSchema,
  posterUrl: z.string().optional(),
  thumbPath: z.string().optional(),
  year: z.number().optional(),
  libraryIds: z.array(z.string()),
  filtersSnapshot: z.unknown().optional(),
  tvSelectionMode: tvSelectionModeSchema.optional(),
  poolSizeAtSpin: z.number().optional(),
  spunAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SpinHistoryEntryResponse = z.infer<typeof spinHistoryEntryResponseSchema>;

export const spinHistoryListResponseSchema = z.object({
  items: z.array(spinHistoryEntryResponseSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type SpinHistoryListResponse = z.infer<typeof spinHistoryListResponseSchema>;

export const spinHistoryCreateResponseSchema = z.object({
  entry: spinHistoryEntryResponseSchema.optional(),
  skipped: z.boolean().optional(),
  reason: z.string().optional(),
});
export type SpinHistoryCreateResponse = z.infer<typeof spinHistoryCreateResponseSchema>;

export const spinHistoryDeleteResponseSchema = z.object({ success: z.boolean() });
export type SpinHistoryDeleteResponse = z.infer<typeof spinHistoryDeleteResponseSchema>;

export const spinHistoryClearAllResponseSchema = z.object({ deleted: z.number() });
export type SpinHistoryClearAllResponse = z.infer<typeof spinHistoryClearAllResponseSchema>;
