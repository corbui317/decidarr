import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (process.env.E2E_MOCK_PLEX !== 'true') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resetSecret = process.env.E2E_TEST_RESET_SECRET?.trim();
  if (resetSecret) {
    const provided = request.headers.get('X-E2E-Reset-Secret')?.trim();
    if (!provided || provided !== resetSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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
