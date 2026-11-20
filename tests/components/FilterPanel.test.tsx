import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPanel from '@/components/FilterPanel';
import { DEFAULT_FILTERS } from '@/types/filters';

vi.mock('@/lib/api', () => ({
  libraryApi: {
    getGenres: vi.fn().mockResolvedValue({ genres: ['Action', 'Drama'] }),
    getYears: vi.fn().mockResolvedValue({ min: 1990, max: 2024 }),
    getFilterOptions: vi.fn().mockResolvedValue({
      contentRatings: ['PG', 'PG-13'],
      hasRatings: true,
      ratingRange: { min: 0, max: 10 },
      studios: ['Netflix'],
    }),
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    getStudios: vi.fn().mockResolvedValue({
      studios: { streaming: ['Netflix'], anime: [], traditional: [] },
    }),
  },
  selectionApi: {
    getAwardCategories: vi.fn().mockResolvedValue({ categories: [] }),
  },
}));

describe('FilterPanel', () => {
  const onFiltersChange = vi.fn();
  const dataStats = {
    itemsWithRating: 80,
    itemsWithContentRating: 70,
    itemsWithStudio: 60,
    itemsWithYear: 90,
    itemsWithGenres: 95,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openFilters() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Filters/i }));
  }

  it('renders pool count when items available', async () => {
    render(
      <FilterPanel
        libraryIds={['lib-1']}
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        poolCount={25}
        totalItems={100}
        dataStats={dataStats}
      />
    );

    await openFilters();
    expect(await screen.findByText('25')).toBeInTheDocument();
    expect(screen.getByText(/items match/i)).toBeInTheDocument();
  });

  it('shows empty pool indicator when pool count is zero', async () => {
    render(
      <FilterPanel
        libraryIds={['lib-1']}
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        poolCount={0}
        totalItems={50}
        emptyReason="No items have the selected genres: Western"
        dataStats={dataStats}
      />
    );

    await openFilters();
    expect(screen.getByText(/No items match your filters/i)).toBeInTheDocument();
    expect(screen.getByText(/Western/i)).toBeInTheDocument();
  });

  it('exposes aria-pressed on studio filter toggles', async () => {
    const user = userEvent.setup();

    render(
      <FilterPanel
        libraryIds={['lib-1']}
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        poolCount={25}
        totalItems={100}
        dataStats={dataStats}
      />
    );

    await openFilters();

    // Find the Netflix studio toggle button
    const netflixButton = await screen.findByRole('button', { name: 'Netflix' });

    // Should initially have aria-pressed="false" (not selected)
    expect(netflixButton).toHaveAttribute('aria-pressed', 'false');

    // Click to select it
    await user.click(netflixButton);

    // Should call onFiltersChange with Netflix in studios array
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        studios: ['Netflix'],
      })
    );
  });

  it('shows aria-pressed="true" when studio is selected', async () => {
    render(
      <FilterPanel
        libraryIds={['lib-1']}
        filters={{ ...DEFAULT_FILTERS, studios: ['Netflix'] }}
        onFiltersChange={onFiltersChange}
        poolCount={15}
        totalItems={100}
        dataStats={dataStats}
      />
    );

    await openFilters();

    // Find the Netflix studio toggle button
    const netflixButton = await screen.findByRole('button', { name: 'Netflix' });

    // Should have aria-pressed="true" since it's selected
    expect(netflixButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses consistent toggle behavior for genres, studios, and other array filters', async () => {
    const user = userEvent.setup();

    render(
      <FilterPanel
        libraryIds={['lib-1']}
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        poolCount={25}
        totalItems={100}
        dataStats={dataStats}
      />
    );

    await openFilters();

    // Test genre toggle: adding an item
    const actionGenre = await screen.findByRole('button', { name: 'Action' });
    await user.click(actionGenre);
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        genres: ['Action'],
      })
    );

    vi.clearAllMocks();

    // Test studio toggle: adding an item
    const netflixStudio = await screen.findByRole('button', { name: 'Netflix' });
    await user.click(netflixStudio);
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        studios: ['Netflix'],
      })
    );

    // Both should follow the same pattern:
    // If item not in array, add it; if in array, remove it
  });
});
