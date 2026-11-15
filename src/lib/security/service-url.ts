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

function normalizeIpv4MappedIpv6(address: string): string {
  let addr = address;

  if (addr.startsWith('[') && addr.endsWith(']')) {
    addr = addr.slice(1, -1);
  }

  if (addr.startsWith('::ffff:')) {
    const suffix = addr.substring(7);

    if (/^\d+\.\d+\.\d+\.\d+$/.test(suffix)) {
      return suffix;
    }

    if (/^[0-9a-f]+:[0-9a-f]+$/i.test(suffix)) {
      const parts = suffix.split(':');
      const octets: number[] = [];
      parts.forEach(part => {
        const num = parseInt(part, 16);
        octets.push(Math.floor(num / 256), num % 256);
      });
      if (octets.length === 4) {
        return octets.join('.');
      }
    }
  }

  return address;
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

  let hostname = parsed.hostname.toLowerCase();

  const ipv4FromMapped = normalizeIpv4MappedIpv6(hostname);
  if (ipv4FromMapped !== hostname) {
    hostname = ipv4FromMapped;
  }

  if (hostnameAllowed(hostname, options)) {
    return { valid: true, normalized };
  }

  const isIpAddress = /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':');
  let addresses: { address: string }[];

  if (isIpAddress) {
    addresses = [{ address: hostname }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      return { valid: false, error: 'Could not resolve hostname' };
    }
  }

  for (const { address } of addresses) {
    const normalizedIp = normalizeIpv4MappedIpv6(address);
    if (isAlwaysBlockedIp(normalizedIp)) {
      return { valid: false, error: 'Invalid or disallowed service URL' };
    }
    if (isPrivateLanIp(normalizedIp) && !options.allowPrivateNetworks) {
      return { valid: false, error: 'Invalid or disallowed service URL' };
    }
  }

  return { valid: true, normalized };
}

export function allowPrivateServiceUrls(): boolean {
  return process.env.DECIDARR_ALLOW_PRIVATE_URLS === 'true';
}
