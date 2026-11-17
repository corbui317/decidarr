import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppearanceTab from '@/components/settings/AppearanceTab';

// Mock the API
vi.mock('@/lib/api', () => ({
  userPreferencesApi: {
    get: vi.fn().mockResolvedValue({
      preferences: {
        theme: 'dark',
        defaultMediaType: 'movie',
        tvSelectionMode: 'show',
        animationStyle: 'slots',
        animationSpeed: 'normal',
        filters: {},
      },
      spinHistory: {
        enabled: true,
        retentionLimit: 50,
        storeFilterSnapshot: true,
      },
    }),
    update: vi.fn().mockResolvedValue({
      success: true,
      preferences: {
        theme: 'light',
        defaultMediaType: 'show',
        tvSelectionMode: 'show',
        animationStyle: 'slots',
        animationSpeed: 'normal',
        filters: {},
      },
    }),
  },
  spinHistoryApi: {
    clearHistory: vi.fn().mockResolvedValue({ success: true }),
  },
  settingsApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
  AnimationStyle: 'slots',
  AnimationSpeed: 'normal',
}));

// Mock ThemeContext
vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
    saveTheme: vi.fn(),
  }),
  THEME_CONFIG: {
    dark: {
      label: 'Dark',
      description: 'Sleek dark interface',
      colors: { bg: '#0f0f1a', primary: '#E5A00D', accent: '#cc7000', surface: '#1a1a2e' },
    },
    light: {
      label: 'Light',
      description: 'Clean light interface',
      colors: { bg: '#f8f8fc', primary: '#d4820a', accent: '#b86a00', surface: '#ffffff' },
    },
  },
  AppTheme: {},
}));

describe('AppearanceTab - Independent State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads its own data and saves independently', async () => {
    const user = userEvent.setup();
    const { userPreferencesApi } = await import('@/lib/api');

    // Tab should load its own data
    render(<AppearanceTab />);

    // Wait for data to load
    await waitFor(() => {
      expect(userPreferencesApi.get).toHaveBeenCalled();
    });

    // Should show the form after loading
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Preferences/i })).toBeInTheDocument();
    });

    // Change theme from dark to light
    const lightTheme = screen.getByText('Light');
    await user.click(lightTheme.closest('button')!);

    // Save changes
    const saveButton = screen.getByRole('button', { name: /Save Preferences/i });
    await user.click(saveButton);

    // Should save through API
    await waitFor(() => {
      expect(userPreferencesApi.update).toHaveBeenCalled();
    });

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/Preferences saved successfully/i)).toBeInTheDocument();
    });
  });

  it('saves independently without affecting other tabs', async () => {
    const user = userEvent.setup();
    const { userPreferencesApi, settingsApi } = await import('@/lib/api');

    render(<AppearanceTab />);

    await waitFor(() => {
      expect(userPreferencesApi.get).toHaveBeenCalled();
    });

    // Wait for form to render
    await waitFor(() => {
      expect(screen.getByLabelText(/Default Media Type/i)).toBeInTheDocument();
    });

    // Change a preference value
    const defaultMediaTypeSelect = screen.getByLabelText(/Default Media Type/i);
    await user.selectOptions(defaultMediaTypeSelect, 'show');

    // Save
    const saveButton = screen.getByRole('button', { name: /Save Preferences/i });
    await user.click(saveButton);

    // Should only update user preferences, not touch admin settings
    await waitFor(() => {
      expect(userPreferencesApi.update).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultMediaType: 'show',
        })
      );
    });

    // Should NOT call settings API (that's for admin/integrations)
    expect(settingsApi?.updateSettings).not.toHaveBeenCalled();
  });
});
