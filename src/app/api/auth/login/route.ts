import { NextResponse } from 'next/server';

/** @deprecated Use POST /api/auth/plex/start instead */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Please use Plex OAuth to log in.',
      useOAuth: true,
    },
    { status: 410 }
  );
}
