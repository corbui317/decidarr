import mongoose from 'mongoose';

export async function clearDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

