import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecentSpins from '@/components/RecentSpins';

const mockList = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api', () => ({
  spinHistoryApi: {
    list: (...args: unknown[]) => mockList(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

describe('RecentSpins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      items: [
        {
          _id: 'hist-1',
          userId: 'user-1',
          plexId: 'plex-1',
          title: 'Inception',
          mediaType: 'movie',
          year: 2010,
          libraryIds: ['lib-1'],
          filtersSnapshot: { genres: ['Action'] },
          spunAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    mockDelete.mockResolvedValue({ success: true });
  });

  it('renders loaded spin history entries', async () => {
    render(<RecentSpins />);
    expect(await screen.findByText('Inception')).toBeInTheDocument();
    expect(screen.getByText(/2010/)).toBeInTheDocument();
  });

  it('calls onReapply when Filters is clicked', async () => {
    const onReapply = vi.fn();
    const user = userEvent.setup();
    render(<RecentSpins onReapply={onReapply} />);

    const filtersButton = await screen.findByRole('button', { name: 'Filters' });
    await user.click(filtersButton);

    expect(onReapply).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Inception', plexId: 'plex-1' })
    );
  });

  it('removes an entry after delete', async () => {
    const user = userEvent.setup();
    render(<RecentSpins />);

    await screen.findByText('Inception');
    await user.click(screen.getByRole('button', { name: /Remove Inception from history/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('hist-1');
      expect(screen.queryByText('Inception')).not.toBeInTheDocument();
    });
  });
});
