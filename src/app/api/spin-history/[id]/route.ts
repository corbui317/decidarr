import { NextResponse } from 'next/server';
import { spinHistoryEntryParamsSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { deleteSpin } from '@/lib/user-data';

export const DELETE = route({ access: 'user', params: spinHistoryEntryParamsSchema }, async ({ session, params }) => {
  await deleteSpin(session, params.id);
  return NextResponse.json({ success: true });
});
