import jwt from 'jsonwebtoken';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { connectDB } from '@/lib/db';
import { setTestCookie, clearTestCookies } from './cookies';

export { clearTestCookies };

export async function seedConfiguredSettings(overrides?: {
  plexToken?: string;
  plexServerUrl?: string;
  plexUsername?: string;
  tmdbApiKey?: string;
}) {
  await connectDB();
  const settings = await getOrCreateSettings();

  settings.plexToken = overrides?.plexToken ?? 'test-plex-token-abcdefghijklmnop';
  settings.plexServerUrl = overrides?.plexServerUrl ?? 'http://192.168.1.10:32400';
  settings.plexUsername = overrides?.plexUsername ?? 'testuser';
  if (overrides?.tmdbApiKey) {
    settings.tmdbApiKey = overrides.tmdbApiKey;
  }
  settings.setupComplete = true;
  await settings.save();

  return settings;
}

/** Settings marked complete but missing Plex token (stale/partial local DB state). */
export async function seedPartialSettings() {
  await connectDB();
  const settings = await getOrCreateSettings();

  settings.plexToken = undefined;
  settings.plexServerUrl = 'http://192.168.1.10:32400';
  settings.plexUsername = 'testuser';
  settings.setupComplete = true;
  await settings.save();

  return settings;
}

export async function createSessionToken(username = 'testuser'): Promise<string> {
  const settings = await getOrCreateSettings();
  return jwt.sign(
    { type: 'session', username, loginAt: Date.now() },
    settings.getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export async function authenticateTestSession(username = 'testuser'): Promise<string> {
  const token = await createSessionToken(username);
  setTestCookie('decidarr_session', token);
  return token;
}

export function createJsonRequest(
  url: string,
  method: string,
  body?: unknown
): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
