import {
  createApiClient,
  createMobileTransport,
  createPublicTransport,
  ApiError,
  type MobileAuthLogoutRequest,
  type PreferenceContract,
  type SelectionParameters,
  type SpinHistoryCreateBody,
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
  // Sent best-effort with whatever access token is stored, without forcing a refresh,
  // so the server can also revoke the session by device id.
  logout: async (body: MobileAuthLogoutRequest = {}) => {
    const accessToken = await getAccessToken();
    return publicTransport.request<{ success: boolean }>('/mobile/auth/logout', {
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
  recordSpinHistory: (entry: SpinHistoryCreateBody) => authenticatedClient.spinHistory.create(entry),
};
