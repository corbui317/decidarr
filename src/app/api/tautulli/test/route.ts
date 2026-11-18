import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError, authErrorStatus } from '@/lib/auth';
import { TautulliService } from '@/lib/services/tautulli';
import { createLogger } from '@/lib/logger';
import { assertSafeServiceUrl, allowPrivateServiceUrls } from '@/lib/security/service-url';

const logger = createLogger('API:TautulliTest');

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { url, apiKey } = body;

    if (!url || !apiKey) {
      return NextResponse.json(
        { error: 'Tautulli URL and API key are required' },
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

    const service = new TautulliService(urlCheck.normalized || url, apiKey);
    const result = await service.testConnection();

    if (result.success) {
      const users = await service.getUsers();
      logger.info('Tautulli test successful', { userCount: users.length });
      return NextResponse.json({
        success: true,
        users: users.map(u => ({
          id: u.user_id,
          username: u.username,
          friendlyName: u.friendly_name,
        })),
      });
    }

    logger.warn('Tautulli test failed', { error: result.error });
    return NextResponse.json({ success: false, error: result.error });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Tautulli test error', { error: (error as Error).message });
    return NextResponse.json(
      { success: false, error: 'Failed to test Tautulli connection' },
      { status: 500 }
    );
  }
}
