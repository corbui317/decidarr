import { NextRequest } from 'next/server';
import { TautulliService } from '@/lib/services/tautulli';
import { createLogger } from '@/lib/logger';
import { handleConnectionTest } from '@/lib/routes/connection-test';

const logger = createLogger('API:TautulliTest');

async function testTautulliConnection(url: string, apiKey: string) {
  const service = new TautulliService(url, apiKey);
  const result = await service.testConnection();

  if (result.success) {
    const users = await service.getUsers();
    return {
      success: true,
      users: users.map(u => ({
        id: u.user_id,
        username: u.username,
        friendlyName: u.friendly_name,
      })),
    };
  }

  return result;
}

export async function POST(request: NextRequest) {
  return handleConnectionTest(request, testTautulliConnection, 'Tautulli', logger);
}
