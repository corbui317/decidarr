import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { isValidPlexImagePath } from '@/lib/plex-image';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:PlexImage');

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    const path = request.nextUrl.searchParams.get('path');
    const widthParam = request.nextUrl.searchParams.get('width');

    if (!path || !isValidPlexImagePath(path)) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
    }

    let upstreamUrl = `${auth.plexServerUrl}${path}`;
    if (widthParam) {
      const width = Math.max(40, Math.min(1000, parseInt(widthParam, 10)));
      if (!Number.isNaN(width)) {
        const separator = path.includes('?') ? '&' : '?';
        upstreamUrl = `${auth.plexServerUrl}${path}${separator}width=${width}`;
      }
    }

    const response = await fetch(upstreamUrl, {
      headers: {
        'X-Plex-Token': auth.plexToken,
        Accept: 'image/*,*/*',
      },
      signal: AbortSignal.timeout(15_000),
    });

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
