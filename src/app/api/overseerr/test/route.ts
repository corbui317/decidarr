import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError, authErrorStatus } from '@/lib/auth';
import { OverseerrService } from '@/lib/services/overseerr';
import { createLogger } from '@/lib/logger';
import { assertSafeServiceUrl, allowPrivateServiceUrls } from '@/lib/security/service-url';

const logger = createLogger('API:OverseerrTest');

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { url, apiKey } = body;

    if (!url || !apiKey) {
      return NextResponse.json(
        { error: 'Overseerr URL and API key are required' },
        { status: 400 }
      );
    }

    const urlCheck = await assertSafeServiceUrl(url, {
      allowPrivateNetworks: allowPrivateServiceUrls(),
    });
    if (!urlCheck.valid) {
      return NextResponse.json(
        { success: false, error: urlCheck.error || 'Invalid or disallowed service URL' },
        { status: 400 }
      );
    }

    const service = new OverseerrService(urlCheck.normalized || url, apiKey);
    const result = await service.testConnection();

    if (result.success) {
      logger.info('Overseerr test successful', { version: result.version });
      return NextResponse.json({
        success: true,
        version: result.version,
      });
    }

    logger.warn('Overseerr test failed', { error: result.error });
    return NextResponse.json({ success: false, error: result.error });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Overseerr test error', { error: (error as Error).message });
    return NextResponse.json(
      { success: false, error: 'Failed to test Overseerr connection' },
      { status: 500 }
    );
  }
}
