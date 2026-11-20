import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MovieCard from '@/components/MovieCard';

const auth = vi.hoisted(() => ({ isAdmin: false }));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => auth,
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

describe('MovieCard watched toggle', () => {
  beforeEach(() => {
    auth.isAdmin = false;
  });

  it('is hidden from friends (non-admin users)', () => {
    render(<MovieCard item={item} />);
    expect(screen.queryByRole('button', { name: /Mark as (un)?watched/ })).toBeNull();
  });

  it('is shown to the admin (server owner)', () => {
    auth.isAdmin = true;
    render(<MovieCard item={item} />);
    expect(screen.getByRole('button', { name: 'Mark as watched' })).toBeTruthy();
  });
});
