import crypto from 'crypto';
import { createLogger } from '../logger';

const logger = createLogger('PlexOAuth');
const PLEX_TV_BASE = 'https://plex.tv';
const FETCH_TIMEOUT_MS = 15_000;

function isE2eMockMode(): boolean {
  return process.env.E2E_MOCK_PLEX === 'true';
}

const E2E_MOCK_PIN_ID = 424242;
const E2E_MOCK_PIN_CODE = 'e2e-mock-pin-code';
const E2E_MOCK_AUTH_TOKEN = 'e2e-test-plex-token-valid';

export const PLEX_PRODUCT = 'Decidarr';
export const PLEX_VERSION = process.env.PLEX_APP_VERSION || '2.0.0';
export const PLEX_PLATFORM = 'Web';
export const PLEX_DEVICE = 'Decidarr Web';

export const PLEX_CLIENT_ID =
  process.env.PLEX_CLIENT_ID || 'decidarr-app-plex-oauth';

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

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export function getPlexClientHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Plex-Product': PLEX_PRODUCT,
    'X-Plex-Version': PLEX_VERSION,
    'X-Plex-Platform': PLEX_PLATFORM,
    'X-Plex-Device': PLEX_DEVICE,
    'X-Plex-Device-Name': PLEX_DEVICE,
    'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
    ...extra,
  };
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
  if (isE2eMockMode()) {
    return { id: E2E_MOCK_PIN_ID, code: E2E_MOCK_PIN_CODE };
  }

  const response = await fetchWithTimeout(`${PLEX_TV_BASE}/api/v2/pins?strong=true`, {
    method: 'POST',
    headers: {
      ...getPlexClientHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      strong: 'true',
      'X-Plex-Product': PLEX_PRODUCT,
      'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
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
  if (isE2eMockMode()) {
    return {
      id: pinId,
      code,
      authToken: E2E_MOCK_AUTH_TOKEN,
    };
  }

  const query = new URLSearchParams({ code });
  const response = await fetchWithTimeout(
    `${PLEX_TV_BASE}/api/v2/pins/${pinId}?${query.toString()}`,
    {
      method: 'GET',
      headers: getPlexClientHeaders(),
    }
  );

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

export function buildPlexAuthUrl(code: string, options?: { forwardUrl?: string }): string {
  const params = new URLSearchParams({
    clientID: PLEX_CLIENT_ID,
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
  if (isE2eMockMode()) {
    return {
      id: 'e2e-user',
      username: 'e2euser',
      email: 'e2e@example.com',
    };
  }

  const response = await fetchWithTimeout(`${PLEX_TV_BASE}/api/v2/user`, {
    headers: {
      ...getPlexClientHeaders(),
      'X-Plex-Token': authToken,
    },
  });

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

export interface PlexFriend {
  id: string;
  username: string;
  thumb?: string;
  hasServerAccess: boolean;
  isApproved: boolean;
}

export async function fetchPlexFriends(authToken: string): Promise<
  Array<{ id: string; username: string; thumb?: string }>
> {
  try {
    const response = await fetchWithTimeout(`${PLEX_TV_BASE}/api/v2/friends`, {
      headers: {
        ...getPlexClientHeaders(),
        'X-Plex-Token': authToken,
      },
    });

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

import { isSecureCookieEnabled } from '@/lib/security/cookie-options';

export function getOAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookieEnabled(),
    sameSite: 'lax' as const,
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: '/',
  };
}
