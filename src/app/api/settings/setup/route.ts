import { settingsSetupBodySchema, settingsSetupResponseSchema } from '@decidarr/api-contracts';
import { route, requireAdminSession } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import { getOrCreateSettings } from '@/lib/models/Settings';

/** Save optional TMDB key after OAuth setup, or update integration keys during admin reconfigure */
export const POST = route(
  { access: 'public', body: settingsSetupBodySchema, response: settingsSetupResponseSchema },
  async ({ request, body, reply }) => {
    const settings = await getOrCreateSettings();
    const { tmdbApiKey } = body;

    if (settings.setupComplete) {
      await requireAdminSession(request);
      if (tmdbApiKey) {
        settings.tmdbApiKey = tmdbApiKey;
        await settings.save();
      }
      return reply({ success: true, message: 'Settings updated' });
    }

    return errorReply(400, { error: 'Complete setup by signing in with Plex.' });
  }
);
