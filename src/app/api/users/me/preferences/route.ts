import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { AppTheme, AnimationStyle, AnimationSpeed } from '@/lib/models/User';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:UserPreferences');

const validThemes: AppTheme[] = ['dark', 'light', 'vegas', 'macao', 'poker'];
const validAnimationStyles: AnimationStyle[] = ['slots', 'roulette', 'wheel', 'plinko', 'random'];
const validAnimationSpeeds: AnimationSpeed[] = ['fast', 'normal', 'dramatic'];

export async function GET() {
  try {
    await connectDB();
    const { user } = await requireUser();
    return NextResponse.json({ preferences: user.preferences });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    return NextResponse.json({ error: 'Failed to get preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireUser();
    const body = await request.json();

    if (body.theme && validThemes.includes(body.theme)) {
      user.preferences.theme = body.theme;
    }
    if (body.defaultMediaType) {
      user.preferences.defaultMediaType = body.defaultMediaType;
    }
    if (body.tvSelectionMode) {
      user.preferences.tvSelectionMode = body.tvSelectionMode;
    }
    if (body.savedFilters) {
      user.preferences.savedFilters = {
        ...user.preferences.savedFilters,
        ...body.savedFilters,
      };
    }
    if (body.selectedLibraries) {
      user.preferences.selectedLibraries = body.selectedLibraries;
    }
    if (body.animationStyle && validAnimationStyles.includes(body.animationStyle)) {
      user.preferences.animationStyle = body.animationStyle;
    }
    if (body.animationSpeed && validAnimationSpeeds.includes(body.animationSpeed)) {
      user.preferences.animationSpeed = body.animationSpeed;
    }

    await user.save();
    logger.debug('Preferences updated', { userId: user._id.toString() });
    return NextResponse.json({ success: true, preferences: user.preferences });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
