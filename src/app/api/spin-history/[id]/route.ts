import { spinHistoryDeleteResponseSchema, spinHistoryEntryParamsSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { deleteSpin } from '@/lib/user-data';

export const DELETE = route(
  { access: 'user', params: spinHistoryEntryParamsSchema, response: spinHistoryDeleteResponseSchema },
  async ({ session, params, reply }) => {
    await deleteSpin(session, params.id);
    return reply({ success: true });
  }
);
