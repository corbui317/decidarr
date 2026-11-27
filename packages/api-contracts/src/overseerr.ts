import { z } from 'zod';

export const overseerrTestResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  version: z.string().optional(),
});
export type OverseerrTestResponse = z.infer<typeof overseerrTestResponseSchema>;

export const overseerrStatusResponseSchema = z.object({
  configured: z.boolean(),
  reachable: z.boolean().nullable(),
  filterEnabled: z.boolean(),
  lastSyncAt: z.string().nullable(),
  lastSyncOk: z.boolean(),
  warning: z.string().nullable(),
});
export type OverseerrStatusResponse = z.infer<typeof overseerrStatusResponseSchema>;
