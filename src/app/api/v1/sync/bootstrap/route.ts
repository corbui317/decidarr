import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import { buildBootstrap, backfillSyncRevisions } from '@/lib/sync/service';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route({ access: 'user' }, async ({ session }) => {
  if (session.credential !== 'bearer') {
    throw new DomainError('UNAUTHENTICATED');
  }

  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED');
  }

  await backfillSyncRevisions(user._id);

  const bootstrap = await buildBootstrap(user);
  return NextResponse.json(bootstrap);
});
