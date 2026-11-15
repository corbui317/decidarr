import { NextRequest } from 'next/server';
import { OverseerrService } from '@/lib/services/overseerr';
import { createLogger } from '@/lib/logger';
import { handleConnectionTest } from '@/lib/api/connection-test';

const logger = createLogger('API:OverseerrTest');

class OverseerrTestService {
  constructor(private url: string, private apiKey: string) {}

  async testConnection() {
    const service = new OverseerrService(this.url, this.apiKey);
    const result = await service.testConnection();

    if (result.success) {
      return {
        success: true,
        version: result.version,
      };
    }

    return result;
  }
}

export async function POST(request: NextRequest) {
  return handleConnectionTest(request, OverseerrTestService, 'Overseerr', logger);
}
