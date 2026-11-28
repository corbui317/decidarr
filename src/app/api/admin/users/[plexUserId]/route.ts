import {
  adminUserApprovalBodySchema,
  adminUserApprovalParamsSchema,
  adminUserApprovalResponseSchema,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { revokeAllRefreshTokensForUser } from '@/lib/mobile-auth/tokens';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AdminUserToggle');

export const PUT = route(
  {
    access: 'admin',
    body: adminUserApprovalBodySchema,
    params: adminUserApprovalParamsSchema,
    response: adminUserApprovalResponseSchema,
  },
  async ({ body, params, reply }) => {
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
      }
      // Save before revoking: an in-flight mobile rotation that already read this user
      // as approved could otherwise mint a fresh refresh token after the revoke call
      // scans the collection, leaving a token that quietly works again if the Friend is
      // later re-approved. Saving the now-unapproved user first means that rotation's
      // own approval check (not just the revocation) rejects it instead.
      await user.save();
      if (!approved) {
        await revokeAllRefreshTokensForUser(user._id);
      }
    }

    logger.info('User approval updated', { plexUserId, approved });
    return reply({ success: true, plexUserId, approved });
  }
);
