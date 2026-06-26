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
});
