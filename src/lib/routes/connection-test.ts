import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError, authErrorStatus } from '@/lib/auth';
import { assertSafeServiceUrl, allowPrivateServiceUrls } from '@/lib/security/service-url';
import type { Logger } from '@/lib/logger';

export type ConnectionTestResult = { success: boolean; error?: string; [key: string]: unknown };

export async function handleConnectionTest(
  request: NextRequest,
  testConnection: (url: string, apiKey: string) => Promise<ConnectionTestResult>,
  serviceName: string,
  logger: Logger
): Promise<NextResponse> {
  try {
    await requireAdmin();

    const body = await request.json();
    const { url, apiKey } = body;

    if (!url || !apiKey) {
      return NextResponse.json(
        { error: `${serviceName} URL and API key are required` },
        { status: 400 }
      );
    }

    const urlCheck = await assertSafeServiceUrl(url, {
      allowPrivateNetworks: allowPrivateServiceUrls(),
    });
    if (!urlCheck.valid) {
      // Log internal reason but return generic error to client (security spec 01 §2.3 step 7)
      logger.warn(`${serviceName} URL validation failed`, { url, reason: urlCheck.error });
      return NextResponse.json(
        { success: false, error: 'Invalid or disallowed service URL' },
        { status: 400 }
      );
    }

    const result = await testConnection(urlCheck.normalized || url, apiKey);

    if (result.success) {
      logger.info(`${serviceName} test successful`, result);
      return NextResponse.json(result);
    }

    logger.warn(`${serviceName} test failed`, { error: result.error });
    return NextResponse.json({ success: false, error: result.error });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error(`${serviceName} test error`, { error: (error as Error).message });
    return NextResponse.json(
      { success: false, error: `Failed to test ${serviceName} connection` },
      { status: 500 }
    );
  }
}
