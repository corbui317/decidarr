import { tautulliTestResponseSchema, type TautulliTestResponse } from '@decidarr/api-contracts';
import { TautulliService } from '@/lib/services/tautulli';
import { createLogger } from '@/lib/logger';
import { connectionTestRoute } from '@/lib/routes/connection-test';

const logger = createLogger('API:TautulliTest');

async function testTautulliConnection(url: string, apiKey: string): Promise<TautulliTestResponse> {
  const service = new TautulliService(url, apiKey);
  const result = await service.testConnection();

  if (result.success) {
    const users = await service.getUsers();
    return {
      success: true,
      users: users.map((u) => ({
        id: u.user_id,
        username: u.username,
        friendlyName: u.friendly_name,
      })),
    };
  }

  return { success: false, error: result.error };
}

export const POST = connectionTestRoute(tautulliTestResponseSchema, testTautulliConnection, 'Tautulli', logger);
