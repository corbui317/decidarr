import { vi, describe, it, expect, beforeEach } from 'vitest';
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
});
