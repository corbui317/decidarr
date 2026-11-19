import { vi, describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MovieCard from '@/components/MovieCard';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAdmin: false }),
}));

vi.mock('@/lib/api', () => ({
  watchedApi: { markWatched: vi.fn(), markUnwatched: vi.fn() },
}));

const item = {
  plexId: 'plex-1',
  title: 'Inception',
  type: 'movie',
  year: 2010,
  thumbPath: '/library/metadata/1/thumb',
  artPath: '/library/metadata/1/art',
};

describe('MovieCard hero image', () => {
  it('falls back from a failed backdrop to the poster, then to the placeholder', () => {
    render(<MovieCard item={item} />);

    const backdrop = screen.getByRole('img', { name: 'Inception' });
    expect(backdrop.getAttribute('src')).toContain(encodeURIComponent('/library/metadata/1/art'));

    fireEvent.error(backdrop);
    const poster = screen.getByRole('img', { name: 'Inception' });
    expect(poster.getAttribute('src')).toContain(encodeURIComponent('/library/metadata/1/thumb'));

    fireEvent.error(poster);
    expect(screen.queryByRole('img', { name: 'Inception' })).toBeNull();
    expect(screen.getByText('🎬')).toBeTruthy();
  });
});
