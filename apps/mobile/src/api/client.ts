import {
  createApiClient,
  createMobileTransport,
  createPublicTransport,
  ApiError,
  type MobileAuthExchangeRequest,
  type MobileAuthLogoutRequest,
  type MobileAuthTokens,
  type PreferenceContract,
  type SelectionParameters,
  type SuccessResponse,
} from '@decidarr/api-contracts';
import { getApiBaseUrl } from './config';
import {
  getAccessToken,
  getAccessTokenExpiresAt,
  getOrCreateDeviceId,
  getRefreshToken,
  storeTokens,
} from '@/auth/session';

export { ApiError };

const publicTransport = createPublicTransport({ baseUrl: getApiBaseUrl });
const publicClient = createApiClient(publicTransport);

type ReauthRequiredListener = () => void;
const reauthRequiredListeners = new Set<ReauthRequiredListener>();

/**
 * Notified whenever the server definitively rejects the stored refresh token (401),
 * from any authenticated call - coreApi, syncApi, or an explicit getValidAccessToken -
 * not only one that happened to be made through AuthProvider already. AuthProvider
 * subscribes so a revoked session (logout, un-approval, reuse detection) lands every
 * screen in the signed-out state, not only the ones that call logout themselves.
 */
export function onReauthRequired(listener: ReauthRequiredListener): () => void {
  reauthRequiredListeners.add(listener);
  return () => reauthRequiredListeners.delete(listener);
}

async function refresh() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  const deviceId = await getOrCreateDeviceId();
  try {
    const result = await publicClient.mobileAuth.refresh({ refreshToken, deviceId });
    await storeTokens(result.accessToken, result.refreshToken, Date.now() + result.expiresIn * 1000);
    return result;
  } catch (error) {
    // Only the server actually rejecting the refresh token (401) means the session is dead.
    // A network failure, a 5xx, or a transient 4xx like 429 rate limiting is not an invalid
    // token, so it must not be swallowed into "sign out" - rethrow so the caller can tell
    // the two apart.
    if (error instanceof ApiError && error.status === 401) {
      reauthRequiredListeners.forEach((listener) => listener());
      return null;
    }
    throw error;
  }
}

const mobileTransport = createMobileTransport({
  baseUrl: getApiBaseUrl,
  getAccessToken,
  getExpiresAt: getAccessTokenExpiresAt,
  refresh,
});

const authenticatedClient = createApiClient(mobileTransport);

/** Reads the current access token, refreshing first if it is missing or close to expiry. */
export const getValidAccessToken = mobileTransport.getValidAccessToken;

export const mobileAuthApi = {
  ...publicClient.mobileAuth,
  // Before the user approves the sign-in on plex.tv the server answers 202 with no tokens:
  // sign-in is not finished, so this rejects with the server's message.
  exchange: async (body: MobileAuthExchangeRequest): Promise<MobileAuthTokens> => {
    const result = await publicClient.mobileAuth.exchange(body);
    if ('authorized' in result) {
      throw new Error(result.error);
    }
    return result;
  },
  // Sent best-effort with whatever access token is stored, without forcing a refresh,
  // so the server can also revoke the session by device id.
  logout: async (body: MobileAuthLogoutRequest = {}) => {
    const accessToken = await getAccessToken();
    return publicTransport.request<SuccessResponse>('/mobile/auth/logout', {
      method: 'POST',
      body,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  },
};

export const syncApi = authenticatedClient.sync;

export const coreApi = {
  getSections: () => authenticatedClient.library.getSections(),
  spin: (params: SelectionParameters) => authenticatedClient.selection.random(params),
  updatePreferences: (preferences: Partial<PreferenceContract>) =>
    authenticatedClient.preferences.update(preferences),
};
