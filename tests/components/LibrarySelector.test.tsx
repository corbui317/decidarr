import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LibrarySelector from '@/components/LibrarySelector';

vi.mock('@/lib/api', () => ({
  libraryApi: {
    getSections: vi.fn().mockResolvedValue({
      sections: [
        { id: 'lib-1', title: 'Movies', type: 'movie' },
        { id: 'lib-2', title: 'TV', type: 'show' },
      ],
    }),
    getItems: vi.fn().mockResolvedValue({ items: [] }),
  },
  isAuthError: vi.fn().mockReturnValue(false),
}));

describe('LibrarySelector', () => {
  const onSelect = vi.fn();
  const onMediaTypeChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not nest interactive controls in library rows', async () => {
    render(
      <LibrarySelector
        selectedLibraries={['lib-1']}
        onSelect={onSelect}
        mediaType="movie"
        onMediaTypeChange={onMediaTypeChange}
      />
    );

    await screen.findByRole('button', { name: /Refresh Movies/i });

    const refreshButton = screen.getByRole('button', { name: /Refresh Movies/i });
    const rowGroup = refreshButton.closest('[role="group"]');
    expect(rowGroup).toBeTruthy();

    const buttonsInGroup = rowGroup?.querySelectorAll('button') ?? [];
    expect(buttonsInGroup.length).toBe(2);

    buttonsInGroup.forEach((button) => {
      expect(button.closest('button')).toBe(button);
    });
  });
});
