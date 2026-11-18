export type OverseerrAvailability = 'available' | 'partially_available';

export const OVERSEERR_STATUS = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
  DELETED: 6,
} as const;

export function mapOverseerrMediaStatus(
  status: number | undefined | null
): OverseerrAvailability | null {
  if (status === OVERSEERR_STATUS.AVAILABLE) return 'available';
  if (status === OVERSEERR_STATUS.PARTIALLY_AVAILABLE) return 'partially_available';
  return null;
}

export function overseerrMediaTypeKey(mediaType: 'movie' | 'show'): 'movie' | 'tv' {
  return mediaType === 'show' ? 'tv' : 'movie';
}

export function buildOverseerrLookupKey(
  mediaType: 'movie' | 'show',
  tmdbId: string | number
): string {
  return `${overseerrMediaTypeKey(mediaType)}:${tmdbId}`;
}
