import type { MediaType } from '@decidarr/api-contracts';
import type { ILibraryItem } from '@/lib/models/LibraryCache';

/** One library's shared item metadata and enrichment, the same for every user of the server. */
export interface StoredLibrary {
  libraryId: string;
  libraryName: string;
  mediaType: MediaType;
  items: ILibraryItem[];
  lastSyncedAt: Date;
  expiresAt: Date;
}

/** The item keys one user's own Plex view of one library contains. */
export interface VisibleSet {
  libraryId: string;
  plexIds: string[];
  lastSyncedAt: Date;
  expiresAt: Date;
}

/**
 * Where the library item store keeps its data. `server` is the Plex machine id. Only the
 * library item store uses this; the embedded adapter keeps each library's items in one
 * document, and a normalized adapter could keep one document per item behind the same seam.
 */
export interface LibraryStorage {
  readLibraries(server: string, libraryIds: string[]): Promise<StoredLibrary[]>;
  writeLibrary(server: string, library: StoredLibrary): Promise<void>;
  readVisibility(server: string, userId: string, libraryIds: string[]): Promise<VisibleSet[]>;
  writeVisibility(server: string, userId: string, visible: VisibleSet): Promise<void>;
  /** Every item key that some user other than `userId` can see in the library. */
  keysVisibleToOthers(server: string, libraryId: string, userId: string): Promise<Set<string>>;
}
