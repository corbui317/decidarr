import { NextResponse } from 'next/server';
import { preferencesPatchBodySchema, preferencesPutBodySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import {
  normalizeSpinHistoryPreferences,
  mergeSpinHistoryPreferences,
  trimHistoryIfRetentionReduced,
} from '@/lib/spin-history';
import { emitSyncChange, toPreferenceContract } from '@/lib/sync/service';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

async function loadUser(userId: unknown) {
  const user = await User.findById(userId);
  if (!user) {
    throw new DomainError('INTERNAL');
  }
  return user;
}

export const GET = route({ access: 'user' }, async ({ session }) => {
  const user = await loadUser(session.userId);
  const spinHistory = normalizeSpinHistoryPreferences(user.preferences?.spinHistory);
  return NextResponse.json({
    preferences: {
      ...user.preferences,
      spinHistory,
    },
    spinHistory,
  });
});

export const PUT = route({ access: 'user', body: preferencesPutBodySchema }, async ({ session, body }) => {
  const user = await loadUser(session.userId);

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

  await emitSyncChange(user._id, 'preference', user._id.toString(), 'upsert', toPreferenceContract(user));

  if (body.spinHistory && previousRetention !== undefined && mergedSpinHistory) {
    await trimHistoryIfRetentionReduced(
      user._id,
      previousRetention,
      mergedSpinHistory.retentionLimit,
      body.spinHistory.retentionLimit !== undefined
    );
  }

  return NextResponse.json({ success: true, preferences: user.preferences });
});

export const PATCH = route({ access: 'user', body: preferencesPatchBodySchema }, async ({ session, body }) => {
  const user = await loadUser(session.userId);
  const { spinHistory: patch } = body;

  const { merged, previousRetention } = mergeSpinHistoryPreferences(user.preferences.spinHistory, patch);
  user.preferences.spinHistory = merged;

  await user.save();

  await emitSyncChange(user._id, 'preference', user._id.toString(), 'upsert', toPreferenceContract(user));

  await trimHistoryIfRetentionReduced(
    user._id,
    previousRetention,
    merged.retentionLimit,
    patch.retentionLimit !== undefined
  );

  return NextResponse.json({ spinHistory: merged });
});
