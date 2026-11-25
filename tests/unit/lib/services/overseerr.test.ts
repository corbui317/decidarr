import { describe, it, expect } from 'vitest';
import { OverseerrService } from '@/lib/services/overseerr';
import { fakeIntegrations } from '../../../helpers/fake-integrations';
import multiPageFixture from '../../../fixtures/overseerr-multi-page.json';

const PAGE_SIZE = 100;

function makeMediaRecord(tmdbId: number, status = 5) {
  return { tmdbId, status, mediaType: 'movie' };
}

describe('OverseerrService.fetchAllMediaStatus', () => {
  it('uses skip offset for pages after the first', async () => {
    const pages = multiPageFixture.pages.map((page, index) => ({
      ...page,
      _page: index,
    }));

    const { sent } = fakeIntegrations(({ url }) =>
      Response.json(pages[Number(url.searchParams.get('skip') ?? 0) / PAGE_SIZE])
    );

    const service = new OverseerrService('http://overseerr.local', 'test-key');
    const index = await service.fetchAllMediaStatus();

    expect(sent.map(({ url }) => `${url.pathname} ${url.searchParams.get('skip')}`)).toEqual([
      '/api/v1/media 0',
      `/api/v1/media ${PAGE_SIZE}`,
      `/api/v1/media ${PAGE_SIZE * 2}`,
    ]);
    expect(sent.every(({ headers }) => headers.get('X-Api-Key') === 'test-key')).toBe(true);
    expect(index.totalRecords).toBe(5);
    expect(index.byKey.get('movie:101')).toBeDefined();
    expect(index.byKey.get('tv:102')).toBeDefined();
    expect(index.byKey.get('movie:250')).toBeDefined();
  });

  it('terminates when results length is below page size without pageInfo', async () => {
    const page0 = Array.from({ length: PAGE_SIZE }, (_, i) => makeMediaRecord(i + 1));
    const page1 = [makeMediaRecord(999)];

    const { sent } = fakeIntegrations(({ url }) =>
      Response.json({ results: url.searchParams.get('skip') === '0' ? page0 : page1 })
    );

    const service = new OverseerrService('http://overseerr.local', 'test-key');
    const index = await service.fetchAllMediaStatus();

    expect(sent).toHaveLength(2);
    expect(index.byKey.get('movie:999')).toBeDefined();
  });
});
