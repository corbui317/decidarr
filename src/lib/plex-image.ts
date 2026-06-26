const PLEX_LIBRARY_PATH_PREFIX = '/library/';

export function stripTokenFromUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.delete('X-Plex-Token');
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.replace(/[?&]X-Plex-Token=[^&]*/gi, '').replace(/\?$/, '');
  }
}

export function extractThumbPathFromUrl(url: string): string | null {
  const stripped = stripTokenFromUrl(url);
  try {
    const parsed = new URL(stripped, 'http://localhost');
    const path = parsed.pathname;
    return isValidPlexImagePath(path) ? path : null;
  } catch {
    if (stripped.startsWith('/library/')) {
      return isValidPlexImagePath(stripped.split('?')[0]) ? stripped.split('?')[0] : null;
    }
    return null;
  }
}

export function isValidPlexImagePath(path: string): boolean {
  if (!path || !path.startsWith(PLEX_LIBRARY_PATH_PREFIX)) return false;
  if (path.includes('..') || path.includes('//')) return false;
  if (path.startsWith('http://') || path.startsWith('https://')) return false;
  return true;
}

export function plexImageUrl(thumbPath?: string | null, width?: number): string | null {
  if (!thumbPath || !isValidPlexImagePath(thumbPath)) return null;
  const params = new URLSearchParams({ path: thumbPath });
  if (width !== undefined) {
    const bounded = Math.max(40, Math.min(1000, Math.round(width)));
    params.set('width', String(bounded));
  }
  return `/api/plex/image?${params.toString()}`;
}

export function resolveItemImageUrls(item: {
  thumbPath?: string | null;
  artPath?: string | null;
  posterUrl?: string | null;
  art?: string | null;
}): { posterUrl: string | null; art: string | null; thumbPath?: string; artPath?: string } {
  const thumbPath =
    item.thumbPath ||
    (item.posterUrl ? extractThumbPathFromUrl(item.posterUrl) : null);
  const artPath =
    item.artPath || (item.art ? extractThumbPathFromUrl(item.art) : null);

  return {
    posterUrl: plexImageUrl(thumbPath),
    art: plexImageUrl(artPath),
    thumbPath: thumbPath || undefined,
    artPath: artPath || undefined,
  };
}

export function sanitizeThumbPathInput(path: unknown): string | undefined {
  if (typeof path !== 'string' || !path.trim()) return undefined;
  const trimmed = path.trim();
  if (!isValidPlexImagePath(trimmed)) return undefined;
  return trimmed;
}

export function containsPlexToken(value: unknown): boolean {
  return typeof value === 'string' && /X-Plex-Token/i.test(value);
}

export function sanitizeLibraryItemForClient<T extends Record<string, unknown>>(item: T): T {
  const images = resolveItemImageUrls(item as Parameters<typeof resolveItemImageUrls>[0]);
  const { posterUrl: _legacyPoster, art: _legacyArt, ...rest } = item;
  return {
    ...rest,
    thumbPath: images.thumbPath ?? (item.thumbPath as string | undefined),
    artPath: images.artPath ?? (item.artPath as string | undefined),
    posterUrl: images.posterUrl ?? undefined,
    art: images.art ?? undefined,
  } as unknown as T;
}
