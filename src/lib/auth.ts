import { cookies, headers } from 'next/headers';
import { connectDB } from './db';
import { getOrCreateSettings, ISettings } from './models/Settings';
import { IUser, User } from './models/User';
import { deriveKey } from './secrets';
import { PlexLibrary, PlexService } from './services/plex';
import { createLogger } from './logger';
import { runMigrations } from './migrate';
import { verifyAccessToken } from './mobile-auth/tokens';
import { SessionError } from './auth-errors';
import { verifySessionJwt } from './security/session-jwt';

export { SessionError, isAuthError, authErrorStatus } from './auth-errors';
export type { SessionErrorCode } from './auth-errors';

const logger = createLogger('Auth');

export interface AuthContext {
  user: IUser;
  settings: ISettings;
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
  exp: number; // Unix timestamp when session expires
}

const SESSION_COOKIE = 'decidarr_session';

export async function getPlexCredentials(): Promise<{
  plexToken: string | null;
  plexServerUrl: string | null;
  plexUsername: string | null;
}> {
  try {
    const ctx = await requireUser();
    return {
      plexToken: ctx.plexToken,
      plexServerUrl: ctx.plexServerUrl,
      plexUsername: ctx.user.plexUsername || null,
    };
  } catch {
    return { plexToken: null, plexServerUrl: null, plexUsername: null };
  }
}

export async function getSettings(): Promise<ISettings> {
  await connectDB();
  await runMigrations();
  return getOrCreateSettings();
}

export async function validateSession(): Promise<boolean> {
  try {
    await requireUser();
    return true;
  } catch {
    return false;
  }
}

async function parseBearerSession(): Promise<SessionPayload | null> {
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const payload = await verifyAccessToken(token);
    return {
      sub: payload.sub,
      plexUserId: payload.plexUserId,
      isAdmin: payload.isAdmin,
      sessionVersion: payload.sessionVersion,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

async function parseSession(): Promise<SessionPayload> {
  await connectDB();
  await runMigrations();

  const bearerPayload = await parseBearerSession();
  if (bearerPayload) {
    return bearerPayload;
  }

  return readCookieSession();
}

/** Verifies the web session cookie. Throws SessionError when it is missing or invalid. */
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

  return payload;
}

export async function requireUser(): Promise<AuthContext> {
  return authContextForSession(await parseSession());
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

  let plexToken: string;
  try {
    plexToken = user.getDecryptedToken();
  } catch {
    throw new SessionError('UNAUTHORIZED');
  }

  if (!plexToken) {
    throw new SessionError('UNAUTHORIZED');
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

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.isAdmin) {
    logger.warn('Admin auth failed', { sub: ctx.user._id.toString() });
    throw new SessionError('FORBIDDEN');
  }
  return ctx;
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

export async function getAccessibleLibraryIds(
  auth: AuthContext,
  requestedIds?: string[]
): Promise<string[]> {
  const cacheKey = `${auth.user._id}:${auth.settings.plexMachineId ?? ''}`;
  const cached = sectionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return filterRequestedLibraryIds(cached.ids, requestedIds);
  }

  const plexService = new PlexService(
    auth.plexToken,
    auth.plexServerUrl,
    auth.settings.plexMachineId || null
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

export function filterLibrariesForUser(
  sections: PlexLibrary[],
  allowedIds: string[]
): PlexLibrary[] {
  const allowed = new Set(allowedIds);
  return sections.filter((s) => allowed.has(s.id));
}

export async function getTmdbApiKey(): Promise<string | null> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return settings.getDecryptedTmdbKey();
  } catch {
    return null;
  }
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

export async function getSyncFrequencyHours(): Promise<number> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return settings.syncFrequencyHours;
  } catch {
    return 24;
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
