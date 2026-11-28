import { overseerrTestResponseSchema, type OverseerrTestResponse } from '@decidarr/api-contracts';
import { OverseerrService } from '@/lib/services/overseerr';
import { createLogger } from '@/lib/logger';
import { connectionTestRoute } from '@/lib/routes/connection-test';

const logger = createLogger('API:OverseerrTest');

async function testOverseerrConnection(url: string, apiKey: string): Promise<OverseerrTestResponse> {
  const service = new OverseerrService(url, apiKey);
  const result = await service.testConnection();

  return result.success ? { success: true, version: result.version } : { success: false, error: result.error };
}

export const POST = connectionTestRoute(overseerrTestResponseSchema, testOverseerrConnection, 'Overseerr', logger);
