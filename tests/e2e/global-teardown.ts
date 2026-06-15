import fs from 'fs';
import path from 'path';

const URI_FILE = path.join(__dirname, '../../.e2e-mongo-uri');
const PID_FILE = path.join(__dirname, '../../.e2e-mongo-pid');

export default async function globalTeardown() {
  for (const file of [URI_FILE, PID_FILE]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}
