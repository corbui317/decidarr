import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const ACCESS_TOKEN_KEY = 'decidarr_access_token';
const ACCESS_TOKEN_EXPIRES_AT_KEY = 'decidarr_access_token_expires_at';
const REFRESH_TOKEN_KEY = 'decidarr_refresh_token';
const DEVICE_ID_KEY = 'decidarr_device_id';
const USER_METADATA_KEY = 'decidarr_user_metadata';

export interface StoredUserMetadata {
  id: string;
  username: string;
  serverUrl: string;
  isAdmin: boolean;
  thumb?: string;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(16);
  const deviceId = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  await SecureStore.setItemAsync(ACCESS_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

/** Epoch milliseconds the stored access token expires at, or null if unknown. */
export async function getAccessTokenExpiresAt(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(ACCESS_TOKEN_EXPIRES_AT_KEY);
  return raw ? Number(raw) : null;
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_EXPIRES_AT_KEY);
}

export async function storeUserMetadata(user: StoredUserMetadata): Promise<void> {
  await SecureStore.setItemAsync(USER_METADATA_KEY, JSON.stringify(user));
}

export async function getUserMetadata(): Promise<StoredUserMetadata | null> {
  const raw = await SecureStore.getItemAsync(USER_METADATA_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredUserMetadata;
}

export async function clearUserMetadata(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_METADATA_KEY);
}

export async function clearSecureSession(): Promise<void> {
  await clearTokens();
  await clearUserMetadata();
}
