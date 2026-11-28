import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { DEFAULT_FILTERS } from '@decidarr/api-contracts';

const SPIN_RESPONSE = {
  selection: { plexId: '1', title: 'Inception', type: 'movie', year: 2010 },
  playLinks: null,
  stats: { totalMatches: 3 },
};

/**
 * The server records spin history when it picks, so a web spin makes exactly one request:
 * the spin itself. A second request from the page would record the spin twice.
 */
describe('useSpinFlow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(SPIN_RESPONSE), { status: 200 }))
    );
  });

  it('spins with one request and leaves recording history to the server', async () => {
    const { useSpinFlow } = await import('@/hooks/useSpinFlow');
    const onHistoryRecorded = vi.fn();
    const { result } = renderHook(() =>
      useSpinFlow({
        selectedLibraries: ['lib-1'],
        mediaType: 'movie',
        filters: DEFAULT_FILTERS,
        tvSelectionMode: 'show',
        animationStyle: 'slots',
        onHistoryRecorded,
      })
    );

    await act(() => result.current.handleSpin());

    expect(result.current.pendingResult).toEqual(SPIN_RESPONSE);
    await waitFor(() => expect(onHistoryRecorded).toHaveBeenCalledTimes(1));
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(['/api/selection/random']);
  });

  it('does not report a history entry for a spin that failed', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'No items match your filters', code: 'NO_ITEMS_MATCH_FILTERS' }), {
        status: 404,
      })
    );
    const { useSpinFlow } = await import('@/hooks/useSpinFlow');
    const onHistoryRecorded = vi.fn();
    const { result } = renderHook(() =>
      useSpinFlow({
        selectedLibraries: ['lib-1'],
        mediaType: 'movie',
        filters: DEFAULT_FILTERS,
        tvSelectionMode: 'show',
        animationStyle: 'slots',
        onHistoryRecorded,
      })
    );

    await act(() => result.current.handleSpin());

    expect(result.current.error).toBe('No items found matching your criteria');
    expect(onHistoryRecorded).not.toHaveBeenCalled();
  });
});
