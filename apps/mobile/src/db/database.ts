import * as SQLite from 'expo-sqlite';
import type {
  PreferenceContract,
  SpinHistoryContract,
  WatchedContract,
} from '@decidarr/api-contracts';
import { CREATE_TABLES_SQL, DB_NAME } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
    await dbInstance.execAsync(CREATE_TABLES_SQL);
  }
  return dbInstance;
}

export async function setSyncState(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)',
    key,
    value
  );
}

export async function getSyncState(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_state WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function clearLocalData(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM preferences;
    DELETE FROM watched_items;
    DELETE FROM spin_history;
    DELETE FROM sync_state;
    DELETE FROM mutation_queue;
    DELETE FROM auth_session_metadata;
  `);
}

export async function saveBootstrapData(data: {
  preferences: PreferenceContract;
  watched: WatchedContract[];
  spinHistory: SpinHistoryContract[];
}): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    'INSERT OR REPLACE INTO preferences (id, data, revision, updated_at) VALUES (?, ?, ?, ?)',
    'default',
    JSON.stringify(data.preferences),
    1,
    now
  );

  await db.execAsync('DELETE FROM watched_items');
  for (const item of data.watched) {
    await db.runAsync(
      'INSERT INTO watched_items (plex_id, data, revision, updated_at) VALUES (?, ?, ?, ?)',
      item.plexId,
      JSON.stringify(item),
      1,
      now
    );
  }

  await db.execAsync('DELETE FROM spin_history');
  for (const item of data.spinHistory) {
    await db.runAsync(
      'INSERT INTO spin_history (id, data, revision, spun_at) VALUES (?, ?, ?, ?)',
      item.id,
      JSON.stringify(item),
      1,
      item.spunAt
    );
  }
}

export async function getCachedPreferences(): Promise<Record<string, unknown> | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ data: string }>(
    'SELECT data FROM preferences WHERE id = ?',
    'default'
  );
  return row ? (JSON.parse(row.data) as Record<string, unknown>) : null;
}

export async function getCachedSpinHistory(): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data: string }>(
    'SELECT data FROM spin_history WHERE deleted_at IS NULL ORDER BY spun_at DESC LIMIT 50'
  );
  return rows.map((r) => JSON.parse(r.data) as Record<string, unknown>);
}
