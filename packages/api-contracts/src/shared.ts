import { z } from 'zod';

/** A MongoDB ObjectId: 24 hex characters. Checked by shape only, not by a live lookup. */
export const mongoIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export type MongoId = z.infer<typeof mongoIdSchema>;

export const APP_THEMES = ['dark', 'light', 'vegas', 'macao', 'poker'] as const;
export const appThemeSchema = z.enum(APP_THEMES);
export type AppTheme = z.infer<typeof appThemeSchema>;

export const ANIMATION_STYLES = ['slots', 'roulette', 'wheel', 'plinko', 'random'] as const;
export const animationStyleSchema = z.enum(ANIMATION_STYLES);
export type AnimationStyle = z.infer<typeof animationStyleSchema>;

export const ANIMATION_SPEEDS = ['fast', 'normal', 'dramatic'] as const;
export const animationSpeedSchema = z.enum(ANIMATION_SPEEDS);
export type AnimationSpeed = z.infer<typeof animationSpeedSchema>;

export const mediaTypeSchema = z.enum(['movie', 'show']);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const mediaTypeWithEpisodeSchema = z.enum(['movie', 'show', 'episode']);
export type MediaTypeWithEpisode = z.infer<typeof mediaTypeWithEpisodeSchema>;

export const tvSelectionModeSchema = z.enum(['show', 'episode']);
export type TvSelectionMode = z.infer<typeof tvSelectionModeSchema>;

export const selectionErrorCodeSchema = z.enum([
  'NO_LIBRARIES',
  'NO_ACCESSIBLE_LIBRARIES',
  'MACHINE_ID_MISSING',
  'NO_ITEMS_IN_LIBRARIES',
  'NO_ITEMS_MATCH_FILTERS',
  'INVALID_SELECTION_PARAMS',
]);
export type SelectionErrorCode = z.infer<typeof selectionErrorCodeSchema>;

/**
 * The body of every 4xx and 5xx JSON reply. Clients read `error` for the message and
 * switch on `code`; `issues` lists each field a request failed validation on.
 */
export const apiErrorBodySchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  suggestion: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

/** A reply that only confirms what happened in words, such as a sign-out. */
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/** A reply that only confirms the request succeeded. */
export const successResponseSchema = z.object({ success: z.boolean() });
export type SuccessResponse = z.infer<typeof successResponseSchema>;

/** The reply of the test-only control routes the E2E suite calls. */
export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;

export const selectionErrorSchema = z.object({
  error: z.string(),
  code: selectionErrorCodeSchema,
  suggestion: z.string().optional(),
});
export type SelectionError = z.infer<typeof selectionErrorSchema>;
