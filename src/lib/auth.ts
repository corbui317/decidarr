import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { connectDB } from './db';
import { getOrCreateSettings, ISettings } from './models/Settings';
import { IUser, loadUserWithToken } from './models/User';
import { PlexService, PlexLibrary } from './services/plex';
import { createLogger } from './logger';
import { runMigrations } from './migrate';

const logger = createLogger('Auth');

export interface AuthContext {
  user: IUser;
  settings: ISettings;
  plexToken: string;
  plexServerUrl: string;
  isAdmin: boolean;
}

export interface SessionPayload {
  sub: string;
  plexUserId: string;
  isAdmin: boolean;
  sessionVersion: number;
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

async function parseSession(): Promise<SessionPayload> {
  await connectDB();
  await runMigrations();
  const settings = await getOrCreateSettings();

  if (!settings.setupComplete) {
    throw new Error('App not configured');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new Error('Unauthorized');
  }

  const jwtSecret = settings.getJwtSecret();
  const payload = jwt.verify(token, jwtSecret) as SessionPayload;

  if (!payload.sub || payload.sessionVersion === undefined) {
    throw new Error('Unauthorized');
  }

  return payload;
}

export async function requireUser(): Promise<AuthContext> {
  const payload = await parseSession();
  const settings = await getOrCreateSettings();

  const user = await loadUserWithToken(payload.sub);
  if (!user) {
    logger.warn('Auth failed: user not found', { sub: payload.sub });
    throw new Error('Unauthorized');
  }

  if (user.sessionVersion !== payload.sessionVersion) {
    logger.warn('Auth failed: session revoked', { sub: payload.sub });
    throw new Error('Unauthorized');
  }

  if (!user.isApproved && !user.isAdmin) {
    logger.warn('Auth failed: user not approved', { sub: payload.sub });
    throw new Error('Unauthorized');
  }

  if (!settings.plexServerUrl) {
    throw new Error('Plex server URL not configured');
  }

  let plexToken: string;
  try {
    plexToken = user.getDecryptedToken();
  } catch {
    throw new Error('Unauthorized');
  }

  if (!plexToken) {
    throw new Error('Unauthorized');
  }

  return {
    user,
    settings,
    plexToken,
    plexServerUrl: settings.plexServerUrl,
    isAdmin: user.isAdmin,
  };
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.isAdmin) {
    logger.warn('Admin auth failed', { sub: ctx.user._id.toString() });
    throw new Error('Forbidden');
  }
  return ctx;
}

/** @deprecated Use requireUser() — kept for gradual migration */
export async function requireAuth(): Promise<{
  plexToken: string;
  plexServerUrl: string;
  settings: ISettings;
  user: IUser;
  isAdmin: boolean;
}> {
  const ctx = await requireUser();
  return {
    plexToken: ctx.plexToken,
    plexServerUrl: ctx.plexServerUrl,
    settings: ctx.settings,
    user: ctx.user,
    isAdmin: ctx.isAdmin,
  };
}

export async function getAccessibleLibraryIds(
  auth: AuthContext,
  requestedIds?: string[]
): Promise<string[]> {
  const plexService = new PlexService(
    auth.plexToken,
    auth.plexServerUrl,
    auth.settings.plexMachineId || null
  );
  const sections = await plexService.getLibrarySections();
  const allowed = new Set(
    sections.filter((s) => s.type === 'movie' || s.type === 'show').map((s) => s.id)
  );

  if (!requestedIds || requestedIds.length === 0) {
    return Array.from(allowed);
  }

  return requestedIds.filter((id) => allowed.has(id));
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

export function validatePlexUrl(url: string): { valid: boolean; error?: string; normalized?: string } {
  const normalized = normalizeUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only http and https URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('127.')
  ) {
    return { valid: false, error: 'Loopback addresses are not permitted' };
  }

  if (hostname.startsWith('169.254.')) {
    return { valid: false, error: 'Link-local addresses are not permitted' };
  }

  if (hostname === '::1' || hostname.startsWith('fe80:')) {
    return { valid: false, error: 'Link-local IPv6 addresses are not permitted' };
  }

  return { valid: true, normalized };
}

export function isAuthError(error: unknown): boolean {
  const msg = (error as Error)?.message;
  return msg === 'App not configured' || msg === 'Unauthorized' || msg === 'Forbidden';
}

export function authErrorStatus(error: unknown): number {
  const msg = (error as Error)?.message;
  if (msg === 'Forbidden') return 403;
  if (msg === 'App not configured' || msg === 'Unauthorized') return 401;
  return 500;
}
