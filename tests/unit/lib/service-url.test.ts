import { describe, it, expect } from 'vitest';
import { assertSafeServiceUrl } from '@/lib/security/service-url';

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
    const result = await assertSafeServiceUrl('http://192.168.1.100:8181');
    expect(result.valid).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 loopback addresses', async () => {
    const result = await assertSafeServiceUrl('http://[::ffff:127.0.0.1]:32400');
    expect(result.valid).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 private addresses by default', async () => {
    const result = await assertSafeServiceUrl('http://[::ffff:192.168.1.100]:8181');
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
    const result = await assertSafeServiceUrl('http://[::1]:32400');
    expect(result.valid).toBe(false);
  });

  it('blocks bracketed IPv6 loopback (expanded form)', async () => {
    const result = await assertSafeServiceUrl('http://[0:0:0:0:0:0:0:1]:32400');
    expect(result.valid).toBe(false);
  });

  it('blocks all-zeros IPv6 address', async () => {
    const result = await assertSafeServiceUrl('http://[::]:32400');
    expect(result.valid).toBe(false);
  });

  it('blocks IPv6 link-local addresses (fe80::/10 range)', async () => {
    const fe80 = await assertSafeServiceUrl('http://[fe80::1]/');
    expect(fe80.valid).toBe(false);

    const fe8a = await assertSafeServiceUrl('http://[fe8a::1]/');
    expect(fe8a.valid).toBe(false);

    const feb0 = await assertSafeServiceUrl('http://[feb0::1]/');
    expect(feb0.valid).toBe(false);
  });

  it('blocks IPv6 ULA addresses (fc00::/7 range) by default', async () => {
    const fc00 = await assertSafeServiceUrl('http://[fc00::1]/');
    expect(fc00.valid).toBe(false);

    const fd00 = await assertSafeServiceUrl('http://[fd00::1]/');
    expect(fd00.valid).toBe(false);
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
