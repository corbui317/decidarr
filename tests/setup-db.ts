import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { beforeAll } from 'vitest';

const URI_FILE = path.join(__dirname, '.mongo-uri');

if (fs.existsSync(URI_FILE)) {
  process.env.MONGODB_URI = fs.readFileSync(URI_FILE, 'utf-8').trim();
}

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Ensure tests/global-setup.ts ran.');
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    (global as typeof global & { mongoose?: { conn: typeof mongoose; promise: null } }).mongoose =
      {
        conn: mongoose,
        promise: null,
      };
  }
});
