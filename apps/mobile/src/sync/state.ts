import type { SyncClientState } from '@decidarr/api-contracts';

/** A 401 means the session or the user's Plex server token was refused; only a new sign-in helps. */
export function requiresSignIn(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 401;
}

export function canSpin(state: SyncClientState, isOnline: boolean): boolean {
  return isOnline && (state === 'ready_online' || state === 'syncing');
}

export function syncStatusLabel(
  state: SyncClientState,
  isOnline: boolean,
  lastSyncAt: string | null,
  pendingCount: number
): string {
  if (state === 'signed_out') return 'Signed out';
  if (state === 'authorizing') return 'Authorizing…';
  if (state === 'bootstrapping') return 'Loading your data…';
  if (state === 'reauth_required') return 'Session expired — sign in again';
  if (state === 'conflict') return `${pendingCount} change(s) need attention`;
  if (!isOnline) {
    return lastSyncAt
      ? `Offline — last synced ${formatRelativeTime(lastSyncAt)}`
      : 'Offline — connect to finish setup';
  }
  if (state === 'syncing') return 'Syncing…';
  if (pendingCount > 0) return `${pendingCount} change(s) pending sync`;
  return lastSyncAt ? `Synced ${formatRelativeTime(lastSyncAt)}` : 'Connected';
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
