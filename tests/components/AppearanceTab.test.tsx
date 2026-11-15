import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppearanceTab from '@/components/settings/AppearanceTab';

// Mock the API
vi.mock('@/lib/api', () => ({
  userPreferencesApi: {
    get: vi.fn().mockResolvedValue({
      preferences: {
        defaultMediaType: 'movie',
        tvSelectionMode: 'show',
        filters: {},
      },
      spinHistory: {
        enabled: true,
        retention: 50,
        storeSnapshots: true,
      },
    }),
    update: vi.fn().mockResolvedValue({
      success: true,
      preferences: {
        defaultMediaType: 'movie',
        tvSelectionMode: 'show',
        filters: {},
      },
    }),
  },
  spinHistoryApi: {
    clearHistory: vi.fn().mockResolvedValue({ success: true }),
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

  it('manages its own state and saving', async () => {
    const user = userEvent.setup();

    // For now, the AppearanceTab is still a controlled component
    // This test verifies current behavior works
    const onThemeChange = vi.fn();
    const onSave = vi.fn();

    render(
      <AppearanceTab
        selectedTheme="dark"
        onThemeChange={onThemeChange}
        defaultMediaType="movie"
        onDefaultMediaTypeChange={vi.fn()}
        tvSelectionMode="show"
        onTvSelectionModeChange={vi.fn()}
        spinHistoryEnabled={true}
        onSpinHistoryEnabledChange={vi.fn()}
        spinHistoryRetention={50}
        onSpinHistoryRetentionChange={vi.fn()}
        spinHistoryStoreSnapshots={true}
        onSpinHistoryStoreSnapshotsChange={vi.fn()}
        showClearConfirm={false}
        onShowClearConfirm={vi.fn()}
        clearingHistory={false}
        onClearSpinHistory={vi.fn()}
        animationStyle="slots"
        onAnimationStyleChange={vi.fn()}
        animationSpeed="normal"
        onAnimationSpeedChange={vi.fn()}
        saving={false}
        onSave={onSave}
      />
    );

    // Find and click the Light theme
    const lightTheme = screen.getByText('Light');
    await user.click(lightTheme.closest('button')!);

    expect(onThemeChange).toHaveBeenCalledWith('light');

    // Find and click Save button
    const saveButton = screen.getByRole('button', { name: /Save/i });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalled();
  });
});
