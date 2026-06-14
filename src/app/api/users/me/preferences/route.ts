import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import {
  getSpinHistoryPreferences,
  saveSpinHistoryPreferences,
  normalizeRetentionLimit,
} from '@/lib/spin-history';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:UserPreferences');

export async function GET() {
  try {
    await requireAuth();
    const spinHistory = await getSpinHistoryPreferences();
    return NextResponse.json({ spinHistory });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('Get preferences failed', { error: msg });
    return NextResponse.json({ error: 'Failed to get preferences' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();

    const patch: {
      enabled?: boolean;
      retentionLimit?: number;
      storeFilterSnapshot?: boolean;
    } = {};

    if (body.spinHistory) {
      if (typeof body.spinHistory.enabled === 'boolean') {
        patch.enabled = body.spinHistory.enabled;
      }
      if (body.spinHistory.retentionLimit !== undefined) {
        patch.retentionLimit = normalizeRetentionLimit(body.spinHistory.retentionLimit);
      }
      if (typeof body.spinHistory.storeFilterSnapshot === 'boolean') {
        patch.storeFilterSnapshot = body.spinHistory.storeFilterSnapshot;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid preference fields provided' }, { status: 400 });
    }

    const spinHistory = await saveSpinHistoryPreferences(patch);
    return NextResponse.json({ spinHistory });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('Update preferences failed', { error: msg });
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
