import { describe, it, expect } from 'vitest';
import {
  parsePreferencesPatchBody,
  parsePreferencesPutBody,
} from '@/lib/validation/preferences';

describe('parsePreferencesPatchBody', () => {
  it('rejects null body', () => {
    const result = parsePreferencesPatchBody(null);
    expect(result).toEqual({ ok: false, error: 'Request body must be a JSON object' });
  });

  it('rejects non-object body', () => {
    const result = parsePreferencesPatchBody('not an object');
    expect(result).toEqual({ ok: false, error: 'Request body must be a JSON object' });
  });

  it('rejects array body', () => {
    const result = parsePreferencesPatchBody([]);
    expect(result).toEqual({ ok: false, error: 'Request body must be a JSON object' });
  });

  it('rejects missing spinHistory', () => {
    const result = parsePreferencesPatchBody({});
    expect(result).toEqual({ ok: false, error: 'No valid preference fields provided' });
  });

  it('rejects non-object spinHistory', () => {
    const result = parsePreferencesPatchBody({ spinHistory: 'not an object' });
    expect(result).toEqual({ ok: false, error: 'No valid preference fields provided' });
  });

  it('rejects array spinHistory', () => {
    const result = parsePreferencesPatchBody({ spinHistory: [] });
    expect(result).toEqual({ ok: false, error: 'No valid preference fields provided' });
  });

  it('rejects empty spinHistory object', () => {
    const result = parsePreferencesPatchBody({ spinHistory: {} });
    expect(result).toEqual({ ok: false, error: 'No valid preference fields provided' });
  });

  it('rejects non-boolean enabled', () => {
    const result = parsePreferencesPatchBody({ spinHistory: { enabled: 'yes' } });
    expect(result).toEqual({ ok: false, error: 'spinHistory.enabled must be a boolean' });
  });

  it('rejects non-number retentionLimit', () => {
    const result = parsePreferencesPatchBody({ spinHistory: { retentionLimit: '50' } });
    expect(result).toEqual({ ok: false, error: 'spinHistory.retentionLimit must be a number' });
  });

  it('rejects NaN retentionLimit', () => {
    const result = parsePreferencesPatchBody({ spinHistory: { retentionLimit: NaN } });
    expect(result).toEqual({ ok: false, error: 'spinHistory.retentionLimit must be a number' });
  });

  it('rejects non-boolean storeFilterSnapshot', () => {
    const result = parsePreferencesPatchBody({ spinHistory: { storeFilterSnapshot: 1 } });
    expect(result).toEqual({ ok: false, error: 'spinHistory.storeFilterSnapshot must be a boolean' });
  });

  it('accepts valid enabled', () => {
    const result = parsePreferencesPatchBody({ spinHistory: { enabled: false } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.spinHistory.enabled).toBe(false);
    }
  });

  it('accepts valid retentionLimit', () => {
    const result = parsePreferencesPatchBody({ spinHistory: { retentionLimit: 100 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.spinHistory.retentionLimit).toBe(100);
    }
  });

  it('accepts valid storeFilterSnapshot', () => {
    const result = parsePreferencesPatchBody({ spinHistory: { storeFilterSnapshot: true } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.spinHistory.storeFilterSnapshot).toBe(true);
    }
  });

  it('accepts multiple valid fields', () => {
    const result = parsePreferencesPatchBody({
      spinHistory: {
        enabled: true,
        retentionLimit: 75,
        storeFilterSnapshot: false,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.spinHistory).toEqual({
        enabled: true,
        retentionLimit: 75,
        storeFilterSnapshot: false,
      });
    }
  });
});

describe('parsePreferencesPutBody', () => {
  it('rejects null body', () => {
    const result = parsePreferencesPutBody(null);
    expect(result).toEqual({ ok: false, error: 'Request body must be a JSON object' });
  });

  it('rejects non-object body', () => {
    const result = parsePreferencesPutBody(42);
    expect(result).toEqual({ ok: false, error: 'Request body must be a JSON object' });
  });

  it('rejects array body', () => {
    const result = parsePreferencesPutBody([]);
    expect(result).toEqual({ ok: false, error: 'Request body must be a JSON object' });
  });

  it('rejects empty object body', () => {
    const result = parsePreferencesPutBody({});
    expect(result).toEqual({ ok: false, error: 'No valid preference fields provided' });
  });

  describe('theme', () => {
    it('rejects invalid theme', () => {
      const result = parsePreferencesPutBody({ theme: 'invalid' });
      expect(result).toEqual({ ok: false, error: 'theme must be one of: dark, light, vegas, macao, poker' });
    });

    it('rejects non-string theme', () => {
      const result = parsePreferencesPutBody({ theme: 123 });
      expect(result).toEqual({ ok: false, error: 'theme must be one of: dark, light, vegas, macao, poker' });
    });

    it('accepts valid theme', () => {
      const result = parsePreferencesPutBody({ theme: 'dark' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.theme).toBe('dark');
      }
    });
  });

  describe('defaultMediaType', () => {
    it('rejects invalid media type', () => {
      const result = parsePreferencesPutBody({ defaultMediaType: 'invalid' });
      expect(result).toEqual({ ok: false, error: 'defaultMediaType must be either movie or show' });
    });

    it('accepts valid media type', () => {
      const result = parsePreferencesPutBody({ defaultMediaType: 'show' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.defaultMediaType).toBe('show');
      }
    });
  });

  describe('tvSelectionMode', () => {
    it('rejects invalid tv selection mode', () => {
      const result = parsePreferencesPutBody({ tvSelectionMode: 'invalid' });
      expect(result).toEqual({ ok: false, error: 'tvSelectionMode must be either show or episode' });
    });

    it('accepts valid tv selection mode', () => {
      const result = parsePreferencesPutBody({ tvSelectionMode: 'episode' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tvSelectionMode).toBe('episode');
      }
    });
  });

  describe('selectedLibraries', () => {
    it('rejects non-array', () => {
      const result = parsePreferencesPutBody({ selectedLibraries: 'lib-1' });
      expect(result).toEqual({ ok: false, error: 'selectedLibraries must be an array of strings' });
    });

    it('rejects array with non-string elements', () => {
      const result = parsePreferencesPutBody({ selectedLibraries: ['lib-1', 123] });
      expect(result).toEqual({ ok: false, error: 'selectedLibraries must be an array of strings' });
    });

    it('accepts valid library array', () => {
      const result = parsePreferencesPutBody({ selectedLibraries: ['lib-1', 'lib-2'] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.selectedLibraries).toEqual(['lib-1', 'lib-2']);
      }
    });
  });

  describe('animationStyle', () => {
    it('rejects invalid animation style', () => {
      const result = parsePreferencesPutBody({ animationStyle: 'invalid' });
      expect(result).toEqual({ ok: false, error: 'animationStyle must be one of: slots, roulette, wheel, plinko, random' });
    });

    it('accepts valid animation style', () => {
      const result = parsePreferencesPutBody({ animationStyle: 'roulette' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.animationStyle).toBe('roulette');
      }
    });
  });

  describe('animationSpeed', () => {
    it('rejects invalid animation speed', () => {
      const result = parsePreferencesPutBody({ animationSpeed: 'invalid' });
      expect(result).toEqual({ ok: false, error: 'animationSpeed must be one of: fast, normal, dramatic' });
    });

    it('accepts valid animation speed', () => {
      const result = parsePreferencesPutBody({ animationSpeed: 'dramatic' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.animationSpeed).toBe('dramatic');
      }
    });
  });

  describe('spinHistory', () => {
    it('rejects null spinHistory', () => {
      const result = parsePreferencesPutBody({ spinHistory: null });
      expect(result).toEqual({ ok: false, error: 'spinHistory must be an object' });
    });

    it('rejects non-object spinHistory', () => {
      const result = parsePreferencesPutBody({ spinHistory: 'invalid' });
      expect(result).toEqual({ ok: false, error: 'spinHistory must be an object' });
    });

    it('rejects array spinHistory', () => {
      const result = parsePreferencesPutBody({ spinHistory: [] });
      expect(result).toEqual({ ok: false, error: 'spinHistory must be an object' });
    });

    it('rejects non-boolean enabled', () => {
      const result = parsePreferencesPutBody({ spinHistory: { enabled: 'yes' } });
      expect(result).toEqual({ ok: false, error: 'spinHistory.enabled must be a boolean' });
    });

    it('rejects non-number retentionLimit', () => {
      const result = parsePreferencesPutBody({ spinHistory: { retentionLimit: 'fifty' } });
      expect(result).toEqual({ ok: false, error: 'spinHistory.retentionLimit must be a number' });
    });

    it('rejects NaN retentionLimit', () => {
      const result = parsePreferencesPutBody({ spinHistory: { retentionLimit: NaN } });
      expect(result).toEqual({ ok: false, error: 'spinHistory.retentionLimit must be a number' });
    });

    it('rejects non-boolean storeFilterSnapshot', () => {
      const result = parsePreferencesPutBody({ spinHistory: { storeFilterSnapshot: 'yes' } });
      expect(result).toEqual({ ok: false, error: 'spinHistory.storeFilterSnapshot must be a boolean' });
    });

    it('accepts empty spinHistory object', () => {
      const result = parsePreferencesPutBody({ spinHistory: {} });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.spinHistory).toEqual({});
      }
    });

    it('accepts valid spinHistory fields', () => {
      const result = parsePreferencesPutBody({
        spinHistory: {
          enabled: false,
          retentionLimit: 25,
          storeFilterSnapshot: true,
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.spinHistory).toEqual({
          enabled: false,
          retentionLimit: 25,
          storeFilterSnapshot: true,
        });
      }
    });
  });

  describe('savedFilters', () => {
    it('rejects null savedFilters', () => {
      const result = parsePreferencesPutBody({ savedFilters: null });
      expect(result).toEqual({ ok: false, error: 'savedFilters must be an object' });
    });

    it('rejects non-object savedFilters', () => {
      const result = parsePreferencesPutBody({ savedFilters: 'invalid' });
      expect(result).toEqual({ ok: false, error: 'savedFilters must be an object' });
    });

    it('rejects array savedFilters', () => {
      const result = parsePreferencesPutBody({ savedFilters: [] });
      expect(result).toEqual({ ok: false, error: 'savedFilters must be an object' });
    });

    describe('genres', () => {
      it('rejects non-array genres', () => {
        const result = parsePreferencesPutBody({ savedFilters: { genres: 'Action' } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.genres must be an array of strings' });
      });

      it('rejects genres with non-string elements', () => {
        const result = parsePreferencesPutBody({ savedFilters: { genres: ['Action', 123] } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.genres must be an array of strings' });
      });

      it('accepts valid genres', () => {
        const result = parsePreferencesPutBody({ savedFilters: { genres: ['Action', 'Drama'] } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.genres).toEqual(['Action', 'Drama']);
        }
      });
    });

    describe('studios', () => {
      it('rejects non-array studios', () => {
        const result = parsePreferencesPutBody({ savedFilters: { studios: 'Warner Bros' } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.studios must be an array of strings' });
      });

      it('rejects studios with non-string elements', () => {
        const result = parsePreferencesPutBody({ savedFilters: { studios: ['Warner Bros', null] } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.studios must be an array of strings' });
      });

      it('accepts valid studios', () => {
        const result = parsePreferencesPutBody({ savedFilters: { studios: ['Warner Bros', 'Disney'] } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.studios).toEqual(['Warner Bros', 'Disney']);
        }
      });
    });

    describe('contentRatings', () => {
      it('rejects non-array contentRatings', () => {
        const result = parsePreferencesPutBody({ savedFilters: { contentRatings: 'PG-13' } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.contentRatings must be an array of strings' });
      });

      it('rejects contentRatings with non-string elements', () => {
        const result = parsePreferencesPutBody({ savedFilters: { contentRatings: ['PG-13', false] } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.contentRatings must be an array of strings' });
      });

      it('accepts valid contentRatings', () => {
        const result = parsePreferencesPutBody({ savedFilters: { contentRatings: ['PG-13', 'R'] } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.contentRatings).toEqual(['PG-13', 'R']);
        }
      });
    });

    describe('collections', () => {
      it('rejects non-array collections', () => {
        const result = parsePreferencesPutBody({ savedFilters: { collections: 'col-1' } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.collections must be an array of strings' });
      });

      it('rejects collections with non-string elements', () => {
        const result = parsePreferencesPutBody({ savedFilters: { collections: ['col-1', 123] } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.collections must be an array of strings' });
      });

      it('accepts valid collections', () => {
        const result = parsePreferencesPutBody({ savedFilters: { collections: ['col-1', 'col-2'] } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.collections).toEqual(['col-1', 'col-2']);
        }
      });
    });

    describe('yearRange', () => {
      it('rejects null yearRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { yearRange: null } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.yearRange must be an object' });
      });

      it('rejects non-object yearRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { yearRange: '2000-2020' } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.yearRange must be an object' });
      });

      it('rejects array yearRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { yearRange: [2000, 2020] } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.yearRange must be an object' });
      });

      it('rejects non-number start', () => {
        const result = parsePreferencesPutBody({ savedFilters: { yearRange: { start: '2000' } } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.yearRange.start must be a number' });
      });

      it('rejects non-number end', () => {
        const result = parsePreferencesPutBody({ savedFilters: { yearRange: { end: '2020' } } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.yearRange.end must be a number' });
      });

      it('accepts valid yearRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { yearRange: { start: 2000, end: 2020 } } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.yearRange).toEqual({ start: 2000, end: 2020 });
        }
      });
    });

    describe('ratingRange', () => {
      it('rejects null ratingRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingRange: null } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.ratingRange must be an object' });
      });

      it('rejects non-object ratingRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingRange: '5-10' } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.ratingRange must be an object' });
      });

      it('rejects array ratingRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingRange: [5, 10] } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.ratingRange must be an object' });
      });

      it('rejects non-number min', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingRange: { min: '5' } } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.ratingRange.min must be a number' });
      });

      it('rejects non-number max', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingRange: { max: '10' } } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.ratingRange.max must be a number' });
      });

      it('accepts valid ratingRange', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingRange: { min: 5, max: 10 } } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.ratingRange).toEqual({ min: 5, max: 10 });
        }
      });
    });

    describe('ratingFilter', () => {
      it('rejects non-string non-null ratingFilter', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingFilter: 123 } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.ratingFilter must be a string or null' });
      });

      it('accepts string ratingFilter', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingFilter: 'critic' } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.ratingFilter).toBe('critic');
        }
      });

      it('accepts null ratingFilter', () => {
        const result = parsePreferencesPutBody({ savedFilters: { ratingFilter: null } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.ratingFilter).toBe(null);
        }
      });
    });

    describe('unwatchedOnly', () => {
      it('rejects non-boolean unwatchedOnly', () => {
        const result = parsePreferencesPutBody({ savedFilters: { unwatchedOnly: 'yes' } });
        expect(result).toEqual({ ok: false, error: 'savedFilters.unwatchedOnly must be a boolean' });
      });

      it('accepts boolean unwatchedOnly', () => {
        const result = parsePreferencesPutBody({ savedFilters: { unwatchedOnly: true } });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.savedFilters?.unwatchedOnly).toBe(true);
        }
      });
    });

    it('accepts empty savedFilters', () => {
      const result = parsePreferencesPutBody({ savedFilters: {} });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.savedFilters).toEqual({});
      }
    });

    it('accepts multiple valid savedFilters fields', () => {
      const result = parsePreferencesPutBody({
        savedFilters: {
          genres: ['Action', 'Sci-Fi'],
          yearRange: { start: 2000, end: 2020 },
          unwatchedOnly: true,
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.savedFilters).toEqual({
          genres: ['Action', 'Sci-Fi'],
          yearRange: { start: 2000, end: 2020 },
          unwatchedOnly: true,
        });
      }
    });
  });

  it('accepts multiple valid top-level fields', () => {
    const result = parsePreferencesPutBody({
      theme: 'dark',
      defaultMediaType: 'movie',
      selectedLibraries: ['lib-1'],
      animationStyle: 'slots',
      savedFilters: { genres: ['Action'] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.theme).toBe('dark');
      expect(result.data.defaultMediaType).toBe('movie');
      expect(result.data.selectedLibraries).toEqual(['lib-1']);
      expect(result.data.animationStyle).toBe('slots');
      expect(result.data.savedFilters?.genres).toEqual(['Action']);
    }
  });
});
