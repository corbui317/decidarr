// Runs an in-memory MongoDB for the E2E web server on a fixed port.
// Playwright starts it as the first webServer, waits for the port, and stops it
// (SIGTERM to the process group) when the run ends.
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env.E2E_MONGO_PORT);
if (!Number.isInteger(port) || port <= 0) {
  console.error('[e2e-mongo] E2E_MONGO_PORT must be a port number');
  process.exit(1);
}

process.env.MONGOMS_DOWNLOAD_DIR ??= path.join(process.cwd(), '.cache', 'mongodb-binaries');

const mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', port } });
console.log(`[e2e-mongo] listening on ${mongo.getUri()}`);

// Keep the process alive until Playwright stops it.
const keepAlive = setInterval(() => {}, 1 << 30);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(keepAlive);
  try {
    await mongo.stop();
  } catch (err) {
    console.error('[e2e-mongo] stop failed', err);
  }
  process.exit(0);
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
