import {
  createApiClient,
  createMobileTransport,
  createPublicTransport,
  ApiError,
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
  } catch {
    return null;
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

export const mobileAuthApi = publicClient.mobileAuth;

export const syncApi = authenticatedClient.sync;

export const coreApi = {
  getSections: () => authenticatedClient.library.getSections(),
  spin: (params: SelectionParameters) => authenticatedClient.selection.random(params),
  updatePreferences: (preferences: Partial<PreferenceContract>) =>
    authenticatedClient.preferences.update(preferences),
  recordSpinHistory: (entry: SpinHistoryCreateBody) => authenticatedClient.spinHistory.create(entry),
};
