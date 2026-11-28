import { z } from 'zod';
import { appThemeSchema, animationStyleSchema, animationSpeedSchema, mediaTypeWithEpisodeSchema, tvSelectionModeSchema } from './shared';
import { savedFiltersPreferenceSchema } from './filters';

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

export const syncEntityTypeSchema = z.enum(['preference', 'watched', 'spin_history']);
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;

export const syncMetadataSchema = z.object({
  userId: z.string(),
  revision: z.number(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type SyncMetadata = z.infer<typeof syncMetadataSchema>;

/**
 * One change a client made. The payload is the body the matching REST route takes
 * (preference upsert: PreferencesPutBody, watched upsert: WatchedCreateBody,
 * spin_history upsert: SpinHistoryCreateBody); the server checks it per mutation.
 * For a watched item `entityId` is its plexId, for a preference the user's own id, and
 * for a new spin history entry any id the client chose (the server assigns the real one).
 */
export const syncMutationSchema = z.object({
  mutationId: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(200),
  entityType: syncEntityTypeSchema,
  entityId: z.string().min(1).max(200),
  operation: z.enum(['upsert', 'delete']),
  baseRevision: z.number().int().min(0).nullable(),
  clientChangedAt: z.iso.datetime({ offset: true }),
  payload: z.unknown(),
});
export type SyncMutation = z.infer<typeof syncMutationSchema>;

export const syncMutationsBodySchema = z.object({
  mutations: z.array(syncMutationSchema).min(1).max(MAX_MUTATION_BATCH_SIZE),
});
export type SyncMutationsBody = z.infer<typeof syncMutationsBodySchema>;

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
  savedFilters: savedFiltersPreferenceSchema.optional(),
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

const syncChangeFields = {
  cursor: z.string(),
  entityId: z.string(),
  operation: z.enum(['upsert', 'delete']),
  revision: z.number(),
  changedAt: z.string(),
};

/** One change in the feed; `data` is the entity as its contract describes it, or null for a delete. */
export const syncChangeSchema = z.discriminatedUnion('entityType', [
  z.object({ ...syncChangeFields, entityType: z.literal('preference'), data: preferenceContractSchema.nullable() }),
  z.object({ ...syncChangeFields, entityType: z.literal('watched'), data: watchedContractSchema.nullable() }),
  z.object({ ...syncChangeFields, entityType: z.literal('spin_history'), data: spinHistoryContractSchema.nullable() }),
]);
export type SyncChange = z.infer<typeof syncChangeSchema>;

export const syncChangesResponseSchema = z.object({
  schemaVersion: z.number(),
  changes: z.array(syncChangeSchema),
  nextCursor: z.string(),
  hasMore: z.boolean(),
  serverTime: z.string(),
});
export type SyncChangesResponse = z.infer<typeof syncChangesResponseSchema>;

export const mutationResultSchema = z.discriminatedUnion('status', [
  z.object({
    mutationId: z.string(),
    status: z.literal('applied'),
    /** The entity's revision after the write; 0 when nothing was written (spin history turned off). */
    revision: z.number(),
    /** The server-assigned id of a spin history entry the mutation created. */
    entityId: z.string().optional(),
  }),
  z.object({ mutationId: z.string(), status: z.literal('duplicate'), revision: z.number() }),
  z.object({
    mutationId: z.string(),
    status: z.literal('conflict'),
    reason: z.enum(['revision_mismatch', 'deleted']),
    serverRevision: z.number().nullable(),
    serverValue: z.unknown(),
  }),
  /** Refused exactly as the REST route refuses it: the same `code` and `error` as its error body. */
  z.object({ mutationId: z.string(), status: z.literal('rejected'), code: z.string(), error: z.string() }),
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
