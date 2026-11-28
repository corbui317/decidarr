import { issueTokenPair } from '@/lib/mobile-auth/tokens';
import type { IUser } from '@/lib/models/User';
import { POST as mutationsPost } from '@/app/api/v1/sync/mutations/route';

let mutationCount = 0;

/** A well-formed sync mutation; `overrides` may hold anything, to send what a broken client would. */
export function syncMutation(overrides: Record<string, unknown>): Record<string, unknown> {
  mutationCount += 1;
  return {
    mutationId: `mutation-${mutationCount}`,
    deviceId: 'device-1',
    entityType: 'preference',
    entityId: 'entity-1',
    operation: 'upsert',
    baseRevision: null,
    clientChangedAt: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

/** POSTs mutations to /api/v1/sync/mutations as `user`, from the mobile app (bearer credential). */
export async function postSyncMutations(user: IUser, mutations: unknown[]): Promise<Response> {
  const { accessToken } = await issueTokenPair(user, 'device-1');
  return mutationsPost(
    new Request('http://localhost/api/v1/sync/mutations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ mutations }),
    })
  );
}
