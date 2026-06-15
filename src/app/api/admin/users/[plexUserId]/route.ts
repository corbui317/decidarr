import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireAdmin, isAuthError, authErrorStatus } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AdminUserToggle');

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ plexUserId: string }> }
) {
  try {
    await connectDB();
    await requireAdmin();
    const { plexUserId } = await params;
    const { approved } = await request.json();

    if (typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'approved must be a boolean' }, { status: 400 });
    }

    const settings = await getOrCreateSettings();
    const approvedIds = new Set(settings.approvedPlexUserIds || []);

    if (approved) {
      approvedIds.add(plexUserId);
    } else {
      approvedIds.delete(plexUserId);
    }

    settings.approvedPlexUserIds = Array.from(approvedIds);
    await settings.save();

    const user = await User.findOne({ plexUserId });
    if (user) {
      user.isApproved = approved;
      if (!approved) {
        user.sessionVersion += 1;
      }
      await user.save();
    }

    logger.info('User approval updated', { plexUserId, approved });
    return NextResponse.json({ success: true, plexUserId, approved });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Toggle user failed', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
