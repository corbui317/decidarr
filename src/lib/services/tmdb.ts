const TMDB_BASE = 'https://api.themoviedb.org/3';

export interface TMDbMatch {
  tmdbId: number;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  voteAverage?: number;
}

export interface TMDbEnrichmentData {
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

export class TMDbService {
  private apiKey: string;
  private imageBaseUrl = 'https://image.tmdb.org/t/p';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchMovie(title: string, year?: number): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        query: title,
      });
      if (year) params.append('year', year.toString());

      const response = await fetch(`${TMDB_BASE}/search/movie?${params}`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.results || [];
    } catch {
      return [];
    }
  }

  async searchTVShow(title: string, year?: number): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        query: title,
      });
      if (year) params.append('first_air_date_year', year.toString());

      const response = await fetch(`${TMDB_BASE}/search/tv?${params}`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.results || [];
    } catch {
      return [];
    }
  }

  async getMovieDetails(tmdbId: number): Promise<any> {
    try {
      const response = await fetch(
        `${TMDB_BASE}/movie/${tmdbId}?api_key=${this.apiKey}&append_to_response=credits,keywords`
      );
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async getTVDetails(tmdbId: number): Promise<any> {
    try {
      const response = await fetch(
        `${TMDB_BASE}/tv/${tmdbId}?api_key=${this.apiKey}&append_to_response=credits,keywords`
      );
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  /**
   * Get movie certification (age rating like PG-13, R) from TMDb
   */
  async getMovieCertification(tmdbId: number, country = 'US'): Promise<string | null> {
    try {
      const response = await fetch(
        `${TMDB_BASE}/movie/${tmdbId}/release_dates?api_key=${this.apiKey}`
      );
      if (!response.ok) return null;

      const data = await response.json();
      const results = data.results || [];

      // Try to find the specified country first
      const countryData = results.find((r: any) => r.iso_3166_1 === country);
      if (countryData?.release_dates?.length > 0) {
        // Find a release with a certification
        const withCert = countryData.release_dates.find((rd: any) => rd.certification);
        if (withCert?.certification) {
          return withCert.certification;
        }
      }

      // Fallback: try other English-speaking countries
      const fallbackCountries = ['US', 'GB', 'CA', 'AU'];
      for (const fallback of fallbackCountries) {
        if (fallback === country) continue;
        const fallbackData = results.find((r: any) => r.iso_3166_1 === fallback);
        if (fallbackData?.release_dates?.length > 0) {
          const withCert = fallbackData.release_dates.find((rd: any) => rd.certification);
          if (withCert?.certification) {
            return withCert.certification;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get TV show content rating (like TV-MA, TV-14) from TMDb
   */
  async getTVContentRating(tmdbId: number, country = 'US'): Promise<string | null> {
    try {
      const response = await fetch(
        `${TMDB_BASE}/tv/${tmdbId}/content_ratings?api_key=${this.apiKey}`
      );
      if (!response.ok) return null;

      const data = await response.json();
      const results = data.results || [];

      // Try to find the specified country first
      const countryData = results.find((r: any) => r.iso_3166_1 === country);
      if (countryData?.rating) {
        return countryData.rating;
      }

      // Fallback: try other English-speaking countries
      const fallbackCountries = ['US', 'GB', 'CA', 'AU'];
      for (const fallback of fallbackCountries) {
        if (fallback === country) continue;
        const fallbackData = results.find((r: any) => r.iso_3166_1 === fallback);
        if (fallbackData?.rating) {
          return fallbackData.rating;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get full movie details including studios and rating
   */
  async getMovieFullDetails(tmdbId: number): Promise<TMDbEnrichmentData> {
    try {
      const response = await fetch(
        `${TMDB_BASE}/movie/${tmdbId}?api_key=${this.apiKey}`
      );
      if (!response.ok) return {};

      const data = await response.json();

      return {
        rating: data.vote_average,
        studios: (data.production_companies || []).map((c: any) => c.name),
      };
    } catch {
      return {};
    }
  }

  /**
   * Get full TV details including networks, studios, and rating
   */
  async getTVFullDetails(tmdbId: number): Promise<TMDbEnrichmentData> {
    try {
      const response = await fetch(
        `${TMDB_BASE}/tv/${tmdbId}?api_key=${this.apiKey}`
      );
      if (!response.ok) return {};

      const data = await response.json();

      return {
        rating: data.vote_average,
        networks: (data.networks || []).map((n: any) => n.name),
        studios: (data.production_companies || []).map((c: any) => c.name),
      };
    } catch {
      return {};
    }
  }

  /**
   * Enrich a Plex item with missing data from TMDb
   */
  async enrichPlexItem(
    title: string,
    year: number | undefined,
    type: 'movie' | 'show',
    existingData: { contentRating?: string; rating?: number; studio?: string }
  ): Promise<TMDbEnrichmentData> {
    // If all data exists, skip enrichment
    if (existingData.contentRating && existingData.rating && existingData.studio) {
      return {};
    }

    // Find the TMDb match
    const match = await this.matchPlexItem(title, year, type);
    if (!match) return {};

    const result: TMDbEnrichmentData = {};

    // Get certification/content rating if missing
    if (!existingData.contentRating) {
      const cert = type === 'movie'
        ? await this.getMovieCertification(match.tmdbId)
        : await this.getTVContentRating(match.tmdbId);
      if (cert) result.certification = cert;
    }

    // Get rating and studios/networks if missing
    if (!existingData.rating || !existingData.studio) {
      const details = type === 'movie'
        ? await this.getMovieFullDetails(match.tmdbId)
        : await this.getTVFullDetails(match.tmdbId);

      if (!existingData.rating && details.rating) {
        result.rating = details.rating;
      }

      if (!existingData.studio) {
        // For TV, prefer networks; for movies, use studios
        if (type === 'show' && details.networks?.length) {
          result.networks = details.networks;
        }
        if (details.studios?.length) {
          result.studios = details.studios;
        }
      }
    }

    return result;
  }

  async matchPlexItem(
    title: string,
    year?: number,
    type: 'movie' | 'show' = 'movie'
  ): Promise<TMDbMatch | null> {
    const results =
      type === 'movie'
        ? await this.searchMovie(title, year)
        : await this.searchTVShow(title, year);

    if (results.length === 0) return null;

    const match =
      results.find((r: any) => {
        const rTitle = (r.title || r.name || '').toLowerCase();
        const rYear = r.release_date || r.first_air_date;
        const matchYear = rYear ? parseInt(rYear.split('-')[0]) : null;

        return (
          rTitle === title.toLowerCase() &&
          (!year || !matchYear || Math.abs(year - matchYear) <= 1)
        );
      }) || results[0];

    return {
      tmdbId: match.id,
      title: match.title || match.name,
      overview: match.overview,
      posterPath: match.poster_path
        ? `${this.imageBaseUrl}/w500${match.poster_path}`
        : undefined,
      backdropPath: match.backdrop_path
        ? `${this.imageBaseUrl}/original${match.backdrop_path}`
        : undefined,
      voteAverage: match.vote_average,
    };
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
        'Netflix',
        'HBO',
        'Amazon',
        'Disney+',
        'Hulu',
        'Apple TV+',
        'Paramount+',
        'Peacock',
        'Max',
        'Showtime',
        'FX',
        'AMC',
      ],
      anime: [
        'Toei Animation',
        'MAPPA',
        'Wit Studio',
        'Bones',
        'Madhouse',
        'Studio Ghibli',
        'Ufotable',
        'A-1 Pictures',
        'Kyoto Animation',
        'Production I.G',
        'Sunrise',
        'Cloverworks',
        'Trigger',
        'Pierrot',
        'OLM',
      ],
      traditional: [
        'Warner Bros',
        'Universal',
        'Paramount',
        'Sony',
        'Columbia',
        '20th Century',
        'MGM',
        'Lionsgate',
        'A24',
        'Focus Features',
        'DreamWorks',
        'Pixar',
        'Marvel Studios',
        'DC',
        'Lucasfilm',
      ],
    };
  }
}
