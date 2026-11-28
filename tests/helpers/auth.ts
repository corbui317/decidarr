import jwt from 'jsonwebtoken';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User, IUser } from '@/lib/models/User';
import { connectDB } from '@/lib/db';
import { deriveKey } from '@/lib/secrets';
import { setTestCookie, clearTestCookies } from './cookies';

export { clearTestCookies };

/** The Plex server access token every seeded user holds. */
export const TEST_SERVER_TOKEN = 'test-plex-token-abcdefghijklmnop';
/** The plex.tv account token a seeded Admin holds; Friends hold none. */
export const TEST_ACCOUNT_TOKEN = 'test-plex-account-token';

export async function seedConfiguredSettings(overrides?: {
  plexServerUrl?: string;
  plexUsername?: string;
  plexMachineId?: string;
  tmdbApiKey?: string;
}) {
  await connectDB();
  const settings = await getOrCreateSettings();

  settings.plexServerUrl = overrides?.plexServerUrl ?? 'http://192.168.1.10:32400';
  settings.plexUsername = overrides?.plexUsername ?? 'testuser';
  settings.plexMachineId = overrides?.plexMachineId ?? 'machine-1';
  if (overrides?.tmdbApiKey) {
    settings.tmdbApiKey = overrides.tmdbApiKey;
  }
  settings.setupComplete = true;
  await settings.save();

  return settings;
}

/** Settings marked complete but with no Admin holding a Plex token (stale/partial local DB state). */
export async function seedPartialSettings() {
  await connectDB();
  const settings = await getOrCreateSettings();

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
  /** This user's access token for the configured Plex server; defaults to TEST_SERVER_TOKEN. */
  serverToken?: string;
  spinHistory?: {
    enabled?: boolean;
    retentionLimit?: number;
    storeFilterSnapshot?: boolean;
  };
}): Promise<IUser> {
  await connectDB();
  const settings = await getOrCreateSettings();
  const plexUserId = overrides?.plexUserId ?? 'plex-user-test-1';

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
    user.setPlexTokens({
      serverToken: overrides?.serverToken ?? TEST_SERVER_TOKEN,
      accountToken: user.isAdmin ? TEST_ACCOUNT_TOKEN : null,
      // Seeded before settings name a server, the token is for the one seedConfiguredSettings() names.
      machineId: settings.plexMachineId ?? 'machine-1',
    });
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
  return jwt.sign(
    {
      sub: user._id.toString(),
      plexUserId: user.plexUserId,
      isAdmin: user.isAdmin,
      sessionVersion: user.sessionVersion,
    },
    deriveKey('web-session'),
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

/** A same-origin JSON request, with the Origin header a browser sends on every write. */
export function createJsonRequest(
  url: string,
  method: string,
  body?: unknown
): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: new URL(url).origin },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
