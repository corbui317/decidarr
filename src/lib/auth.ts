import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { connectDB } from './db';
import { getOrCreateSettings, ISettings } from './models/Settings';

// Get the configured Plex credentials from Settings
export async function getPlexCredentials(): Promise<{
  plexToken: string | null;
  plexServerUrl: string | null;
  plexUsername: string | null;
}> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    if (!settings.setupComplete) {
      return { plexToken: null, plexServerUrl: null, plexUsername: null };
    }

    const plexToken = settings.getDecryptedPlexToken();
    return {
      plexToken,
      plexServerUrl: settings.plexServerUrl || null,
      plexUsername: settings.plexUsername || null,
    };
  } catch {
    return { plexToken: null, plexServerUrl: null, plexUsername: null };
  }
}

// Get the settings with JWT secret (for token signing if needed)
export async function getSettings(): Promise<ISettings> {
  await connectDB();
  return getOrCreateSettings();
}

// Validate the session JWT cookie - returns true if session is valid
export async function validateSession(): Promise<boolean> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    if (!settings.setupComplete) return false;

    const cookieStore = await cookies();
    const token = cookieStore.get('decidarr_session')?.value;
    if (!token) return false;

    const jwtSecret = settings.getJwtSecret();
    jwt.verify(token, jwtSecret);
    return true;
  } catch {
    return false;
  }
}

// Require that the app is configured AND the session cookie is valid
export async function requireAuth(): Promise<{
  plexToken: string;
  plexServerUrl: string;
  settings: ISettings;
}> {
  await connectDB();
  const settings = await getOrCreateSettings();

  if (!settings.setupComplete) {
    throw new Error('App not configured');
  }

  // Validate session cookie
  const cookieStore = await cookies();
  const token = cookieStore.get('decidarr_session')?.value;
  if (!token) {
    throw new Error('Unauthorized');
  }

  try {
    const jwtSecret = settings.getJwtSecret();
    jwt.verify(token, jwtSecret);
  } catch {
    throw new Error('Unauthorized');
  }

  const plexToken = settings.getDecryptedPlexToken();
  if (!plexToken) {
    throw new Error('Plex token not configured');
  }

  if (!settings.plexServerUrl) {
    throw new Error('Plex server URL not configured');
  }

  return {
    plexToken,
    plexServerUrl: settings.plexServerUrl,
    settings,
  };
}

// Get TMDB API key from settings (if configured)
export async function getTmdbApiKey(): Promise<string | null> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return settings.getDecryptedTmdbKey();
  } catch {
    return null;
  }
}

// Get sync frequency from settings
export async function getSyncFrequencyHours(): Promise<number> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return settings.syncFrequencyHours;
  } catch {
    return 24;
  }
}

// Validate a Plex server URL to prevent SSRF attacks.
// Allows RFC1918 private ranges (legitimate home networks) but blocks
// loopback and link-local addresses (cloud metadata endpoints).
export function validatePlexUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only http and https URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block loopback addresses
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('127.')
  ) {
    return { valid: false, error: 'Loopback addresses are not permitted' };
  }

  // Block link-local (169.254.x.x) — used by cloud metadata services
  if (hostname.startsWith('169.254.')) {
    return { valid: false, error: 'Link-local addresses are not permitted' };
  }

  // Block other IPv6 loopback / link-local patterns
  if (hostname === '::1' || hostname.startsWith('fe80:')) {
    return { valid: false, error: 'Link-local IPv6 addresses are not permitted' };
  }

  return { valid: true };
}

// Shared helper to respond with auth/config errors in API routes
export function isAuthError(error: unknown): boolean {
  const msg = (error as Error)?.message;
  return msg === 'App not configured' || msg === 'Unauthorized';
}
