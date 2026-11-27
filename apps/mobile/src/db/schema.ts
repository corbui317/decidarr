export const DB_NAME = 'decidarr.db';

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watched_items (
  plex_id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS spin_history (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  spun_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mutation_queue (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  base_revision INTEGER,
  client_changed_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_session_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;
