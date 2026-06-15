import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';

const URI_FILE = path.join(__dirname, '../../.e2e-mongo-uri');

export default async function globalSetup() {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(process.cwd(), '.cache', 'mongodb-binaries');
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  process.env.E2E_MONGODB_URI = uri;
  fs.writeFileSync(URI_FILE, uri, 'utf-8');
  fs.writeFileSync(
    path.join(__dirname, '../../.e2e-mongo-pid'),
    JSON.stringify({ uri }),
    'utf-8'
  );
}
