import { cookies } from 'next/headers';
import { connectDB } from './db';
import { getOrCreateSettings, ISettings } from './models/Settings';
import { IUser, User } from './models/User';
import { deriveKey } from './secrets';
import { PlexService } from './services/plex';
import { createLogger } from './logger';
import { SessionError } from './auth-errors';
import { verifySessionJwt } from './security/session-jwt';

export { SessionError, isAuthError, authErrorStatus } from './auth-errors';
export type { SessionErrorCode } from './auth-errors';

const logger = createLogger('Auth');

export interface AuthContext {
  user: IUser;
  settings: ISettings;
  /** The user's access token for the configured Plex server, never a plex.tv account token. */
  plexToken: string;
  plexServerUrl: string;
  isAdmin: boolean;
  expiresAt: number; // Unix timestamp when session expires
}

export interface SessionPayload {
  sub: string;
  plexUserId: string;
  isAdmin: boolean;
  sessionVersion: number;
  /** Unix timestamp (ms) of the sign-in that started this session's absolute lifetime. */
  signedInAt: number;
  exp: number; // Unix timestamp when session expires
}

const SESSION_COOKIE = 'decidarr_session';

/** A web session cannot be refreshed past this long after the sign-in that started it. */
export const WEB_SESSION_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Verifies the web session cookie. Throws SessionError when it is missing, invalid, or too old. */
export async function readCookieSession(): Promise<SessionPayload> {
  const settings = await getOrCreateSettings();

  if (!settings.setupComplete) {
    throw new SessionError('APP_NOT_CONFIGURED');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new SessionError('UNAUTHORIZED');
  }

  let payload: SessionPayload;
  try {
    payload = verifySessionJwt<SessionPayload>(token, deriveKey('web-session'));
  } catch {
    // Expired, tampered with, or signed before a DECIDARR_SECRET change.
    throw new SessionError('UNAUTHORIZED');
  }

  if (!payload.sub || payload.sessionVersion === undefined) {
    throw new SessionError('UNAUTHORIZED');
  }

  // A cookie issued before this check existed carries no signedInAt: sign that session out
  // once rather than guess when it began, the same way a DECIDARR_SECRET-rotation signs
  // sessions out once rather than trust a key that no longer applies.
  if (typeof payload.signedInAt !== 'number') {
    throw new SessionError('UNAUTHORIZED');
  }

  if (Date.now() - payload.signedInAt > WEB_SESSION_ABSOLUTE_LIFETIME_MS) {
    throw new SessionError('UNAUTHORIZED');
  }

  return payload;
}

/**
 * Loads the user behind a verified session (web cookie or mobile bearer token) and
 * checks it is still valid: user exists, session not revoked, user approved, Plex token readable.
 */
export async function authContextForSession(payload: SessionPayload): Promise<AuthContext> {
  const settings = await getOrCreateSettings();

  const user = await User.findById(payload.sub);
  if (!user) {
    logger.warn('Auth failed: user not found', { sub: payload.sub });
    throw new SessionError('UNAUTHORIZED');
  }

  if (user.sessionVersion !== payload.sessionVersion) {
    logger.warn('Auth failed: session revoked', { sub: payload.sub });
    throw new SessionError('UNAUTHORIZED');
  }

  if (!user.isApproved && !user.isAdmin) {
    logger.warn('Auth failed: user not approved', { sub: payload.sub });
    throw new SessionError('UNAUTHORIZED');
  }

  if (!settings.plexServerUrl) {
    throw new Error('Plex server URL not configured');
  }

  // No server token for the configured server (an upgrade whose exchange failed, a server move) or an
  // unreadable one: only a new sign-in helps.
  let plexToken: string | null;
  try {
    plexToken = user.getServerToken(settings.plexMachineId);
  } catch {
    plexToken = null;
  }
  if (!plexToken) {
    logger.warn('Auth failed: no usable Plex server token', { sub: payload.sub });
    throw new SessionError('PLEX_SIGN_IN_REQUIRED');
  }

  return {
    user,
    settings,
    plexToken,
    plexServerUrl: settings.plexServerUrl,
    isAdmin: user.isAdmin,
    expiresAt: payload.exp * 1000, // Convert to milliseconds
  };
}

const sectionsCache = new Map<string, { ids: string[]; expiresAt: number }>();
const SECTIONS_TTL_MS = 60_000;

function filterRequestedLibraryIds(allowedIds: string[], requestedIds?: string[]): string[] {
  if (!requestedIds || requestedIds.length === 0) {
    return allowedIds;
  }

  const allowed = new Set(allowedIds);
  return requestedIds.filter((id) => allowed.has(id));
}

/** Clears cached Plex library sections. Omit userId to clear all entries (e.g. Plex URL change). */
export function invalidateAccessibleLibraryCache(userId?: string): void {
  if (!userId) {
    sectionsCache.clear();
    return;
  }

  const prefix = `${userId}:`;
  for (const key of Array.from(sectionsCache.keys())) {
    if (key.startsWith(prefix)) {
      sectionsCache.delete(key);
    }
  }
}

export interface LibraryAccess {
  userId: string;
  plexToken: string;
  plexServerUrl: string;
  plexMachineId: string | null;
}

export async function getAccessibleLibraryIds(
  access: LibraryAccess,
  requestedIds?: string[]
): Promise<string[]> {
  const cacheKey = `${access.userId}:${access.plexMachineId ?? ''}`;
  const cached = sectionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return filterRequestedLibraryIds(cached.ids, requestedIds);
  }

  const plexService = new PlexService(
    access.plexToken,
    access.plexServerUrl,
    access.plexMachineId
  );
  const sections = await plexService.getLibrarySections();
  const allowedIds = sections
    .filter((s) => s.type === 'movie' || s.type === 'show')
    .map((s) => s.id);

  sectionsCache.set(cacheKey, {
    ids: allowedIds,
    expiresAt: Date.now() + SECTIONS_TTL_MS,
  });

  return filterRequestedLibraryIds(allowedIds, requestedIds);
}

export async function getOverseerrConfig(): Promise<{
  url: string | null;
  apiKey: string | null;
  filterEnabled: boolean;
  configured: boolean;
  lastSyncOk: boolean;
}> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    const apiKey = settings.getDecryptedOverseerrKey();
    const url = settings.overseerrUrl || null;
    return {
      url,
      apiKey,
      filterEnabled: settings.overseerrFilterEnabled ?? false,
      configured: !!(url && apiKey),
      lastSyncOk: settings.overseerrLastSyncOk ?? true,
    };
  } catch {
    return {
      url: null,
      apiKey: null,
      filterEnabled: false,
      configured: false,
      lastSyncOk: true,
    };
  }
}

export function normalizeUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }
  return `http://${trimmed}`.replace(/\/+$/, '');
}
