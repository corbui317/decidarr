import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings, Settings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import CryptoJS from 'crypto-js';

// Helper to mask sensitive values
const maskValue = (value: string | undefined): string | null => {
  if (!value) return null;
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
};

// GET /api/settings - Get current settings (masked sensitive values)
export async function GET() {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    // Get decrypted values for masking
    const plexToken = settings.getDecryptedPlexToken();
    const tmdbKey = settings.getDecryptedTmdbKey();

    return NextResponse.json({
      setupComplete: settings.setupComplete,
      plex: {
        serverUrl: settings.plexServerUrl || null,
        username: settings.plexUsername || null,
        hasToken: !!plexToken,
        tokenMasked: maskValue(plexToken || undefined),
      },
      tmdb: {
        hasKey: !!tmdbKey,
        keyMasked: maskValue(tmdbKey || undefined),
      },
      syncFrequencyHours: settings.syncFrequencyHours,
      uiPreferences: settings.uiPreferences,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings - Update settings
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    const body = await request.json();

    // Update Plex settings if provided
    if (body.plex) {
      if (body.plex.token !== undefined) {
        // Only update if a new token is provided (not the masked value)
        if (body.plex.token && !body.plex.token.includes('****')) {
          settings.plexToken = body.plex.token;
        }
      }
      if (body.plex.serverUrl !== undefined) {
        settings.plexServerUrl = body.plex.serverUrl;
      }
    }

    // Update TMDB settings if provided
    if (body.tmdb) {
      if (body.tmdb.apiKey !== undefined) {
        // Only update if a new key is provided (not the masked value)
        if (body.tmdb.apiKey && !body.tmdb.apiKey.includes('****')) {
          settings.tmdbApiKey = body.tmdb.apiKey;
        } else if (body.tmdb.apiKey === '') {
          settings.tmdbApiKey = undefined;
        }
      }
    }

    // Update sync frequency if provided
    if (body.syncFrequencyHours !== undefined) {
      settings.syncFrequencyHours = Math.max(1, Math.min(168, body.syncFrequencyHours)); // 1h to 1 week
    }

    // Update UI preferences if provided
    if (body.uiPreferences) {
      if (body.uiPreferences.theme) {
        settings.uiPreferences.theme = body.uiPreferences.theme;
      }
      if (body.uiPreferences.defaultMediaType) {
        settings.uiPreferences.defaultMediaType = body.uiPreferences.defaultMediaType;
      }
      if (body.uiPreferences.tvSelectionMode) {
        settings.uiPreferences.tvSelectionMode = body.uiPreferences.tvSelectionMode;
      }
    }

    await settings.save();

    // Get updated decrypted values for response
    const plexToken = settings.getDecryptedPlexToken();
    const tmdbKey = settings.getDecryptedTmdbKey();

    return NextResponse.json({
      success: true,
      settings: {
        setupComplete: settings.setupComplete,
        plex: {
          serverUrl: settings.plexServerUrl || null,
          username: settings.plexUsername || null,
          hasToken: !!plexToken,
          tokenMasked: maskValue(plexToken || undefined),
        },
        tmdb: {
          hasKey: !!tmdbKey,
          keyMasked: maskValue(tmdbKey || undefined),
        },
        syncFrequencyHours: settings.syncFrequencyHours,
        uiPreferences: settings.uiPreferences,
      },
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
