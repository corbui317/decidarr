import mongoose from 'mongoose';
import { runMigrations } from './migrate';
import { createLogger } from './logger';
import { assertTestOnly } from './test-only';

const logger = createLogger('DB');

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/decidarr';

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then(async (conn) => {
      logger.info('Connected to MongoDB');
      try {
        await runMigrations();
      } catch (err) {
        // Log migration errors but don't prevent database connection
        // Recovery mechanisms in migrations should handle most failures
        logger.error('Migration error during connection', { error: String(err) });
      }
      return conn;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * @internal Test-only: forget the cached connection so the next connectDB()
 * takes the boot path again (connect, then run migrations), as after a restart.
 */
export function forgetConnectionForTests(): void {
  assertTestOnly('forgetConnectionForTests');
  cached.conn = null;
  cached.promise = null;
}
