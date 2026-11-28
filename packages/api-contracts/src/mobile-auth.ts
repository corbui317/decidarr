import { z } from 'zod';

export const mobileAuthStartRequestSchema = z.object({
  deviceId: z.string().min(8, 'deviceId is required'),
  deviceName: z.string().optional(),
});
export type MobileAuthStartRequest = z.infer<typeof mobileAuthStartRequestSchema>;

export const mobileAuthStartResponseSchema = z.object({
  authUrl: z.string(),
  pinId: z.number(),
  deviceCode: z.string(),
  expiresAt: z.string(),
});
export type MobileAuthStartResponse = z.infer<typeof mobileAuthStartResponseSchema>;

export const mobileAuthExchangeRequestSchema = z.object({
  deviceCode: z.string().min(1, 'deviceCode and deviceId are required'),
  deviceId: z.string().min(1, 'deviceCode and deviceId are required'),
});
export type MobileAuthExchangeRequest = z.infer<typeof mobileAuthExchangeRequestSchema>;

export const mobileUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  isAdmin: z.boolean(),
  thumb: z.string().optional(),
});
export type MobileUser = z.infer<typeof mobileUserSchema>;

export const mobileAuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: mobileUserSchema,
});
export type MobileAuthTokens = z.infer<typeof mobileAuthTokensSchema>;

/** The user has not yet approved the sign-in on plex.tv (HTTP 202); exchange again once they have. */
export const mobileAuthPendingSchema = z.object({
  authorized: z.literal(false),
  error: z.string(),
});
export type MobileAuthPending = z.infer<typeof mobileAuthPendingSchema>;

export const mobileAuthExchangeResponseSchema = z.union([mobileAuthTokensSchema, mobileAuthPendingSchema]);
export type MobileAuthExchangeResponse = z.infer<typeof mobileAuthExchangeResponseSchema>;

export const mobileAuthRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken and deviceId are required'),
  deviceId: z.string().min(1, 'refreshToken and deviceId are required'),
});
export type MobileAuthRefreshRequest = z.infer<typeof mobileAuthRefreshRequestSchema>;

export const mobileAuthRefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export type MobileAuthRefreshResponse = z.infer<typeof mobileAuthRefreshResponseSchema>;

export const mobileAuthLogoutRequestSchema = z.object({
  refreshToken: z.string().optional(),
});
export type MobileAuthLogoutRequest = z.infer<typeof mobileAuthLogoutRequestSchema>;
