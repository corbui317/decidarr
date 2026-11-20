import { lookup } from 'dns/promises';
import { isIP } from 'net';
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
  // IPv4 loopback and special addresses
  if (ip === '0.0.0.0') return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('169.254.')) return true;

  // IPv6 loopback (::1 and 0:0:0:0:0:0:0:1)
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;

  // All-zeros IPv6 (::)
  if (ip === '::' || ip === '0:0:0:0:0:0:0:0') return true;

  // IPv6 link-local fe80::/10 (fe80-febf range)
  if (ip.startsWith('fe8') || ip.startsWith('fe9') ||
      ip.startsWith('fea') || ip.startsWith('feb')) {
    return true;
  }

  return false;
}

function isPrivateLanIp(ip: string): boolean {
  // IPv4 private ranges (RFC 1918)
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  // IPv6 ULA fc00::/7 (fc00-fdff range)
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

function stripBracketsAndNormalizeIpv6(address: string): string {
  let addr = address;

  // Strip brackets from IPv6 addresses
  if (addr.startsWith('[') && addr.endsWith(']')) {
    addr = addr.slice(1, -1);
  }

  // Normalize IPv6 addresses using URL parsing
  // This handles compressed forms like ::1 -> 0:0:0:0:0:0:0:1
  if (isIP(addr) === 6) {
    try {
      // Use URL to normalize IPv6 (it expands compressed forms)
      const normalized = new URL(`http://[${addr}]`).hostname;
      // Remove brackets that URL adds back
      return normalized.startsWith('[') && normalized.endsWith(']')
        ? normalized.slice(1, -1)
        : normalized;
    } catch {
      // If normalization fails, return the address as-is
      return addr;
    }
  }

  return addr;
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

  // Strip brackets and normalize IPv6 addresses early
  hostname = stripBracketsAndNormalizeIpv6(hostname);

  // Handle IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  const ipv4FromMapped = normalizeIpv4MappedIpv6(hostname);
  if (ipv4FromMapped !== hostname) {
    hostname = ipv4FromMapped;
  }

  if (hostnameAllowed(hostname, options)) {
    return { valid: true, normalized };
  }

  // Use net.isIP() to properly detect IP addresses
  const ipVersion = isIP(hostname);
  const isIpAddress = ipVersion !== 0;
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
    // Normalize the address (strip brackets, expand IPv6)
    let normalizedIp = stripBracketsAndNormalizeIpv6(address);

    // Handle IPv4-mapped IPv6
    normalizedIp = normalizeIpv4MappedIpv6(normalizedIp);

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
