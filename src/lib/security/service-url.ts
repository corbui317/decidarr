import { lookup } from 'dns/promises';
import { normalizeUrl } from '@/lib/auth';

export interface SafeUrlOptions {
  allowPrivateNetworks?: boolean;
  allowedHostnames?: string[];
  requireHttps?: boolean;
}

export interface SafeUrlResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

function isAlwaysBlockedIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('fe80:')) return true;
  return false;
}

function isPrivateLanIp(ip: string): boolean {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return false;
}

function hostnameAllowed(hostname: string, options: SafeUrlOptions): boolean {
  const lower = hostname.toLowerCase();
  if (options.allowedHostnames?.some((h) => h.toLowerCase() === lower)) {
    return true;
  }
  return false;
}

export async function assertSafeServiceUrl(
  url: string,
  options: SafeUrlOptions = {}
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

  if (options.requireHttps && parsed.protocol !== 'https:') {
    return { valid: false, error: 'HTTPS is required' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Credentials in URL are not allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostnameAllowed(hostname, options)) {
    return { valid: true, normalized };
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { valid: false, error: 'Could not resolve hostname' };
  }

  for (const { address } of addresses) {
    if (isAlwaysBlockedIp(address)) {
      return { valid: false, error: 'Invalid or disallowed service URL' };
    }
    if (isPrivateLanIp(address) && !options.allowPrivateNetworks) {
      return { valid: false, error: 'Invalid or disallowed service URL' };
    }
  }

  return { valid: true, normalized };
}

export function allowPrivateServiceUrls(): boolean {
  return process.env.DECIDARR_ALLOW_PRIVATE_URLS === 'true';
}
