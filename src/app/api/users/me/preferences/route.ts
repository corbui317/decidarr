import { NextResponse } from 'next/server';
import { preferencesPatchBodySchema, preferencesPutBodySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import { normalizeSpinHistoryPreferences, updatePreferences } from '@/lib/user-data';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route({ access: 'user' }, async ({ session }) => {
  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED');
  }
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
  const { user } = await updatePreferences(session, body);
  return NextResponse.json({ success: true, preferences: user.preferences });
});

export const PATCH = route({ access: 'user', body: preferencesPatchBodySchema }, async ({ session, body }) => {
  const { spinHistory } = await updatePreferences(session, { spinHistory: body.spinHistory });
  return NextResponse.json({ spinHistory });
});
