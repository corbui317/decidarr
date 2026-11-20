import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { getOrCreateSettings } from './models/Settings';
import { User, IUser } from './models/User';
import { PlexServer } from './services/plex';
import { createPlexService } from './services/plex-factory';
import { fetchPlexUser } from './services/plex-oauth-factory';
import { assertSafeServiceUrl, allowPrivateServiceUrls } from './security/service-url';
import { createLogger } from './logger';
import { isSecureCookieEnabled } from './security/cookie-options';
import { AuthErrorCode, createAuthError } from './auth-errors';

const logger = createLogger('AuthLogin');

const SESSION_COOKIE = 'decidarr_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    username: string;
    serverUrl: string;
    isAdmin: boolean;
    thumb?: string;
  };
  error?: string;
  code?: AuthErrorCode;
  status?: number;
  requiresSetup?: boolean;
}

export async function completePlexLogin(
  authToken: string,
  options?: { setupTmdbApiKey?: string }
): Promise<LoginResult> {
  let plexUser;
  try {
    plexUser = await fetchPlexUser(authToken);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'PLEX_UNAVAILABLE') {
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
  const encryptionKey = settings.getEncryptionKey();
  const plexService = await createPlexService(authToken);

  let servers: PlexServer[] = [];
  try {
    servers = await plexService.getServers();
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Server discovery failed', { error: msg });
    if (
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('aborted')
    ) {
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

  user.setEncryptedToken(authToken, encryptionKey);
  await user.save();

  if (!settings.setupComplete && isAdmin && candidateServer) {
    const localConnection = candidateServer.connections.find((c: { local: boolean }) => c.local);
    const connection = localConnection || candidateServer.connections[0];
    if (connection) {
      const urlCheck = await assertSafeServiceUrl(connection.uri, {
        allowPrivateNetworks: allowPrivateServiceUrls(),
      });
      if (urlCheck.valid) {
        settings.plexServerUrl = urlCheck.normalized || connection.uri;
        settings.plexMachineId = candidateServer.clientIdentifier;
        settings.plexUsername = plexUser.username;
        settings.adminUserId = user._id as Types.ObjectId;
        settings.setupComplete = true;
        if (options?.setupTmdbApiKey) {
          settings.tmdbApiKey = options.setupTmdbApiKey;
        }
        await settings.save();
        logger.info('Initial setup completed via OAuth', {
          username: plexUser.username,
          machineId: candidateServer.clientIdentifier,
        });
      }
    }
  } else if (isAdmin && !settings.adminUserId) {
    settings.adminUserId = user._id as Types.ObjectId;
    await settings.save();
  }

  await issueSessionCookie(user, settings.getJwtSecret());

  return {
    success: true,
    user: {
      id: user._id.toString(),
      username: plexUser.username,
      serverUrl: settings.plexServerUrl || '',
      isAdmin: user.isAdmin,
      thumb: plexUser.thumb,
    },
    requiresSetup: !settings.setupComplete,
  };
}

export async function issueSessionCookie(user: IUser, jwtSecret: string): Promise<void> {
  const token = jwt.sign(
    {
      sub: user._id.toString(),
      plexUserId: user.plexUserId,
      isAdmin: user.isAdmin,
      sessionVersion: user.sessionVersion,
    },
    jwtSecret,
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
