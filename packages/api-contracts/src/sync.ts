import { z } from 'zod';
import { appThemeSchema, animationStyleSchema, animationSpeedSchema, mediaTypeWithEpisodeSchema, tvSelectionModeSchema } from './shared';

export const SYNC_SCHEMA_VERSION = 1;
export const MAX_MUTATION_BATCH_SIZE = 50;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_CODE_TTL_SECONDS = 600;
export const SYNC_CHANGE_RETENTION_DAYS = 90;

export const syncChangesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
});
export type SyncChangesQuery = z.infer<typeof syncChangesQuerySchema>;

export const syncMutationsBodySchema = z.object({ mutations: z.array(z.unknown()) });
export type SyncMutationsBody = z.infer<typeof syncMutationsBodySchema>;

export const syncEntityTypeSchema = z.enum(['preference', 'watched', 'spin_history']);
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;

export const syncMetadataSchema = z.object({
  userId: z.string(),
  revision: z.number(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type SyncMetadata = z.infer<typeof syncMetadataSchema>;

/** The payload type varies by entityType; see PreferenceContract, WatchedContract, SpinHistoryContract. */
export interface SyncChange<T = unknown> {
  cursor: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  revision: number;
  changedAt: string;
  data: T | null;
}

/** The payload type varies by entityType; see PreferenceContract, WatchedContract, SpinHistoryContract. */
export interface SyncMutation<T = unknown> {
  mutationId: string;
  deviceId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  baseRevision: number | null;
  clientChangedAt: string;
  payload: T;
}

export const spinHistoryPreferencesContractSchema = z.object({
  enabled: z.boolean(),
  retentionLimit: z.number(),
  storeFilterSnapshot: z.boolean(),
});
export type SpinHistoryPreferencesContract = z.infer<typeof spinHistoryPreferencesContractSchema>;

export const preferenceContractSchema = z.object({
  theme: appThemeSchema.optional(),
  selectedLibraries: z.array(z.string()).optional(),
  defaultMediaType: z.enum(['movie', 'show']).optional(),
  tvSelectionMode: tvSelectionModeSchema.optional(),
  animationStyle: animationStyleSchema.optional(),
  animationSpeed: animationSpeedSchema.optional(),
  savedFilters: z
    .object({
      genres: z.array(z.string()).optional(),
      yearRange: z.object({ start: z.number().optional(), end: z.number().optional() }).optional(),
      collections: z.array(z.string()).optional(),
      unwatchedOnly: z.boolean().optional(),
    })
    .optional(),
  spinHistory: spinHistoryPreferencesContractSchema.optional(),
});
export type PreferenceContract = z.infer<typeof preferenceContractSchema>;

export const watchedContractSchema = z.object({
  id: z.string(),
  plexId: z.string(),
  mediaType: mediaTypeWithEpisodeSchema,
  title: z.string(),
  watchedAt: z.string(),
  markedManually: z.boolean(),
  source: z.enum(['manual', 'tautulli']),
});
export type WatchedContract = z.infer<typeof watchedContractSchema>;

export const spinHistoryContractSchema = z.object({
  id: z.string(),
  plexId: z.string(),
  title: z.string(),
  mediaType: mediaTypeWithEpisodeSchema,
  thumbPath: z.string().optional(),
  year: z.number().optional(),
  libraryIds: z.array(z.string()),
  filtersSnapshot: z.record(z.string(), z.unknown()).optional(),
  tvSelectionMode: tvSelectionModeSchema.optional(),
  poolSizeAtSpin: z.number().optional(),
  spunAt: z.string(),
});
export type SpinHistoryContract = z.infer<typeof spinHistoryContractSchema>;

export const syncBootstrapResponseSchema = z.object({
  schemaVersion: z.number(),
  cursor: z.string(),
  serverTime: z.string(),
  entities: z.object({
    preferences: preferenceContractSchema,
    watched: z.array(watchedContractSchema),
    spinHistory: z.array(spinHistoryContractSchema),
  }),
});
export type SyncBootstrapResponse = z.infer<typeof syncBootstrapResponseSchema>;

export const syncChangeSchema = z.object({
  cursor: z.string(),
  entityType: syncEntityTypeSchema,
  entityId: z.string(),
  operation: z.enum(['upsert', 'delete']),
  revision: z.number(),
  changedAt: z.string(),
  data: z.unknown().nullable(),
});

export const syncChangesResponseSchema = z.object({
  schemaVersion: z.number(),
  changes: z.array(syncChangeSchema),
  nextCursor: z.string(),
  hasMore: z.boolean(),
  serverTime: z.string(),
});
export type SyncChangesResponse = z.infer<typeof syncChangesResponseSchema>;

export const mutationResultSchema = z.discriminatedUnion('status', [
  z.object({ mutationId: z.string(), status: z.literal('applied'), revision: z.number() }),
  z.object({ mutationId: z.string(), status: z.literal('duplicate'), revision: z.number() }),
  z.object({
    mutationId: z.string(),
    status: z.literal('conflict'),
    reason: z.enum(['revision_mismatch', 'deleted', 'validation']),
    serverRevision: z.number().nullable(),
    serverValue: z.unknown(),
  }),
]);
export type MutationResult = z.infer<typeof mutationResultSchema>;

export const syncMutationBatchResponseSchema = z.object({
  results: z.array(mutationResultSchema),
  nextCursor: z.string(),
});
export type SyncMutationBatchResponse = z.infer<typeof syncMutationBatchResponseSchema>;

export const syncClientStateSchema = z.enum([
  'signed_out',
  'authorizing',
  'bootstrapping',
  'ready_online',
  'ready_offline',
  'syncing',
  'conflict',
  'reauth_required',
]);
export type SyncClientState = z.infer<typeof syncClientStateSchema>;
