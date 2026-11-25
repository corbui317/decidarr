import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { normalizeAndValidatePlexImagePath } from '@/lib/plex-image';
import { createLogger } from '@/lib/logger';
import { PlexService } from '@/lib/services/plex';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:PlexImage');

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    const rawPath = request.nextUrl.searchParams.get('path');
    const widthParam = request.nextUrl.searchParams.get('width');

    if (!rawPath) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
    }

    // Decode and normalize the path (handles encoded traversal attempts)
    const normalizedPath = normalizeAndValidatePlexImagePath(rawPath);
    if (!normalizedPath) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
    }

    const width = widthParam ? Math.max(40, Math.min(1000, parseInt(widthParam, 10))) : NaN;
    const response = await new PlexService(auth.plexToken, auth.plexServerUrl).getImage(
      normalizedPath,
      Number.isNaN(width) ? undefined : width
    );

    if (response.status === 404) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    if (!response.ok) {
      logger.warn('Plex image fetch failed', { status: response.status });
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Plex image proxy error', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
  }
}
