import { startFakePlex } from './fake-plex';

export default async function globalSetup() {
  return startFakePlex();
}
