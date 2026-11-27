import { z } from 'zod';

export const tautulliUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  friendlyName: z.string(),
});
export type TautulliUser = z.infer<typeof tautulliUserSchema>;

export const tautulliTestResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  users: z.array(tautulliUserSchema).optional(),
});
export type TautulliTestResponse = z.infer<typeof tautulliTestResponseSchema>;

export const tautulliSyncResponseSchema = z.object({
  success: z.boolean(),
  synced: z.number(),
  movies: z.number(),
  shows: z.number(),
  lastSync: z.string(),
  error: z.string().optional(),
});
export type TautulliSyncResponse = z.infer<typeof tautulliSyncResponseSchema>;
