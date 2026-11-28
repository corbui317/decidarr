import { NextResponse } from 'next/server';
import { plexImageQuerySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { errorReply } from '@/lib/request/reply';
import { normalizeAndValidatePlexImagePath } from '@/lib/plex-image';
import { createLogger } from '@/lib/logger';
import { PlexService } from '@/lib/services/plex';

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

export const GET = route(
  // The image bytes, never JSON: 'raw' lets the handler build its own Response.
  { access: 'user', query: plexImageQuerySchema, response: 'raw' },
  async ({ session, query }) => {
    const normalizedPath = normalizeAndValidatePlexImagePath(query.path);
    if (!normalizedPath) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid image path');
    }

    const width = query.width ? Math.max(40, Math.min(1000, parseInt(query.width, 10))) : NaN;
    const plexService = new PlexService(session.plex.token, session.plex.serverUrl);
    const response = await plexService.getImage(normalizedPath, Number.isNaN(width) ? undefined : width);

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
      return errorReply(415, { error: 'Upstream response was not an allowed image content type' });
    }
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }
);
