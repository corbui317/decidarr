import { z } from 'zod';
import { preferenceContractSchema } from './sync';

export const authUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  serverUrl: z.string(),
  thumb: z.string().optional(),
  isAdmin: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authMeResponseSchema = z.object({
  user: authUserSchema,
  preferences: preferenceContractSchema,
  expiresAt: z.number(),
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const plexLoginStartResponseSchema = z.object({
  authUrl: z.string(),
  pinId: z.number(),
  state: z.string(),
});
export type PlexLoginStartResponse = z.infer<typeof plexLoginStartResponseSchema>;

export const plexLoginPollResponseSchema = z.object({
  authorized: z.boolean(),
  success: z.boolean().optional(),
  user: authUserSchema.optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});
export type PlexLoginPollResponse = z.infer<typeof plexLoginPollResponseSchema>;

export const refreshSessionResponseSchema = z.object({ success: z.boolean(), expiresAt: z.number() });
export type RefreshSessionResponse = z.infer<typeof refreshSessionResponseSchema>;
