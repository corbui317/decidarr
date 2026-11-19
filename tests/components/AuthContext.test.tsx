import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';

vi.mock('@/lib/api', () => ({
  settingsApi: {
    getStatus: vi.fn(),
  },
  authApi: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
  },
}));

import { settingsApi, authApi } from '@/lib/api';

function AuthProbe() {
  const { user, loading, isAuthenticated } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="auth">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="user">{user?.username ?? 'none'}</span>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not authenticate when setup incomplete', async () => {
    vi.mocked(settingsApi.getStatus).mockResolvedValue({
      setupComplete: false,
      hasPlexToken: false,
      hasPlexServer: false,
      hasTmdbKey: false,
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('no');
    });
    expect(authApi.getCurrentUser).not.toHaveBeenCalled();
  });

  it('authenticates when session is valid', async () => {
    vi.mocked(settingsApi.getStatus).mockResolvedValue({
      setupComplete: true,
      hasPlexToken: true,
      hasPlexServer: true,
      hasTmdbKey: false,
    });
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      user: {
        id: 'user-1',
        username: 'testuser',
        serverUrl: 'http://192.168.1.10:32400',
        isAdmin: false,
      },
      preferences: { theme: 'dark', defaultMediaType: 'movie', tvSelectionMode: 'show' },
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
      expect(screen.getByTestId('user')).toHaveTextContent('testuser');
    });
  });

  it('does not trust plexUsername from status without valid session', async () => {
    vi.mocked(settingsApi.getStatus).mockResolvedValue({
      setupComplete: true,
      hasPlexToken: true,
      hasPlexServer: true,
      hasTmdbKey: false,
    });
    vi.mocked(authApi.getCurrentUser).mockRejectedValue(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('no');
      expect(screen.getByTestId('user')).toHaveTextContent('none');
    });
  });

  describe('Silent session refresh', () => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const NOW = new Date('2026-01-10T12:00:00Z').getTime();

    beforeEach(() => {
      // shouldAdvanceTime lets Testing Library's own short timeouts run, while
      // the test still jumps days ahead explicitly.
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      vi.setSystemTime(NOW);
      vi.mocked(settingsApi.getStatus).mockResolvedValue({
        setupComplete: true,
        hasPlexToken: true,
        hasPlexServer: true,
        hasTmdbKey: false,
      });
      vi.mocked(authApi.refreshSession).mockResolvedValue({ success: true, expiresAt: NOW + 7 * DAY });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    async function renderSignedIn(expiresAt: number) {
      vi.mocked(authApi.getCurrentUser).mockResolvedValue({
        user: { id: 'user-1', username: 'testuser', serverUrl: 'http://192.168.1.10:32400', isAdmin: false },
        preferences: { theme: 'dark', defaultMediaType: 'movie', tvSelectionMode: 'show' },
        expiresAt,
      });
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('yes'));
    }

    it('refreshes at once when the session loads with less than 24h left', async () => {
      await renderSignedIn(NOW + 2 * HOUR);
      await waitFor(() => expect(authApi.refreshSession).toHaveBeenCalledTimes(1));
    });

    it('schedules the refresh for 24h before expiry', async () => {
      await renderSignedIn(NOW + 7 * DAY);

      await vi.advanceTimersByTimeAsync(6 * DAY - HOUR);
      expect(authApi.refreshSession).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(HOUR);
      expect(authApi.refreshSession).toHaveBeenCalledTimes(1);
    });

    it('refreshes when the tab becomes visible after the 24h threshold passed', async () => {
      await renderSignedIn(NOW + 7 * DAY);

      // The tab slept: the clock moved past expiry-24h but the timer never ran.
      vi.setSystemTime(NOW + 6 * DAY + HOUR);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      await waitFor(() => expect(authApi.refreshSession).toHaveBeenCalledTimes(1));
    });

    it('does not refresh on a visibility return well before the threshold', async () => {
      await renderSignedIn(NOW + 7 * DAY);

      vi.setSystemTime(NOW + DAY);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(authApi.refreshSession).not.toHaveBeenCalled();
    });

    it('signs the user out when the refresh fails', async () => {
      vi.mocked(authApi.refreshSession).mockRejectedValue(new Error('Session expired'));
      await renderSignedIn(NOW + 7 * DAY);

      await vi.advanceTimersByTimeAsync(6 * DAY);

      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('no'));
    });
  });
});
