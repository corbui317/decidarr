import { cookies } from 'next/headers';
import { signSessionJwt } from './security/session-jwt';
import { Types } from 'mongoose';
import { getOrCreateSettings } from './models/Settings';
import { User, IUser } from './models/User';
import { readPlexServerIdentity } from './services/plex';
import { fetchPlexServers, fetchPlexUser, type PlexServerResource } from './services/plex-oauth';
import { assertSafeServiceUrl } from './security/service-url';
import { createLogger } from './logger';
import { IntegrationError } from './integrations/client';
import { isSecureCookieEnabled } from './security/cookie-options';
import { AuthErrorCode, createAuthError } from './auth-errors';
import { deriveKey } from './secrets';

const logger = createLogger('AuthLogin');

const SESSION_COOKIE = 'decidarr_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    username: string;
    isAdmin: boolean;
    thumb?: string;
  };
  error?: string;
  code?: AuthErrorCode;
  status?: number;
  requiresSetup?: boolean;
}

/**
 * Signs a user in with their plex.tv account token. The account token is used here
 * once, to read the user's servers; only their access token for this install's server
 * is kept, plus the account token itself for the Admin (ADR 0002).
 */
export async function completePlexLogin(
  authToken: string,
  options?: { setupTmdbApiKey?: string }
): Promise<LoginResult> {
  let plexUser;
  try {
    plexUser = await fetchPlexUser(authToken);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'PLEX_UNAVAILABLE' || (err instanceof IntegrationError && err.unavailable)) {
      const authError = createAuthError('PLEX_UNAVAILABLE', 'Plex.tv service unavailable');
      logger.warn('Login failed', { reason: authError.detailedReason });
      return {
        success: false,
        error: 'Plex.tv is unavailable. Login is temporarily blocked. Please try again later.',
        code: authError.code,
        status: 503,
      };
    }
    const authError = createAuthError('AUTH_FAILED', `Plex authentication failed: ${msg}`);
    logger.warn('Login failed', { reason: authError.detailedReason });
    return {
      success: false,
      error: authError.message,
      code: authError.code,
      status: 401,
    };
  }

  const settings = await getOrCreateSettings();

  let servers: PlexServerResource[] = [];
  try {
    servers = await fetchPlexServers(authToken);
  } catch (err) {
    logger.error('Server discovery failed', { error: (err as Error).message });
    if (err instanceof IntegrationError && err.unavailable) {
      const authError = createAuthError('PLEX_UNAVAILABLE', 'Plex.tv service unavailable during server discovery');
      return {
        success: false,
        error: 'Plex.tv is unavailable. Login is temporarily blocked. Please try again later.',
        code: authError.code,
        status: 503,
      };
    }
    servers = [];
  }

  const ownedServers = servers.filter((s) => s.owned);
  const candidateServer = !settings.setupComplete ? ownedServers[0] : ownedServers[0] || servers[0];

  let isAdmin = false;
  let isApproved = false;

  if (!settings.setupComplete) {
    if (ownedServers.length === 0) {
      const authError = createAuthError(
        'NO_OWNED_SERVER',
        'No owned Plex Media Server found on account; setup requires an owned server'
      );
      logger.warn('Login denied during setup', { reason: authError.detailedReason, plexUserId: plexUser.id });
      return {
        success: false,
        error: authError.message,
        code: authError.code,
        status: 403,
      };
    }
    if (!candidateServer) {
      const authError = createAuthError(
        'NO_OWNED_SERVER',
        'No Plex Media Server found on account during setup'
      );
      logger.warn('Login denied during setup', { reason: authError.detailedReason, plexUserId: plexUser.id });
      return {
        success: false,
        error: authError.message,
        code: authError.code,
        status: 403,
      };
    }
    isAdmin = true;
    isApproved = true;
  } else {
    const adminUser = settings.adminUserId
      ? await User.findById(settings.adminUserId)
      : null;
    const isServerOwner = adminUser?.plexUserId === plexUser.id;

    if (isServerOwner) {
      isAdmin = true;
      isApproved = true;
    } else if (settings.plexMachineId) {
      const hasAccess = servers.some((s) => s.clientIdentifier === settings.plexMachineId);
      if (!hasAccess) {
        const authError = createAuthError(
          'NO_SERVER_ACCESS',
          'Plex account does not have access to configured server'
        );
        logger.warn('Login denied', { reason: authError.detailedReason, plexUserId: plexUser.id });
        return {
          success: false,
          error: authError.message,
          code: authError.code,
          status: 403,
        };
      }
      isApproved = settings.approvedPlexUserIds?.includes(plexUser.id) ?? false;
      if (!isApproved) {
        const existing = await User.findOne({ plexUserId: plexUser.id });
        isApproved = existing?.isApproved ?? false;
      }
      if (!isApproved) {
        const authError = createAuthError(
          'NOT_APPROVED',
          'User not approved for access'
        );
        logger.warn('Login denied', { reason: authError.detailedReason, plexUserId: plexUser.id });
        return {
          success: false,
          error: authError.message,
          code: authError.code,
          status: 403,
        };
      }
    } else {
      const authError = createAuthError(
        'SERVER_MISCONFIGURED',
        'Server not fully configured'
      );
      logger.warn('Login denied', { reason: authError.detailedReason });
      return {
        success: false,
        error: authError.message,
        code: authError.code,
        status: 503,
      };
    }
  }

  if (settings.setupComplete && isAdmin && !settings.plexMachineId && settings.plexServerUrl) {
    // Installs set up by hand before OAuth may not know their server's identity yet.
    // A refusal leaves the identity unknown, and sign-in then reports no access to this server.
    const machineId = await readPlexServerIdentity(settings.plexServerUrl);
    if (machineId) {
      settings.plexMachineId = machineId;
      await settings.save();
    }
  }

  const installServer = settings.setupComplete
    ? servers.find((s) => s.clientIdentifier === settings.plexMachineId)
    : candidateServer;
  const serverToken = installServer?.accessToken;
  if (!serverToken) {
    const authError = createAuthError(
      'NO_SERVER_ACCESS',
      "Plex did not return an access token for this install's server"
    );
    logger.warn('Login denied', { reason: authError.detailedReason, plexUserId: plexUser.id });
    return {
      success: false,
      error: authError.message,
      code: authError.code,
      status: 403,
    };
  }

  // Resolve the server connection for first-run setup before anything is persisted, so a
  // validation failure here never leaves a stale Admin flag on a user record (a half-finished
  // setup must not be hijackable; see spec #18 story 40).
  let setupServerUrl: string | undefined;
  if (!settings.setupComplete && isAdmin && candidateServer) {
    const localConnection = candidateServer.connections.find((c: { local: boolean }) => c.local);
    const connection = localConnection || candidateServer.connections[0];
    const urlCheck = connection ? await assertSafeServiceUrl(connection.uri) : null;
    if (!connection || !urlCheck?.valid) {
      const authError = createAuthError(
        'SERVER_MISCONFIGURED',
        connection ? `Unsafe Plex server connection: ${urlCheck?.error}` : 'Owned Plex server has no connection'
      );
      logger.warn('Setup denied', { reason: authError.detailedReason, plexUserId: plexUser.id });
      return {
        success: false,
        error: authError.message,
        code: authError.code,
        status: 403,
      };
    }
    setupServerUrl = urlCheck.normalized || connection.uri;
  }

  let user = await User.findOne({ plexUserId: plexUser.id });
  if (!user) {
    user = new User({
      plexUserId: plexUser.id,
      plexUsername: plexUser.username,
      plexEmail: plexUser.email,
      plexThumb: plexUser.thumb,
      isAdmin,
      isApproved,
      sessionVersion: 0,
      preferences: {
        theme: settings.uiPreferences?.theme || 'dark',
        defaultMediaType: settings.uiPreferences?.defaultMediaType || 'movie',
        tvSelectionMode: settings.uiPreferences?.tvSelectionMode || 'show',
        animationStyle: settings.uiPreferences?.animationStyle || 'slots',
        animationSpeed: settings.uiPreferences?.animationSpeed || 'normal',
      },
    });
  } else {
    user.plexUsername = plexUser.username;
    user.plexEmail = plexUser.email;
    user.plexThumb = plexUser.thumb;
    user.isAdmin = isAdmin;
    user.isApproved = isApproved || isAdmin;
    user.lastLoginAt = new Date();
    user.tokenValidatedAt = new Date();
  }

  user.setPlexTokens({ serverToken, accountToken: isAdmin ? authToken : null, machineId: installServer.clientIdentifier });
  await user.save();

  if (setupServerUrl && candidateServer) {
    try {
      settings.plexServerUrl = setupServerUrl;
      settings.plexMachineId = candidateServer.clientIdentifier;
      settings.plexUsername = plexUser.username;
      settings.adminUserId = user._id as Types.ObjectId;
      settings.setupComplete = true;
      if (options?.setupTmdbApiKey) {
        settings.tmdbApiKey = options.setupTmdbApiKey;
      }
      await settings.save();
    } catch (err) {
      // The user was already saved as Admin above (its own write is atomic, but there is no
      // transaction across the two documents: Mongo here is not a replica set). Anything
      // that fails between that write and this one - saving settings, or encrypting the
      // TMDb key above - must not leave a stale Admin flag behind (spec #18 story 40), so
      // roll the flags back by hand.
      await User.updateOne({ _id: user._id }, { isAdmin: false, isApproved: false });
      const authError = createAuthError('SERVER_MISCONFIGURED', `Failed to complete setup: ${(err as Error).message}`);
      logger.error('Setup failed while saving settings; rolled back Admin flag', {
        reason: authError.detailedReason,
        plexUserId: plexUser.id,
      });
      return {
        success: false,
        error: authError.message,
        code: authError.code,
        status: 500,
      };
    }
    logger.info('Initial setup completed via OAuth', {
      username: plexUser.username,
      machineId: candidateServer.clientIdentifier,
    });
  } else if (isAdmin && !settings.adminUserId) {
    settings.adminUserId = user._id as Types.ObjectId;
    await settings.save();
  }

  await issueSessionCookie(user);

  return {
    success: true,
    user: {
      id: user._id.toString(),
      username: plexUser.username,
      isAdmin: user.isAdmin,
      thumb: plexUser.thumb,
    },
    requiresSetup: !settings.setupComplete,
  };
}

export async function issueSessionCookie(user: IUser): Promise<void> {
  const token = signSessionJwt(
    {
      sub: user._id.toString(),
      plexUserId: user.plexUserId,
      isAdmin: user.isAdmin,
      sessionVersion: user.sessionVersion,
    },
    deriveKey('web-session'),
    { expiresIn: '7d' }
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookieEnabled(),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
