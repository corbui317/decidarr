import { normalizeUrl } from '@/lib/auth';
import { resolveHost } from '@/lib/integrations/client';
import { isAddressAllowed, normalizeIp, serviceUrlPolicy, type UrlPolicy } from '@/lib/integrations/url-policy';

export interface SafeUrlResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Save-time check of a service URL the Admin enters, for a clear error before
 * it is stored. The integration client checks again at connect time.
 */
export async function assertSafeServiceUrl(
  url: string,
  policy: UrlPolicy = serviceUrlPolicy()
): Promise<SafeUrlResult> {
  if (!url?.trim()) {
    return { valid: false, error: 'URL is required' };
  }

  const normalized = normalizeUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only http and https URLs are allowed' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Credentials in URL are not allowed' };
  }

  const literal = normalizeIp(parsed.hostname);
  let addresses: string[];
  if (literal) {
    addresses = [literal];
  } else {
    try {
      addresses = (await resolveHost(parsed.hostname)).map(({ address }) => address);
    } catch {
      return { valid: false, error: 'Could not resolve hostname' };
    }
  }

  if (addresses.length === 0 || addresses.some((address) => !isAddressAllowed(address, policy))) {
    return { valid: false, error: 'Invalid or disallowed service URL' };
  }

  return { valid: true, normalized };
}
