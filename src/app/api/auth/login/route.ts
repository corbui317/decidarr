import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';

/** @deprecated Use POST /api/auth/plex/start instead */
export const POST = route(
  {
    access: 'public',
    // Well above household use: this route always 410s, but still shares the same bounded,
    // unspoofable policy as every other sign-in route so it cannot become an unlimited bucket.
    rateLimit: { scope: 'auth:login', windowMs: 15 * 60 * 1000, maxAttempts: 5, globalMaxAttempts: 50 },
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
