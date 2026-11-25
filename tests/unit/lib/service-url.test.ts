import { describe, it, expect } from 'vitest';
import { assertSafeServiceUrl } from '@/lib/security/service-url';
import { fakeIntegrations, sequenceLookup } from '../../helpers/fake-integrations';

// vitest.setup.ts turns the private-address opt-in on for every test.
const closed = { allowPrivateNetworks: false };

describe('assertSafeServiceUrl', () => {
  it('blocks loopback addresses even when private URLs are allowed', async () => {
    const result = await assertSafeServiceUrl('http://127.0.0.1:32400', {
      allowPrivateNetworks: true,
    });
    expect(result.valid).toBe(false);
  });

  it('allows RFC1918 addresses when private URLs are allowed', async () => {
    const result = await assertSafeServiceUrl('http://192.168.1.100:8181', {
      allowPrivateNetworks: true,
    });
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('http://192.168.1.100:8181');
  });

  it('blocks private LAN addresses by default', async () => {
    const result = await assertSafeServiceUrl('http://192.168.1.100:8181', closed);
    expect(result.valid).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 loopback addresses', async () => {
    const result = await assertSafeServiceUrl('http://[::ffff:127.0.0.1]:32400', closed);
    expect(result.valid).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 private addresses by default', async () => {
    const result = await assertSafeServiceUrl('http://[::ffff:192.168.1.100]:8181', closed);
    expect(result.valid).toBe(false);
  });

  it('allows IPv4-mapped IPv6 private addresses when private URLs are allowed', async () => {
    const result = await assertSafeServiceUrl('http://[::ffff:192.168.1.100]:8181', {
      allowPrivateNetworks: true,
    });
    expect(result.valid).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 link-local addresses even when private URLs are allowed', async () => {
    const result = await assertSafeServiceUrl('http://[::ffff:169.254.1.1]:32400', {
      allowPrivateNetworks: true,
    });
    expect(result.valid).toBe(false);
  });

  it('blocks bracketed IPv6 loopback (compressed form)', async () => {
    const result = await assertSafeServiceUrl('http://[::1]:32400', closed);
    expect(result.valid).toBe(false);
  });

  it('blocks bracketed IPv6 loopback (expanded form)', async () => {
    const result = await assertSafeServiceUrl('http://[0:0:0:0:0:0:0:1]:32400', closed);
    expect(result.valid).toBe(false);
  });

  it('blocks all-zeros IPv6 address', async () => {
    const result = await assertSafeServiceUrl('http://[::]:32400', closed);
    expect(result.valid).toBe(false);
  });

  it('blocks IPv6 link-local addresses (fe80::/10 range)', async () => {
    const fe80 = await assertSafeServiceUrl('http://[fe80::1]/', closed);
    expect(fe80.valid).toBe(false);

    const fe8a = await assertSafeServiceUrl('http://[fe8a::1]/', closed);
    expect(fe8a.valid).toBe(false);

    const feb0 = await assertSafeServiceUrl('http://[feb0::1]/', closed);
    expect(feb0.valid).toBe(false);
  });

  it('blocks IPv6 ULA addresses (fc00::/7 range) by default', async () => {
    const fc00 = await assertSafeServiceUrl('http://[fc00::1]/', closed);
    expect(fc00.valid).toBe(false);

    const fd00 = await assertSafeServiceUrl('http://[fd00::1]/', closed);
    expect(fd00.valid).toBe(false);
  });

  it.each(['100.64.0.1', '198.18.0.1', '224.0.0.1', '240.0.0.1', '[::ffff:100.64.0.1]'])(
    'blocks %s even when private URLs are allowed',
    async (host) => {
      const result = await assertSafeServiceUrl(`http://${host}:8181`, { allowPrivateNetworks: true });
      expect(result.valid).toBe(false);
    }
  );

  it('blocks a hostname when any of its addresses is blocked', async () => {
    fakeIntegrations(() => new Response(), sequenceLookup(['93.184.216.34', '169.254.169.254']));
    const result = await assertSafeServiceUrl('http://plex.example:32400', { allowPrivateNetworks: true });
    expect(result).toEqual({ valid: false, error: 'Invalid or disallowed service URL' });
  });

  it('allows IPv6 ULA addresses when private URLs are allowed', async () => {
    const fc00 = await assertSafeServiceUrl('http://[fc00::1]/', {
      allowPrivateNetworks: true,
    });
    expect(fc00.valid).toBe(true);

    const fd00 = await assertSafeServiceUrl('http://[fd00::1]/', {
      allowPrivateNetworks: true,
    });
    expect(fd00.valid).toBe(true);
  });
});
