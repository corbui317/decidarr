import { z } from 'zod';
import { mediaTypeWithEpisodeSchema } from './shared';
import { watchedContractSchema } from './sync';

export const watchedListQuerySchema = z.object({
  mediaType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type WatchedListQuery = z.infer<typeof watchedListQuerySchema>;

export const watchedPlexIdParamsSchema = z.object({ plexId: z.string().min(1) });
export type WatchedPlexIdParams = z.infer<typeof watchedPlexIdParamsSchema>;

export const watchedCreateBodySchema = z.object({
  mediaType: mediaTypeWithEpisodeSchema,
  title: z.string().trim().min(1),
});
export type WatchedCreateBody = z.infer<typeof watchedCreateBodySchema>;

export const watchedListResponseSchema = z.object({
  items: z.array(watchedContractSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
});
export type WatchedListResponse = z.infer<typeof watchedListResponseSchema>;

export const watchedCreateResponseSchema = z.object({ item: watchedContractSchema });
export type WatchedCreateResponse = z.infer<typeof watchedCreateResponseSchema>;

export const watchedStatusResponseSchema = z.object({ watched: z.boolean() });
export type WatchedStatusResponse = z.infer<typeof watchedStatusResponseSchema>;
