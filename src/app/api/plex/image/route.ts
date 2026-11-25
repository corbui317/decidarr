import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { normalizeAndValidatePlexImagePath } from '@/lib/plex-image';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:PlexImage');

const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

function isAllowedImageContentType(contentType: string): boolean {
  const mimeType = contentType.split(';')[0]?.trim().toLowerCase();
  return mimeType !== undefined && ALLOWED_IMAGE_CONTENT_TYPES.has(mimeType);
}

const imageQuery = z.object({
  path: z.string().min(1),
  width: z.string().optional(),
});

export const GET = route({ access: 'user', query: imageQuery }, async ({ session, query }) => {
  const normalizedPath = normalizeAndValidatePlexImagePath(query.path);
  if (!normalizedPath) {
    throw new DomainError('VALIDATION_FAILED', 'Invalid image path');
  }

  let upstreamUrl = `${session.plex.serverUrl}${normalizedPath}`;
  if (query.width) {
    const width = Math.max(40, Math.min(1000, parseInt(query.width, 10)));
    if (!Number.isNaN(width)) {
      const separator = normalizedPath.includes('?') ? '&' : '?';
      upstreamUrl = `${session.plex.serverUrl}${normalizedPath}${separator}width=${width}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(upstreamUrl, {
      headers: {
        'X-Plex-Token': session.plex.token,
        Accept: 'image/*,*/*',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.warn('Plex image proxy error', { error: (err as Error).message });
    throw new DomainError('INTEGRATION_UNAVAILABLE', 'Failed to fetch image');
  }

  if (response.status === 404) {
    throw new DomainError('NOT_FOUND', 'Image not found');
  }

  if (!response.ok) {
    logger.warn('Plex image fetch failed', { status: response.status });
    throw new DomainError('INTEGRATION_REJECTED', 'Failed to fetch image');
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!isAllowedImageContentType(contentType)) {
    logger.warn('Plex image fetch refused: disallowed content type', { contentType });
    return NextResponse.json(
      { error: 'Upstream response was not an allowed image content type' },
      { status: 415 }
    );
  }
  const body = await response.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
