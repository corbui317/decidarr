import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';

/** @deprecated Use POST /api/auth/plex/start instead */
export const POST = route(
  {
    access: 'public',
    rateLimit: { scope: 'auth:login', windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  },
  async () => {
    return NextResponse.json(
      {
        error: 'Please use Plex OAuth to log in.',
        useOAuth: true,
      },
      { status: 410 }
    );
  }
);
