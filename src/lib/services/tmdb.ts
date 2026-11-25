import { createIntegrationClient, type IntegrationClient } from '../integrations/client';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_TIMEOUT_MS = 10_000;

export interface TMDbMatch {
  tmdbId: number;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
}

export interface TMDbEnrichmentData {
  tmdbId?: number;
  rating?: number;
  certification?: string;
  networks?: string[];
  studios?: string[];
}

export interface AwardCategory {
  id: string;
  name: string;
  icon: string;
}

// Simple rate-limited fetch wrapper for TMDb (max 40 req / 10s)
// p-limit is used to cap concurrency rather than strict rate windows.
type LimitFn = <T>(fn: () => Promise<T>) => Promise<T>;
type PLimit = (concurrency: number) => LimitFn;

let _pLimit: PLimit | null = null;
async function getLimit(): Promise<LimitFn> {
  if (!_pLimit) {
    const mod = await import('p-limit');
    _pLimit = mod.default as unknown as PLimit;
  }
  return _pLimit(5);
}

export class TMDbService {
  private client: IntegrationClient;
  private imageBaseUrl = 'https://image.tmdb.org/t/p';

  constructor(apiKey: string) {
    this.client = createIntegrationClient({
      integration: 'TMDb',
      baseUrl: TMDB_BASE,
      auth: { query: 'api_key', value: apiKey },
      timeoutMs: TMDB_TIMEOUT_MS,
    });
  }

  /** Checks the API key; returns TMDb's image base URL when it is valid. */
  async testApiKey(): Promise<{ valid: boolean; imageBaseUrl: string | null }> {
    const response = await this.client.request('/configuration');
    if (!response.ok) {
      await response.body?.cancel();
      return { valid: false, imageBaseUrl: null };
    }
    const data = await response.json();
    return { valid: true, imageBaseUrl: data.images?.secure_base_url || null };
  }

  async searchMovie(title: string, year?: number): Promise<unknown[]> {
    try {
      const query: Record<string, string | number> = { query: title };
      if (year) query.year = year;

      const response = await this.client.request('/search/movie', { query });
      if (!response.ok) return [];

      const data = await response.json();
      return data.results || [];
    } catch {
      return [];
    }
  }

  async searchTVShow(title: string, year?: number): Promise<unknown[]> {
    try {
      const query: Record<string, string | number> = { query: title };
      if (year) query.first_air_date_year = year;

      const response = await this.client.request('/search/tv', { query });
      if (!response.ok) return [];

      const data = await response.json();
      return data.results || [];
    } catch {
      return [];
    }
  }

