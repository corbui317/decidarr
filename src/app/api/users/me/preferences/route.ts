import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import {
  normalizeSpinHistoryPreferences,
  mergeSpinHistoryPreferences,
  trimHistoryIfRetentionReduced,
} from '@/lib/spin-history';
import { createLogger } from '@/lib/logger';
import { parsePreferencesPatchBody, parsePreferencesPutBody } from '@/lib/validation/preferences';
import { emitSyncChange, toPreferenceContract } from '@/lib/sync/service';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:UserPreferences');


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
    let mergedSpinHistory;
    if (body.spinHistory) {
      const { merged, previousRetention: prevRetention } = mergeSpinHistoryPreferences(
        user.preferences.spinHistory,
        body.spinHistory
      );
      previousRetention = prevRetention;
      mergedSpinHistory = merged;
      user.preferences.spinHistory = merged;
    }

    await user.save();

    await emitSyncChange(
      user._id,
      'preference',
      user._id.toString(),
      'upsert',
      toPreferenceContract(user)
    );

    if (body.spinHistory && previousRetention !== undefined && mergedSpinHistory) {
      await trimHistoryIfRetentionReduced(
        user._id as mongoose.Types.ObjectId,
        previousRetention,
        mergedSpinHistory.retentionLimit,
        body.spinHistory.retentionLimit !== undefined
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

    const { merged, previousRetention } = mergeSpinHistoryPreferences(
      user.preferences.spinHistory,
      body
    );
    user.preferences.spinHistory = merged;

    await user.save();

    await emitSyncChange(
      user._id,
      'preference',
      user._id.toString(),
      'upsert',
      toPreferenceContract(user)
    );

    await trimHistoryIfRetentionReduced(
      user._id as mongoose.Types.ObjectId,
      previousRetention,
      merged.retentionLimit,
      body.retentionLimit !== undefined
    );

    return NextResponse.json({ spinHistory: merged });
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
