import fs from 'fs';
import path from 'path';
import type { MongoMemoryServer } from 'mongodb-memory-server';

export const URI_FILE = path.join(process.cwd(), '.e2e-mongo-uri');
export const PID_FILE = path.join(process.cwd(), '.e2e-mongo-pid');

export interface E2eMongoMarker {
  uri: string;
  managed: boolean;
}

/** Skip in-memory Mongo when a developer points E2E at an existing local instance. */
export function shouldUseExternalMongo(): boolean {
  return !process.env.CI && Boolean(process.env.E2E_MONGODB_URI?.trim());
}

export function writeMongoMarkers(uri: string, managed: boolean): void {
  fs.writeFileSync(URI_FILE, uri, 'utf-8');
  fs.writeFileSync(
    PID_FILE,
    JSON.stringify({ uri, managed } satisfies E2eMongoMarker),
    'utf-8'
  );
}

export function readMongoMarker(): E2eMongoMarker | null {
  if (!fs.existsSync(PID_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(PID_FILE, 'utf-8')) as E2eMongoMarker;
  } catch {
    return null;
  }
}

export function cleanupMongoMarkers(): void {
  for (const file of [URI_FILE, PID_FILE]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

export async function teardownE2eMongo(mongo?: MongoMemoryServer): Promise<void> {
  const marker = readMongoMarker();

  if (marker && !marker.managed) {
    cleanupMongoMarkers();
    return;
  }

  if (mongo) {
    await mongo.stop();
  }

  cleanupMongoMarkers();
}