  async getMovieDetails(tmdbId: number): Promise<unknown> {
    try {
      const response = await this.client.request(`/movie/${tmdbId}`, {
        query: { append_to_response: 'credits,keywords' },
      });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async getTVDetails(tmdbId: number): Promise<unknown> {
    try {
      const response = await this.client.request(`/tv/${tmdbId}`, {
        query: { append_to_response: 'credits,keywords' },
      });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async getMovieCertification(tmdbId: number, country = 'US'): Promise<string | null> {
    try {
      const response = await this.client.request(`/movie/${tmdbId}/release_dates`);
      if (!response.ok) return null;

      const data = await response.json();
      const results: { iso_3166_1: string; release_dates: { certification: string }[] }[] =
        data.results || [];

      const fallbackCountries = ['US', 'GB', 'CA', 'AU'];
      for (const code of [country, ...fallbackCountries]) {
        if (code !== country && code === country) continue;
        const countryData = results.find(r => r.iso_3166_1 === code);
        const withCert = countryData?.release_dates?.find(rd => rd.certification);
        if (withCert?.certification) return withCert.certification;
      }

      return null;
    } catch {
      return null;
    }
  }

  async getTVContentRating(tmdbId: number, country = 'US'): Promise<string | null> {
    try {
      const response = await this.client.request(`/tv/${tmdbId}/content_ratings`);
      if (!response.ok) return null;

      const data = await response.json();
      const results: { iso_3166_1: string; rating: string }[] = data.results || [];

      const fallbackCountries = ['US', 'GB', 'CA', 'AU'];
      for (const code of [country, ...fallbackCountries]) {
        const countryData = results.find(r => r.iso_3166_1 === code);
        if (countryData?.rating) return countryData.rating;
      }

      return null;
    } catch {
      return null;
    }
  }

  async getMovieFullDetails(tmdbId: number): Promise<TMDbEnrichmentData> {
    try {
      const response = await this.client.request(`/movie/${tmdbId}`);
      if (!response.ok) return {};

      const data = await response.json();
      return {
        rating: data.vote_average,
        studios: (data.production_companies || []).map((c: { name: string }) => c.name),
      };
    } catch {
      return {};
    }
  }

  async getTVFullDetails(tmdbId: number): Promise<TMDbEnrichmentData> {
    try {
      const response = await this.client.request(`/tv/${tmdbId}`);
      if (!response.ok) return {};

      const data = await response.json();
      return {
        rating: data.vote_average,
        networks: (data.networks || []).map((n: { name: string }) => n.name),
        studios: (data.production_companies || []).map((c: { name: string }) => c.name),
      };
    } catch {
      return {};
    }
  }

  /**
   * Enrich a Plex item with missing data from TMDb.
   * Certification and full-details calls are run in parallel where possible.
   */
  async enrichPlexItem(
    title: string,
    year: number | undefined,
    type: 'movie' | 'show',
    existingData: { contentRating?: string; rating?: number; studio?: string }
  ): Promise<TMDbEnrichmentData> {
    if (existingData.contentRating && existingData.rating && existingData.studio) {
      return {};
    }

    const match = await this.matchPlexItem(title, year, type);
    if (!match) return {};

    const needsCert = !existingData.contentRating;
    const needsDetails = !existingData.rating || !existingData.studio;

    // Run independent calls in parallel
    const [certResult, detailsResult] = await Promise.all([
      needsCert
        ? (type === 'movie'
            ? this.getMovieCertification(match.tmdbId)
            : this.getTVContentRating(match.tmdbId))
        : Promise.resolve(null),
      needsDetails
        ? (type === 'movie'
            ? this.getMovieFullDetails(match.tmdbId)
            : this.getTVFullDetails(match.tmdbId))
        : Promise.resolve<TMDbEnrichmentData>({}),
    ]);

    const result: TMDbEnrichmentData = { tmdbId: match.tmdbId };

    if (certResult) result.certification = certResult;

    const details = detailsResult as TMDbEnrichmentData;
    if (!existingData.rating && details.rating) result.rating = details.rating;
    if (!existingData.studio) {
      if (type === 'show' && details.networks?.length) result.networks = details.networks;
      if (details.studios?.length) result.studios = details.studios;
    }

    return result;
  }

  async matchPlexItem(
    title: string,
    year?: number,
    type: 'movie' | 'show' = 'movie'
  ): Promise<TMDbMatch | null> {
    const results = (
      type === 'movie'
        ? await this.searchMovie(title, year)
        : await this.searchTVShow(title, year)
    ) as Record<string, unknown>[];

    if (results.length === 0) return null;

    const match =
      results.find(r => {
        const rTitle = ((r.title || r.name || '') as string).toLowerCase();
        const rYear = (r.release_date || r.first_air_date) as string | undefined;
        const matchYear = rYear ? parseInt(rYear.split('-')[0]) : null;
        return (
          rTitle === title.toLowerCase() &&
          (!year || !matchYear || Math.abs(year - matchYear) <= 1)
        );
      }) || results[0];

    return {
      tmdbId: match.id as number,
      title: (match.title || match.name) as string,
      overview: match.overview as string | undefined,
      posterPath: match.poster_path
        ? `${this.imageBaseUrl}/w500${match.poster_path}`
        : undefined,
      backdropPath: match.backdrop_path
        ? `${this.imageBaseUrl}/original${match.backdrop_path}`
        : undefined,
      voteAverage: match.vote_average as number | undefined,
    };
  }

  /**
   * Enrich a batch of items with TMDb data, limiting concurrency to avoid
   * hitting TMDb's 40 req/10s rate limit.
   */
  async enrichBatch(
    items: { title: string; year?: number; contentRating?: string; rating?: number; studio?: string }[],
    type: 'movie' | 'show',
    concurrency = 5
  ): Promise<TMDbEnrichmentData[]> {
    const run = await getLimit();

    return Promise.all(
      items.map(item =>
        run(() =>
          this.enrichPlexItem(item.title, item.year, type, {
            contentRating: item.contentRating,
            rating: item.rating,
            studio: item.studio,
          })
        )
      )
    );
  }

  getRatingCategories(): AwardCategory[] {
    return [
      { id: 'top_rated', name: 'Top Rated (8.0+)', icon: 'star' },
      { id: 'critically_acclaimed', name: 'Highly Rated (7.5+)', icon: 'oscar' },
      { id: 'hidden_gems', name: 'Hidden Gems (6.5-8.0)', icon: 'masks' },
    ];
  }

  getPopularStudios(): { streaming: string[]; anime: string[]; traditional: string[] } {
    return {
      streaming: [
        'Netflix', 'HBO', 'Amazon', 'Disney+', 'Hulu', 'Apple TV+',
        'Paramount+', 'Peacock', 'Max', 'Showtime', 'FX', 'AMC',
      ],
      anime: [
        'Toei Animation', 'MAPPA', 'Wit Studio', 'Bones', 'Madhouse',
        'Studio Ghibli', 'Ufotable', 'A-1 Pictures', 'Kyoto Animation',
        'Production I.G', 'Sunrise', 'Cloverworks', 'Trigger', 'Pierrot', 'OLM',
      ],
      traditional: [
        'Warner Bros', 'Universal', 'Paramount', 'Sony', 'Columbia',
        '20th Century', 'MGM', 'Lionsgate', 'A24', 'Focus Features',
        'DreamWorks', 'Pixar', 'Marvel Studios', 'DC', 'Lucasfilm',
      ],
    };
  }
}
