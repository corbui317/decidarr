import { describe, it, expectTypeOf } from 'vitest';
import type {
  AuthUser,
  LibraryStudiosResponse,
  PlayLinks,
  SanitizedLibraryItem,
  SettingsResponse,
  SpinHistoryEntryResponse,
  SyncBootstrapResponse,
  SyncMutationBatchResponse,
} from '@decidarr/api-contracts';
import type { Json } from '@/lib/request/reply';
import type { settingsResponseBody } from '@/lib/routes/settings-response';
import type { toSpinHistoryEntryResponse } from '@/lib/routes/spin-history-entry';
import type { applyMutations, buildBootstrap } from '@/lib/sync/service';
import type { LoginResult } from '@/lib/auth-login';
import type { ClientSafeItem } from '@/lib/plex-image';
import type { PlexService } from '@/lib/services/plex';
import type { TMDbService } from '@/lib/services/tmdb';

/**
 * A reply body built by a helper is no fresh literal by the time it reaches reply(), so
 * reply() cannot catch a field renamed inside the helper. Each helper therefore declares
 * its contract type as its return type, which makes TypeScript check its literals. These
 * checks fail typecheck if a helper's return type stops being its contract's type, for
 * example when the annotation is dropped and the inferred type drifts.
 */
describe('helpers that build replies are typed by their contracts', () => {
  it('pins each builder to its contract type', () => {
    expectTypeOf<Awaited<ReturnType<typeof settingsResponseBody>>>().toEqualTypeOf<Json<SettingsResponse>>();
    expectTypeOf<ReturnType<typeof toSpinHistoryEntryResponse>>().toEqualTypeOf<Json<SpinHistoryEntryResponse>>();
    expectTypeOf<Awaited<ReturnType<typeof buildBootstrap>>>().toEqualTypeOf<SyncBootstrapResponse>();
    expectTypeOf<Awaited<ReturnType<typeof applyMutations>>>().toEqualTypeOf<SyncMutationBatchResponse>();
    expectTypeOf<NonNullable<LoginResult['user']>>().toEqualTypeOf<AuthUser>();
    expectTypeOf<ReturnType<PlexService['buildPlayLinks']>>().toEqualTypeOf<PlayLinks>();
    expectTypeOf<ReturnType<TMDbService['getPopularStudios']>>().toEqualTypeOf<LibraryStudiosResponse['studios']>();
  });

  it('rejects a field the contract does not declare in what a builder returns', () => {
    const settings = {} as Json<SettingsResponse>;
    // @ts-expect-error -- `setupDone` is not a settings field
    const renamedSettings: Awaited<ReturnType<typeof settingsResponseBody>> = { ...settings, setupDone: true };

    const entry = {} as Json<SpinHistoryEntryResponse>;
    // @ts-expect-error -- `yr` is not a spin history field
    const renamedEntry: ReturnType<typeof toSpinHistoryEntryResponse> = { ...entry, yr: 1999 };

    expectTypeOf(renamedSettings).not.toBeAny();
    expectTypeOf(renamedEntry).not.toBeAny();
  });

  it('keeps only the item contract fields when sanitizing a library item', () => {
    type Sanitized = ClientSafeItem<{
      plexId: string;
      title: string;
      type: string;
      writers: string[];
      tmdbId: string;
      enrichedAt: Date;
      posterUrl?: string | null;
    }>;
    expectTypeOf<Sanitized>().toHaveProperty('title');
    expectTypeOf<Sanitized>().not.toHaveProperty('writers');
    expectTypeOf<Sanitized>().not.toHaveProperty('tmdbId');
    expectTypeOf<Sanitized>().not.toHaveProperty('enrichedAt');
    expectTypeOf<Sanitized['posterUrl']>().toEqualTypeOf<SanitizedLibraryItem['posterUrl']>();
  });
});
