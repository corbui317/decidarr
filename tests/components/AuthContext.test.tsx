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
    it('sets up refresh interval before session expiry when user is authenticated', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

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
      });

      const REFRESH_BEFORE_EXPIRY_MS = 6 * 24 * 60 * 60 * 1000;
      // Check that setTimeout was called with roughly the expected interval (within 1 second)
      const refreshCalls = setTimeoutSpy.mock.calls.filter(
        call => typeof call[1] === 'number' && Math.abs(call[1] - REFRESH_BEFORE_EXPIRY_MS) < 1000
      );
      expect(refreshCalls.length).toBeGreaterThan(0);

      setTimeoutSpy.mockRestore();
    });

    it('clears user state when refresh fails, sending user to login', async () => {
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

      let refreshCallback: (() => Promise<void>) | null = null;
      const originalSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation((cb, delay) => {
        // Only capture the callback if it's a long timeout (> 1 hour)
        if (typeof delay === 'number' && delay > 60 * 60 * 1000) {
          refreshCallback = cb as () => Promise<void>;
        }
        return originalSetTimeout(cb as TimerHandler, delay);
      });

      vi.mocked(authApi.refreshSession).mockRejectedValue(new Error('Session expired'));

      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth')).toHaveTextContent('yes');
      });

      expect(refreshCallback).toBeTruthy();

      await refreshCallback!();

      await waitFor(() => {
        expect(screen.getByTestId('auth')).toHaveTextContent('no');
      });
    });

  });
});
