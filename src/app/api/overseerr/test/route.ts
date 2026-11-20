import { NextRequest } from 'next/server';
import { OverseerrService } from '@/lib/services/overseerr';
import { createLogger } from '@/lib/logger';
import { handleConnectionTest } from '@/lib/routes/connection-test';

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

export async function POST(request: NextRequest) {
  return handleConnectionTest(request, testOverseerrConnection, 'Overseerr', logger);
}
