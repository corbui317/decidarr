import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OverseerrService } from '@/lib/services/overseerr';

const PAGE_SIZE = 100;

function makeMediaRecord(tmdbId: number, status = 5) {
  return { tmdbId, status, mediaType: 'movie' };
}

function makePage(results: ReturnType<typeof makeMediaRecord>[], page: number, totalPages: number) {
  return {
    results,
    pageInfo: { pages: totalPages },
    _page: page,
  };
}

describe('OverseerrService.fetchAllMediaStatus', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses skip offset for pages after the first', async () => {
    const page0 = Array.from({ length: PAGE_SIZE }, (_, i) => makeMediaRecord(i + 1));
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => makeMediaRecord(i + PAGE_SIZE + 1));
    const page2 = [makeMediaRecord(250)];

    const pages = [makePage(page0, 0, 3), makePage(page1, 1, 3), makePage(page2, 2, 3)];

    fetchMock.mockImplementation(async (url: string) => {
      const skipMatch = url.match(/skip=(\d+)/);
      const skip = skipMatch ? Number(skipMatch[1]) : 0;
      const pageIndex = skip / PAGE_SIZE;
      const payload = pages[pageIndex];
      return {
        ok: true,
        json: async () => payload,
      };
    });

    const service = new OverseerrService('http://overseerr.local', 'test-key');
    const index = await service.fetchAllMediaStatus();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain('skip=0');
    expect(fetchMock.mock.calls[1][0]).toContain(`skip=${PAGE_SIZE}`);
    expect(fetchMock.mock.calls[2][0]).toContain(`skip=${PAGE_SIZE * 2}`);
    expect(index.totalRecords).toBe(PAGE_SIZE * 2 + 1);
    expect(index.byKey.get('movie:101')).toBeDefined();
    expect(index.byKey.get('movie:250')).toBeDefined();
  });

  it('terminates when results length is below page size without pageInfo', async () => {
    const page0 = Array.from({ length: PAGE_SIZE }, (_, i) => makeMediaRecord(i + 1));
    const page1 = [makeMediaRecord(999)];

    let call = 0;
    fetchMock.mockImplementation(async () => {
      const payload = call === 0 ? { results: page0 } : { results: page1 };
      call += 1;
      return { ok: true, json: async () => payload };
    });

    const service = new OverseerrService('http://overseerr.local', 'test-key');
    const index = await service.fetchAllMediaStatus();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(index.byKey.get('movie:999')).toBeDefined();
  });
});
