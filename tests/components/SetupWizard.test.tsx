import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupWizard from '@/components/SetupWizard';

const { settingsApi, authApi } = vi.hoisted(() => ({
  settingsApi: {
    testTmdb: vi.fn(),
    setup: vi.fn(),
  },
  authApi: {
    startPlexLogin: vi.fn(),
    pollPlexLogin: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  settingsApi,
  authApi,
  formatPlexLoginError: (err: Error) => err.message,
  setStoredSetupSecret: vi.fn(),
}));

describe('SetupWizard TMDB validation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsApi.testTmdb.mockResolvedValue({ valid: false, error: 'Invalid key' });
    settingsApi.setup.mockResolvedValue({});
  });

  async function goToTmdbStep(user: ReturnType<typeof userEvent.setup>) {
    authApi.startPlexLogin.mockResolvedValue({ authUrl: 'https://plex.tv', state: 'state-1' });
    authApi.pollPlexLogin.mockResolvedValue({
      authorized: true,
      success: true,
      user: { username: 'testuser' },
    });

    render(<SetupWizard onComplete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /sign in with plex/i }));

    await waitFor(() => {
      expect(screen.getByText(/tmdb integration/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  }

  it('shows Validate instead of Complete when TMDB key fails validation', async () => {
    const user = userEvent.setup();
    await goToTmdbStep(user);

    const input = screen.getByPlaceholderText(/enter your tmdb api key/i);
    await user.type(input, 'bad-key');
    await user.click(screen.getByRole('button', { name: /^validate$/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid key/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^validate$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete setup/i })).not.toBeInTheDocument();
  });

  it('clears polling interval on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const user = userEvent.setup();

    authApi.startPlexLogin.mockResolvedValue({ authUrl: 'https://plex.tv', state: 'state-1' });
    authApi.pollPlexLogin.mockResolvedValue({ authorized: false });

    const { unmount } = render(<SetupWizard onComplete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.click(screen.getByRole('button', { name: /sign in with plex/i }));

    await waitFor(() => {
      expect(authApi.startPlexLogin).toHaveBeenCalled();
    });

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
