import { describe, it, expect } from 'vitest';
import { canSpin, requiresSignIn, syncStatusLabel } from '../../../apps/mobile/src/sync/state';

describe('mobile sync state helpers', () => {
  it('allows spin only when online and ready', () => {
    expect(canSpin('ready_online', true)).toBe(true);
    expect(canSpin('ready_offline', false)).toBe(false);
    expect(canSpin('syncing', true)).toBe(true);
    expect(canSpin('signed_out', true)).toBe(false);
  });

  it('shows offline setup message without initial snapshot', () => {
    expect(syncStatusLabel('ready_offline', false, null, 0)).toContain('connect to finish setup');
  });

  it('shows pending count when queue has items', () => {
    expect(syncStatusLabel('ready_online', true, new Date().toISOString(), 2)).toContain(
      '2 change(s) pending'
    );
  });

  it('shows conflict state distinctly from pending', () => {
    const label = syncStatusLabel('conflict', true, new Date().toISOString(), 1);
    expect(label).toContain('need attention');
  });

  it('sends the user to sign in again only when the server refused the session or Plex token', () => {
    expect(requiresSignIn({ status: 401, code: 'PLEX_SIGN_IN_REQUIRED' })).toBe(true);
    expect(requiresSignIn({ status: 401, code: 'UNAUTHENTICATED' })).toBe(true);
    expect(requiresSignIn({ status: 404, code: 'NO_ITEMS_MATCH_FILTERS' })).toBe(false);
    expect(requiresSignIn(new Error('Network request failed'))).toBe(false);
  });
});
