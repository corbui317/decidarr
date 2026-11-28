import type { PlexFriendUser } from '@decidarr/api-contracts';
import crypto from 'crypto';
import { createLogger } from '../logger';
import { createIntegrationClient, type IntegrationClient } from '../integrations/client';
import { isSecureCookieEnabled } from '@/lib/security/cookie-options';
import { Settings, SETTINGS_ID, getOrCreateSettings } from '../models/Settings';

const logger = createLogger('PlexOAuth');
const PLEX_TV_TIMEOUT_MS = 15_000;

export const PLEX_PRODUCT = 'Decidarr';
export const PLEX_VERSION = process.env.PLEX_APP_VERSION || '2.0.0';
export const PLEX_PLATFORM = 'Web';
export const PLEX_DEVICE = 'Decidarr Web';

/**
 * This install's Plex client identifier, generated on first use and persisted, so Plex
 * shows each install as its own app and no other page can pose as it in the sign-in prompt.
 */
export async function getPlexClientId(): Promise<string> {
  const settings = await getOrCreateSettings();
  if (settings.plexClientId) return settings.plexClientId;
  // Only the first writer's id lands; every caller then reads that one.
  await Settings.updateOne(
    { _id: SETTINGS_ID, plexClientId: { $exists: false } },
    { $set: { plexClientId: crypto.randomUUID() } }
  );
  const stored = await Settings.findById(SETTINGS_ID, { plexClientId: 1 }).lean();
  if (!stored?.plexClientId) throw new Error('Plex client identifier was not stored');
  return stored.plexClientId;
}

export const OAUTH_PIN_COOKIE = 'decidarr_oauth_pin';
export const OAUTH_PIN_CODE_COOKIE = 'decidarr_oauth_pin_code';
export const OAUTH_STATE_COOKIE = 'decidarr_oauth_state';

export const OAUTH_COOKIE_MAX_AGE = 600;

export interface PlexPin {
  id: number;
  code: string;
  authToken?: string;
}

export interface PlexOAuthUser {
  id: string;
  username: string;
  email: string;
  thumb?: string;
}

/** The headers that identify this install to plex.tv and to Plex servers. */
export async function getPlexClientHeaders(): Promise<Record<string, string>> {
  return {
    Accept: 'application/json',
    'X-Plex-Product': PLEX_PRODUCT,
    'X-Plex-Version': PLEX_VERSION,
    'X-Plex-Platform': PLEX_PLATFORM,
    'X-Plex-Device': PLEX_DEVICE,
    'X-Plex-Device-Name': PLEX_DEVICE,
    'X-Plex-Client-Identifier': await getPlexClientId(),
  };
}

/** The plex.tv client, signed in with an account token when one is given. */
async function plexTvClient(authToken?: string): Promise<IntegrationClient> {
  return createIntegrationClient({
    integration: 'plex.tv',
    // E2E points this at a fake plex.tv on loopback.
    baseUrl: process.env.PLEX_TV_URL || 'https://plex.tv',
    auth: authToken ? { header: 'X-Plex-Token', value: authToken } : undefined,
    headers: await getPlexClientHeaders(),
    timeoutMs: PLEX_TV_TIMEOUT_MS,
  });
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function readErrorSnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}

export async function createAuthPin(): Promise<PlexPin> {
  const response = await (await plexTvClient()).request('/api/v2/pins?strong=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      strong: 'true',
      'X-Plex-Product': PLEX_PRODUCT,
      'X-Plex-Client-Identifier': await getPlexClientId(),
    }).toString(),
  });

  if (!response.ok) {
    const snippet = await readErrorSnippet(response);
    logger.error('Failed to create Plex pin', {
      status: response.status,
      bodySnippet: snippet,
    });
    throw new Error('PLEX_UNAVAILABLE');
  }

  const data = await response.json();
  if (!data?.id || !data?.code) {
    logger.error('Plex pin response missing id or code', { data });
    throw new Error('PLEX_UNAVAILABLE');
  }

  return { id: data.id, code: data.code };
}

export async function pollAuthPin(pinId: number, code: string): Promise<PlexPin> {
  const response = await (await plexTvClient()).request(`/api/v2/pins/${pinId}`, { query: { code } });

  if (!response.ok) {
    const snippet = await readErrorSnippet(response);
    logger.warn('Plex pin poll failed', {
      pinId,
      status: response.status,
      bodySnippet: snippet,
    });
    if (response.status >= 500) {
      throw new Error('PLEX_UNAVAILABLE');
    }
    if (response.status === 404) {
      throw new Error('PLEX_PIN_EXPIRED');
    }
    throw new Error('PLEX_PIN_INVALID');
  }

  const data = await response.json();
  return {
    id: data.id,
    code: data.code,
    authToken: data.authToken || undefined,
  };
}

export async function buildPlexAuthUrl(code: string, options?: { forwardUrl?: string }): Promise<string> {
  const params = new URLSearchParams({
    clientID: await getPlexClientId(),
    code,
    'context[device][product]': PLEX_PRODUCT,
    'context[device][platform]': PLEX_PLATFORM,
    'context[device][layout]': 'desktop',
    'context[device][environment]': 'bundled',
    'context[device][device]': PLEX_DEVICE,
  });

  if (options?.forwardUrl) {
    params.set('forwardUrl', options.forwardUrl);
  }

  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export async function fetchPlexUser(authToken: string): Promise<PlexOAuthUser> {
  const response = await (await plexTvClient(authToken)).request('/api/v2/user');

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error('PLEX_UNAVAILABLE');
    }
    throw new Error('PLEX_AUTH_INVALID');
  }

  const data = await response.json();
  return {
    id: String(data.id),
    username: data.username,
    email: data.email,
    thumb: data.thumb,
  };
}

export interface PlexServerResource {
  name: string;
  clientIdentifier: string;
  owned: boolean;
  /** The account's access token for this one server; it unlocks nothing else. */
  accessToken: string | null;
  connections: { uri: string; local: boolean; relay: boolean }[];
}

/** The Plex servers an account can reach, each with that account's access token for it. */
export async function fetchPlexServers(accountToken: string): Promise<PlexServerResource[]> {
  const data = await (await plexTvClient(accountToken)).json<Record<string, unknown>[]>(
    '/api/v2/resources?includeHttps=1&includeRelay=1'
  );
  const servers = (Array.isArray(data) ? data : []).filter((r) => r.provides === 'server');

  logger.debug('Fetched servers', { count: servers.length });
  return servers.map((server) => ({
    name: server.name as string,
    clientIdentifier: server.clientIdentifier as string,
    owned: Boolean(server.owned),
    accessToken: typeof server.accessToken === 'string' && server.accessToken ? server.accessToken : null,
    connections: ((server.connections as Record<string, unknown>[] | undefined) ?? []).map((c) => ({
      uri: c.uri as string,
      local: c.local as boolean,
      relay: c.relay as boolean,
    })),
  }));
}

export async function fetchPlexFriends(
  authToken: string
): Promise<Pick<PlexFriendUser, 'id' | 'username' | 'thumb'>[]> {
  try {
    const response = await (await plexTvClient(authToken)).request('/api/v2/friends');

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const friends = Array.isArray(data) ? data : [];
    return friends.map((f: Record<string, unknown>) => ({
      id: String(f.id),
      username: (f.username || f.title) as string,
      thumb: f.thumb as string | undefined,
    }));
  } catch (err) {
    logger.warn('Failed to fetch Plex friends', { error: (err as Error).message });
    return [];
  }
}

export function getOAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookieEnabled(),
    sameSite: 'lax' as const,
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: '/',
  };
}
