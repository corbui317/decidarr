import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { TautulliService } from '@/lib/services/tautulli';
import { createLogger } from '@/lib/logger';
import { assertSafeServiceUrl, allowPrivateServiceUrls } from '@/lib/security/service-url';
import { handleConnectionTest } from '@/lib/api/connection-test';

const logger = createLogger('API:TautulliTest');

class TautulliTestService {
  constructor(private url: string, private apiKey: string) {}

  async testConnection() {
    const service = new TautulliService(this.url, this.apiKey);
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
}

export async function POST(request: NextRequest) {
  return handleConnectionTest(request, TautulliTestService, 'Tautulli', logger);
}
