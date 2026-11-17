import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import {
  getDefaultSpinHistoryPreferences,
  normalizeRetentionLimit,
  trimSpinHistoryToRetention,
} from '@/lib/spin-history';
import { createLogger } from '@/lib/logger';
import { parsePreferencesPatchBody, parsePreferencesPutBody } from '@/lib/validation/preferences';

const logger = createLogger('API:UserPreferences');

function normalizeSpinHistoryPreferences(spinHistory: unknown) {
  const defaults = getDefaultSpinHistoryPreferences();
  const prefs = spinHistory as Partial<typeof defaults> | undefined;
  return {
    enabled: prefs?.enabled ?? defaults.enabled,
    retentionLimit: normalizeRetentionLimit(prefs?.retentionLimit ?? defaults.retentionLimit),
    storeFilterSnapshot: prefs?.storeFilterSnapshot ?? defaults.storeFilterSnapshot,
  };
}

export async function GET() {
  try {
    await connectDB();
    const { user } = await requireUser();
    const spinHistory = normalizeSpinHistoryPreferences(user.preferences?.spinHistory);
    return NextResponse.json({
      preferences: {
        ...user.preferences,
        spinHistory,
      },
      spinHistory,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Get preferences failed', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to get preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireUser();
    const parsed = parsePreferencesPutBody(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const body = parsed.data;

    if (body.theme !== undefined) {
      user.preferences.theme = body.theme;
    }
    if (body.defaultMediaType !== undefined) {
      user.preferences.defaultMediaType = body.defaultMediaType;
    }
    if (body.tvSelectionMode !== undefined) {
      user.preferences.tvSelectionMode = body.tvSelectionMode;
    }
    if (body.savedFilters !== undefined) {
      if (!user.preferences.savedFilters) {
        user.preferences.savedFilters = {};
      }
      if (body.savedFilters.genres !== undefined) {
        user.preferences.savedFilters.genres = body.savedFilters.genres;
      }
      if (body.savedFilters.studios !== undefined) {
        user.preferences.savedFilters.studios = body.savedFilters.studios;
      }
      if (body.savedFilters.contentRatings !== undefined) {
        user.preferences.savedFilters.contentRatings = body.savedFilters.contentRatings;
      }
      if (body.savedFilters.collections !== undefined) {
        user.preferences.savedFilters.collections = body.savedFilters.collections;
      }
      if (body.savedFilters.yearRange !== undefined) {
        user.preferences.savedFilters.yearRange = body.savedFilters.yearRange;
      }
      if (body.savedFilters.ratingRange !== undefined) {
        user.preferences.savedFilters.ratingRange = body.savedFilters.ratingRange;
      }
      if (body.savedFilters.ratingFilter !== undefined) {
        user.preferences.savedFilters.ratingFilter = body.savedFilters.ratingFilter;
      }
      if (body.savedFilters.unwatchedOnly !== undefined) {
        user.preferences.savedFilters.unwatchedOnly = body.savedFilters.unwatchedOnly;
      }
    }
    if (body.selectedLibraries !== undefined) {
      user.preferences.selectedLibraries = body.selectedLibraries;
    }
    if (body.animationStyle !== undefined) {
      user.preferences.animationStyle = body.animationStyle;
    }
    if (body.animationSpeed !== undefined) {
      user.preferences.animationSpeed = body.animationSpeed;
    }
    let previousRetention: number | undefined;
    if (body.spinHistory) {
      const current = normalizeSpinHistoryPreferences(user.preferences.spinHistory);
      previousRetention = current.retentionLimit;
      user.preferences.spinHistory = {
        enabled: body.spinHistory.enabled ?? current.enabled,
        retentionLimit:
          body.spinHistory.retentionLimit !== undefined
            ? normalizeRetentionLimit(body.spinHistory.retentionLimit)
            : current.retentionLimit,
        storeFilterSnapshot:
          body.spinHistory.storeFilterSnapshot ?? current.storeFilterSnapshot,
      };
    }

    await user.save();

    const nextSpinHistory = user.preferences.spinHistory;
    if (
      body.spinHistory?.retentionLimit !== undefined &&
      previousRetention !== undefined &&
      nextSpinHistory &&
      nextSpinHistory.retentionLimit < previousRetention
    ) {
      await trimSpinHistoryToRetention(
        user._id as mongoose.Types.ObjectId,
        nextSpinHistory.retentionLimit
      );
    }
    logger.debug('Preferences updated', { userId: user._id.toString() });
    return NextResponse.json({ success: true, preferences: user.preferences });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Update preferences failed', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireUser();
    const parsed = parsePreferencesPatchBody(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { spinHistory: body } = parsed.data;

    const current = normalizeSpinHistoryPreferences(user.preferences.spinHistory);
    const previousRetention = current.retentionLimit;
    user.preferences.spinHistory = {
      enabled: body.enabled ?? current.enabled,
      retentionLimit:
        body.retentionLimit !== undefined
          ? normalizeRetentionLimit(body.retentionLimit)
          : current.retentionLimit,
      storeFilterSnapshot: body.storeFilterSnapshot ?? current.storeFilterSnapshot,
    };

    await user.save();

    const nextSpinHistory = user.preferences.spinHistory;
    if (
      body.retentionLimit !== undefined &&
      nextSpinHistory &&
      nextSpinHistory.retentionLimit < previousRetention
    ) {
      await trimSpinHistoryToRetention(
        user._id as mongoose.Types.ObjectId,
        nextSpinHistory.retentionLimit
      );
    }

    return NextResponse.json({ spinHistory: nextSpinHistory });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Update preferences failed', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
