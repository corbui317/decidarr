import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import {
  shouldUseExternalMongo,
  writeMongoMarkers,
  teardownE2eMongo,
} from './mongo-lifecycle';

export default async function globalSetup() {
  if (shouldUseExternalMongo()) {
    return;
  }

  process.env.MONGOMS_DOWNLOAD_DIR = path.join(process.cwd(), '.cache', 'mongodb-binaries');
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  process.env.E2E_MONGODB_URI = uri;
  writeMongoMarkers(uri, true);

  return async () => {
    await teardownE2eMongo(mongo);
  };
}
