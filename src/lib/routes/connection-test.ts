import { connectionTestBodySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply, type ReplyContract } from '@/lib/request/reply';
import { assertSafeServiceUrl } from '@/lib/security/service-url';
import type { Logger } from '@/lib/logger';

/** Every connection test reply says whether it worked and, when it did not, why. */
type ConnectionTestResult = { success: boolean; error?: string };

/**
 * An admin-only connection test for an already-configured integration (Overseerr,
 * Tautulli). Unlike Plex setup and the Plex connection test, these have no public
 * phase: the integration being tested is only reachable once an Admin exists.
 */
export function connectionTestRoute(
  response: ReplyContract<ConnectionTestResult>,
  testConnection: (url: string, apiKey: string) => Promise<ConnectionTestResult>,
  serviceName: string,
  logger: Logger
) {
  return route({ access: 'admin', body: connectionTestBodySchema, response }, async ({ body, reply }) => {
    const { url, apiKey } = body;

    const urlCheck = await assertSafeServiceUrl(url);
    if (!urlCheck.valid) {
      // Log internal reason but return generic error to client (security spec 01 §2.3 step 7)
      logger.warn(`${serviceName} URL validation failed`, { url, reason: urlCheck.error });
      return errorReply(400, { error: 'Invalid or disallowed service URL' });
    }

    const result = await testConnection(urlCheck.normalized || url, apiKey);

    if (result.success) {
      logger.info(`${serviceName} test successful`);
      return reply(result);
    }

    logger.warn(`${serviceName} test failed`, { error: result.error });
    return reply(result);
  });
}
