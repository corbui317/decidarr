import { NextResponse } from 'next/server';
import {
  adminUserApprovalBodySchema,
  adminUserApprovalParamsSchema,
  type AdminUserApprovalResponse,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { revokeAllRefreshTokensForUser } from '@/lib/mobile-auth/tokens';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AdminUserToggle');

export const PUT = route(
  { access: 'admin', body: adminUserApprovalBodySchema, params: adminUserApprovalParamsSchema },
  async ({ body, params }) => {
    const { plexUserId } = params;
    const { approved } = body;

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
        await revokeAllRefreshTokensForUser(user._id);
      }
      await user.save();
    }

    logger.info('User approval updated', { plexUserId, approved });
    const response: AdminUserApprovalResponse = { success: true, plexUserId, approved };
    return NextResponse.json(response);
  }
);
