import { BlockList, isIP } from 'net';

/** Which addresses an integration may connect to. */
export interface UrlPolicy {
  /** The Admin's opt-in for LAN services (`DECIDARR_ALLOW_PRIVATE_URLS`). */
  allowPrivateNetworks: boolean;
}

export function allowPrivateServiceUrls(): boolean {
  return process.env.DECIDARR_ALLOW_PRIVATE_URLS === 'true';
}

export function serviceUrlPolicy(): UrlPolicy {
  return { allowPrivateNetworks: allowPrivateServiceUrls() };
}

function blockList(v4: string[], v6: string[]): BlockList {
  const list = new BlockList();
  for (const cidr of v4) {
    const [network, prefix] = cidr.split('/');
    list.addSubnet(network, Number(prefix), 'ipv4');
  }
  for (const cidr of v6) {
    const [network, prefix] = cidr.split('/');
    list.addSubnet(network, Number(prefix), 'ipv6');
  }
  return list;
}

/** Never reachable, whatever the policy. */
const ALWAYS_BLOCKED = blockList(
  [
    '0.0.0.0/8', // "this network"
    '169.254.0.0/16', // link-local, including cloud metadata
    '100.64.0.0/10', // carrier-grade NAT
    '198.18.0.0/15', // benchmarking
    '224.0.0.0/4', // multicast
    '240.0.0.0/4', // reserved, including broadcast
  ],
  [
    '::/128', // unspecified
    'fc00::/7', // unique local: outside the opt-in, which covers only RFC 1918 and loopback
    'fe80::/10', // link-local
    'ff00::/8', // multicast
  ]
);

/** Reachable only with the private-address opt-in. */
const PRIVATE = blockList(
  ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8'], // RFC 1918, loopback
  ['::1/128'] // loopback
);

const IPV4_MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/**
 * Strips brackets and turns an IPv4-mapped IPv6 address (in any spelling) into
 * plain IPv4, so it is classified by the IPv4 ranges. Returns null for a
 * string that is not an IP address.
 */
export function normalizeIp(address: string): string | null {
  const bare = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  const version = isIP(bare);
  if (version === 4) return bare;
  if (version !== 6) return null;

  // The URL parser prints IPv6 in canonical compressed form, mapped tail in hex.
  const canonical = new URL(`http://[${bare}]`).hostname.slice(1, -1).toLowerCase();
  const mapped = canonical.match(IPV4_MAPPED);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/** Whether an integration may connect to this IP address under the policy. */
export function isAddressAllowed(address: string, policy: UrlPolicy): boolean {
  const ip = normalizeIp(address);
  if (!ip) return false;
  const family = isIP(ip) === 4 ? 'ipv4' : 'ipv6';
  if (ALWAYS_BLOCKED.check(ip, family)) return false;
  if (PRIVATE.check(ip, family)) return policy.allowPrivateNetworks;
  return true;
}
