import type { SyncMutation } from '@decidarr/api-contracts';
import { getDatabase } from '@/db/database';

export type QueueStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export async function getPendingMutations(): Promise<SyncMutation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    mutation_id: string;
    device_id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    base_revision: number | null;
    client_changed_at: string;
    payload: string;
  }>(
    `SELECT * FROM mutation_queue WHERE status IN ('pending', 'failed') ORDER BY created_at ASC`
  );

  return rows.map((row) => ({
    mutationId: row.mutation_id,
    deviceId: row.device_id,
    entityType: row.entity_type as SyncMutation['entityType'],
    entityId: row.entity_id,
    operation: row.operation as SyncMutation['operation'],
    baseRevision: row.base_revision,
    clientChangedAt: row.client_changed_at,
    payload: JSON.parse(row.payload),
  }));
}

export async function updateMutationStatus(
  mutationId: string,
  status: QueueStatus
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE mutation_queue SET status = ? WHERE mutation_id = ?', status, mutationId);
}

export async function removeMutation(mutationId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM mutation_queue WHERE mutation_id = ?', mutationId);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM mutation_queue WHERE status IN ('pending', 'failed', 'conflict')`
  );
  return row?.count ?? 0;
}
