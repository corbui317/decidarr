import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';

let mongoServer: MongoMemoryServer;

const URI_FILE = path.join(__dirname, '.mongo-uri');

export async function setup() {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(process.cwd(), '.cache', 'mongodb-binaries');
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  fs.writeFileSync(URI_FILE, uri, 'utf-8');
}

export async function teardown() {
  if (fs.existsSync(URI_FILE)) {
    fs.unlinkSync(URI_FILE);
  }
  await mongoServer?.stop();
}
