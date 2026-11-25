import { describe, it, expect } from 'vitest';
import { TautulliService } from '@/lib/services/tautulli';
import { fakeIntegrations } from '../../../helpers/fake-integrations';

describe('TautulliService.getWatchHistoryPaged', () => {
  function historyResponse(items: Record<string, unknown>[]) {
    return Response.json({ response: { result: 'success', data: { data: items } } });
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

    const { sent } = fakeIntegrations(({ url }) =>
      historyResponse(url.searchParams.get('start') === '0' ? page1 : page2)
    );

    const service = new TautulliService('http://tautulli.local', 'key');
    const history = await service.getWatchHistoryPaged(1, 'movie', pageSize);

    expect(history).toHaveLength(3);
    expect(sent.map(({ url }) => [url.searchParams.get('cmd'), url.searchParams.get('start'), url.searchParams.get('apikey')])).toEqual([
      ['get_history', '0', 'key'],
      ['get_history', '2', 'key'],
    ]);
  });
});
