import { connectDB } from './db';
import { getOrCreateSettings, ISettings } from './models/Settings';

// Get the configured Plex credentials from Settings
export async function getPlexCredentials(): Promise<{
  plexToken: string | null;
  plexServerUrl: string | null;
  plexUsername: string | null;
}> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    if (!settings.setupComplete) {
      return { plexToken: null, plexServerUrl: null, plexUsername: null };
    }

    const plexToken = settings.getDecryptedPlexToken();
    return {
      plexToken,
      plexServerUrl: settings.plexServerUrl || null,
      plexUsername: settings.plexUsername || null,
    };
  } catch {
    return { plexToken: null, plexServerUrl: null, plexUsername: null };
  }
}

// Get the settings with JWT secret (for token signing if needed)
export async function getSettings(): Promise<ISettings> {
  await connectDB();
  return getOrCreateSettings();
}

// Require that the app is configured with valid Plex credentials
export async function requireAuth(): Promise<{
  plexToken: string;
  plexServerUrl: string;
  settings: ISettings;
}> {
  await connectDB();
  const settings = await getOrCreateSettings();

  if (!settings.setupComplete) {
    throw new Error('App not configured');
  }

  const plexToken = settings.getDecryptedPlexToken();
  if (!plexToken) {
    throw new Error('Plex token not configured');
  }

  if (!settings.plexServerUrl) {
    throw new Error('Plex server URL not configured');
  }

  return {
    plexToken,
    plexServerUrl: settings.plexServerUrl,
    settings,
  };
}

// Get TMDB API key from settings (if configured)
export async function getTmdbApiKey(): Promise<string | null> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return settings.getDecryptedTmdbKey();
  } catch {
    return null;
  }
}

// Get sync frequency from settings
export async function getSyncFrequencyHours(): Promise<number> {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    return settings.syncFrequencyHours;
  } catch {
    return 24; // Default to 24 hours
  }
}
