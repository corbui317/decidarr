import { cleanupMongoMarkers, readMongoMarker } from './mongo-lifecycle';

export default async function globalTeardown() {
  const marker = readMongoMarker();

  if (marker?.managed) {
    cleanupMongoMarkers();
    return;
  }

  cleanupMongoMarkers();
}
