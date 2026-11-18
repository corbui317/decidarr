import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TautulliService } from '@/lib/services/tautulli';

describe('TautulliService.getWatchHistoryPaged', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function historyResponse(items: Record<string, unknown>[]) {
    return {
      ok: true,
      json: async () => ({
        response: {
          result: 'success',
          data: { data: items },
        },
      }),
    };
  }

  it('pages until a short page is returned', async () => {
    const pageSize = 2;
    const page1 = [
      {
        reference_id: 1,
        rating_key: '1',
        title: 'A',
        year: 2020,
        media_type: 'movie',
        watched_status: 1,
        stopped: 100,
        user_id: 1,
        user: 'u',
      },
      {
        reference_id: 2,
        rating_key: '2',
        title: 'B',
        year: 2020,
        media_type: 'movie',
        watched_status: 1,
        stopped: 101,
        user_id: 1,
        user: 'u',
      },
    ];
    const page2 = [
      {
        reference_id: 3,
        rating_key: '3',
        title: 'C',
        year: 2020,
        media_type: 'movie',
        watched_status: 1,
        stopped: 102,
        user_id: 1,
        user: 'u',
      },
    ];

    let call = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const start = Number(new URL(url).searchParams.get('start') || '0');
      const payload = start === 0 ? page1 : page2;
      call += 1;
      return historyResponse(payload);
    });

    const service = new TautulliService('http://tautulli.local', 'key');
    const history = await service.getWatchHistoryPaged(1, 'movie', pageSize);

    expect(call).toBe(2);
    expect(history).toHaveLength(3);
    expect(fetchMock.mock.calls[0][0]).toContain('start=0');
    expect(fetchMock.mock.calls[1][0]).toContain('start=2');
  });
});
