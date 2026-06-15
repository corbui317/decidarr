import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';

export async function POST() {
  if (process.env.E2E_MOCK_PLEX !== 'true') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
    }

    const cached = (global as typeof global & { mongoose?: { conn: null; promise: null } })
      .mongoose;
    if (cached) {
      cached.conn = null;
      cached.promise = null;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
