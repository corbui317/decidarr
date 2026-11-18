import mongoose from 'mongoose';

export async function clearDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

export async function resetMongooseCache(): Promise<void> {
  (global as typeof global & { mongoose?: { conn: null; promise: null } }).mongoose = {
    conn: null,
    promise: null,
  };
}
