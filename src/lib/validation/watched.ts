export type WatchedMediaType = 'movie' | 'show' | 'episode';

export interface WatchedCreateBody {
  mediaType: WatchedMediaType;
  title: string;
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parsePlexIdParam(plexId: unknown): ParseResult<string> {
  if (!isNonEmptyString(plexId)) {
    return { ok: false, error: 'plexId must be a non-empty string' };
  }
  return { ok: true, data: plexId };
}

export function parseWatchedCreateBody(body: unknown): ParseResult<WatchedCreateBody> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const raw = body as Record<string, unknown>;

  if (
    raw.mediaType !== 'movie' &&
    raw.mediaType !== 'show' &&
    raw.mediaType !== 'episode'
  ) {
    return { ok: false, error: "mediaType must be 'movie', 'show', or 'episode'" };
  }

  if (!isNonEmptyString(raw.title)) {
    return { ok: false, error: 'title must be a non-empty string' };
  }

  return {
    ok: true,
    data: {
      mediaType: raw.mediaType,
      title: raw.title.trim(),
    },
  };
}
