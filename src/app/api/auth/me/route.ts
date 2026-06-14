import { NextResponse } from 'next/server';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';

export async function GET() {
  try {
    await connectDB();
    const { user, settings, isAdmin } = await requireUser();

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        username: user.plexUsername,
        serverUrl: settings.plexServerUrl,
        thumb: user.plexThumb,
        isAdmin,
      },
      preferences: user.preferences,
    });
  } catch (error) {
    const status = authErrorStatus(error);
    return NextResponse.json(
      { error: (error as Error).message === 'App not configured' ? 'App not configured' : 'Unauthorized' },
      { status }
    );
  }
}
