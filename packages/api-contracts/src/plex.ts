import { z } from 'zod';

export const plexImageQuerySchema = z.object({
  path: z.string().min(1),
  width: z.string().optional(),
});
export type PlexImageQuery = z.infer<typeof plexImageQuerySchema>;

export const plexPollQuerySchema = z.object({ state: z.string().optional() });
export type PlexPollQuery = z.infer<typeof plexPollQuerySchema>;
