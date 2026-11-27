import type { Types } from 'mongoose';
import { DomainError } from './request/errors';
import { IntegrationError } from './integrations/client';
import { User } from './models/User';
import type { ISettings } from './models/Settings';
import { fetchPlexServers } from './services/plex-oauth';
import { readPlexServerIdentity } from './services/plex';
import { createLogger } from './logger';

const logger = createLogger('PlexServerMove');

/**
 * Points the install at the Plex server answering at `serverUrl` (ADR 0002). The same server at a
 * new address keeps every token. A different server gets the Admin's access token for it, fetched
 * with their stored account token, and every token for any other server is deleted, so everyone
 * else signs in again. A failure throws before anything is written. The caller saves `settings`.
 */
export async function setPlexServer(settings: ISettings, serverUrl: string, adminId: Types.ObjectId): Promise<void> {
  const machineId = await readPlexServerIdentity(serverUrl);
  if (!machineId) {
    throw new DomainError('VALIDATION_FAILED', 'No Plex server answered at that URL');
  }
  if (machineId !== settings.plexMachineId) {
    await moveToServer(machineId, adminId);
  }
  settings.plexServerUrl = serverUrl;
  settings.plexMachineId = machineId;
}

async function moveToServer(machineId: string, adminId: Types.ObjectId): Promise<void> {
  const admin = await User.findById(adminId);
  let accountToken: string | null = null;
  try {
    accountToken = admin?.getAccountToken() ?? null;
  } catch {
    // Unreadable after a secret change: signing in again stores a fresh one.
  }
  if (!admin || !accountToken) {
    throw new DomainError('PLEX_SIGN_IN_REQUIRED');
  }

  let serverToken: string | null;
  try {
    const servers = await fetchPlexServers(accountToken);
    serverToken = servers.find((server) => server.clientIdentifier === machineId)?.accessToken ?? null;
  } catch (err) {
    if (err instanceof IntegrationError && err.status === 401) {
      throw new DomainError('PLEX_SIGN_IN_REQUIRED');
    }
    throw new DomainError('INTEGRATION_UNAVAILABLE', 'Plex.tv could not be reached, so the Plex server was not changed');
  }
  if (!serverToken) {
    throw new DomainError('VALIDATION_FAILED', 'Your Plex account has no access to the Plex server at that URL');
  }

  admin.setPlexTokens({ serverToken, accountToken, machineId });
  await admin.save();
  const removed = await User.updateMany(
    { plexServerMachineId: { $ne: machineId } },
    { $unset: { plexServerToken: 1, plexServerMachineId: 1 } }
  );
  logger.info('Moved to a different Plex server; other users must sign in again', {
    machineId,
    tokensRemoved: removed.modifiedCount,
  });
}
