import { OverseerrService } from '@/lib/services/overseerr';
import { createLogger } from '@/lib/logger';
import { connectionTestRoute } from '@/lib/routes/connection-test';

const logger = createLogger('API:OverseerrTest');

async function testOverseerrConnection(url: string, apiKey: string) {
  const service = new OverseerrService(url, apiKey);
  const result = await service.testConnection();

  if (result.success) {
    return {
      success: true,
      version: result.version,
    };
  }

  return result;
}

export const POST = connectionTestRoute(testOverseerrConnection, 'Overseerr', logger);
