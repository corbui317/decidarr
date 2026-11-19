import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import {
  shouldUseExternalMongo,
  writeMongoMarkers,
  teardownE2eMongo,
} from './mongo-lifecycle';

export default async function globalSetup() {
  console.log('[GlobalSetup] Running...');

  if (shouldUseExternalMongo()) {
    console.log('[GlobalSetup] Using external MongoDB');
    return;
  }

  console.log('[GlobalSetup] Starting MongoMemoryServer...');
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(process.cwd(), '.cache', 'mongodb-binaries');
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  console.log('[GlobalSetup] MongoDB URI:', uri);
  process.env.E2E_MONGODB_URI = uri;
  writeMongoMarkers(uri, true);
  console.log('[GlobalSetup] Wrote URI markers');

  return async () => {
    await teardownE2eMongo(mongo);
  };
}
