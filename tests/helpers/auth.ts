import jwt from 'jsonwebtoken';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User, IUser } from '@/lib/models/User';
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

export async function seedTestUser(overrides?: {
  plexUserId?: string;
  plexUsername?: string;
  isAdmin?: boolean;
  isApproved?: boolean;
  spinHistory?: {
    enabled?: boolean;
    retentionLimit?: number;
    storeFilterSnapshot?: boolean;
  };
}): Promise<IUser> {
  await connectDB();
  const settings = await getOrCreateSettings();
  const encryptionKey = settings.getEncryptionKey();
  const plexUserId = overrides?.plexUserId ?? 'plex-user-test-1';
  const plexToken = settings.getDecryptedPlexToken() ?? 'test-plex-token-abcdefghijklmnop';

  let user = await User.findOne({ plexUserId });
  if (!user) {
    user = new User({
      plexUserId,
      plexUsername: overrides?.plexUsername ?? 'testuser',
      isAdmin: overrides?.isAdmin ?? true,
      isApproved: overrides?.isApproved ?? true,
      sessionVersion: 0,
      preferences: {},
    });
    user.setEncryptedToken(plexToken, encryptionKey);
    await user.save();
  }

  if (overrides?.spinHistory) {
    user.preferences = user.preferences || {};
    user.preferences.spinHistory = {
      enabled: overrides.spinHistory.enabled ?? true,
      retentionLimit: overrides.spinHistory.retentionLimit ?? 50,
      storeFilterSnapshot: overrides.spinHistory.storeFilterSnapshot ?? true,
    };
    await user.save();
  }

  return user;
}

export async function createModernSessionToken(user: IUser): Promise<string> {
  const settings = await getOrCreateSettings();
  return jwt.sign(
    {
      sub: user._id.toString(),
      plexUserId: user.plexUserId,
      isAdmin: user.isAdmin,
      sessionVersion: user.sessionVersion,
    },
    settings.getJwtSecret(),
    { expiresIn: '7d' }
  );
}

/** @deprecated Legacy username-only JWT for backward-compat tests */
export async function createSessionToken(username = 'testuser'): Promise<string> {
  const settings = await getOrCreateSettings();
  return jwt.sign(
    { type: 'session', username, loginAt: Date.now() },
    settings.getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export async function authenticateTestSession(options?: {
  user?: IUser;
  username?: string;
}): Promise<{ token: string; user: IUser }> {
  const user = options?.user ?? (await seedTestUser({ plexUsername: options?.username }));
  const token = await createModernSessionToken(user);
  setTestCookie('decidarr_session', token);
  return { token, user };
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
