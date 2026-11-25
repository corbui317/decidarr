import { describe, it, expect } from 'vitest';
import { isAddressAllowed, normalizeIp } from '@/lib/integrations/url-policy';

const closed = { allowPrivateNetworks: false };
const lan = { allowPrivateNetworks: true };

describe('isAddressAllowed', () => {
  it.each([
    ['100.64.0.1', 'carrier-grade NAT'],
    ['100.127.255.254', 'carrier-grade NAT'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.254', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['0.0.0.0', 'this network'],
    ['127.0.0.1', 'loopback'],
    ['169.254.169.254', 'cloud metadata'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'IPv6 link-local'],
    ['ff02::1', 'IPv6 multicast'],
  ])('always blocks %s (%s), even with the private-address opt-in', (address) => {
    expect(isAddressAllowed(address, closed)).toBe(false);
    expect(isAddressAllowed(address, lan)).toBe(false);
  });

  it.each(['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.10', 'fd00::1'])(
    'allows private address %s only with the opt-in',
    (address) => {
      expect(isAddressAllowed(address, closed)).toBe(false);
      expect(isAddressAllowed(address, lan)).toBe(true);
    }
  );

  it.each(['93.184.216.34', '100.63.255.255', '100.128.0.0', '198.17.255.255', '198.20.0.0', '172.32.0.1', '2606:4700::1111'])(
    'allows public address %s',
    (address) => {
      expect(isAddressAllowed(address, closed)).toBe(true);
    }
  );

  it.each(['::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1', '[::FFFF:127.0.0.1]', '::ffff:100.64.0.1'])(
    'normalizes IPv4-mapped IPv6 %s before checking',
    (address) => {
      expect(isAddressAllowed(address, lan)).toBe(false);
    }
  );

  it('applies the opt-in to IPv4-mapped private addresses', () => {
    expect(isAddressAllowed('::ffff:192.168.1.10', closed)).toBe(false);
    expect(isAddressAllowed('::ffff:c0a8:10a', lan)).toBe(true);
  });

  it('refuses anything that is not an IP address', () => {
    expect(isAddressAllowed('plex.example', lan)).toBe(false);
    expect(isAddressAllowed('', lan)).toBe(false);
  });
});

describe('normalizeIp', () => {
  it('turns IPv4-mapped IPv6 into IPv4 and canonicalizes IPv6', () => {
    expect(normalizeIp('::ffff:192.168.1.10')).toBe('192.168.1.10');
    expect(normalizeIp('0:0:0:0:0:ffff:c0a8:010a')).toBe('192.168.1.10');
    expect(normalizeIp('[0:0:0:0:0:0:0:1]')).toBe('::1');
    expect(normalizeIp('not-an-ip')).toBeNull();
  });
});
