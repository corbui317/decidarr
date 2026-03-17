import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { requireAuth, validatePlexUrl, normalizeUrl } from '@/lib/auth';

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
    const { settings } = await requireAuth();

    // Get decrypted values for masking
    const plexToken = settings.getDecryptedPlexToken();
    const tmdbKey = settings.getDecryptedTmdbKey();
    const tautulliKey = settings.getDecryptedTautulliKey();

    return NextResponse.json({
      setupComplete: settings.setupComplete,
      plex: {
        serverUrl: settings.plexServerUrl || null,
        username: settings.plexUsername || null,
        machineId: settings.plexMachineId || null,
        hasToken: !!plexToken,
        tokenMasked: maskValue(plexToken || undefined),
      },
      tmdb: {
        hasKey: !!tmdbKey,
        keyMasked: maskValue(tmdbKey || undefined),
      },
      tautulli: {
        url: settings.tautulliUrl || null,
        enabled: settings.tautulliEnabled,
        hasKey: !!tautulliKey,
        keyMasked: maskValue(tautulliKey || undefined),
        syncIntervalMinutes: settings.tautulliSyncIntervalMinutes,
        lastSync: settings.tautulliLastSync || null,
      },
      syncFrequencyHours: settings.syncFrequencyHours,
      uiPreferences: settings.uiPreferences,
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

// PUT /api/settings - Update settings
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const { settings } = await requireAuth();
    const body = await request.json();

    // Update Plex settings if provided
    if (body.plex) {
      if (body.plex.token !== undefined) {
        if (body.plex.token && !body.plex.token.includes('****')) {
          settings.plexToken = body.plex.token;
        }
      }
      if (body.plex.serverUrl !== undefined && body.plex.serverUrl) {
        const urlCheck = validatePlexUrl(body.plex.serverUrl);
        if (!urlCheck.valid) {
          return NextResponse.json(
            { error: `Invalid server URL: ${urlCheck.error}` },
            { status: 400 }
          );
        }
        settings.plexServerUrl = urlCheck.normalized || body.plex.serverUrl;
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
      settings.syncFrequencyHours = Math.max(1, Math.min(168, body.syncFrequencyHours));
    }

    // Update Tautulli settings if provided
    if (body.tautulli) {
      if (body.tautulli.url !== undefined) {
        settings.tautulliUrl = body.tautulli.url ? normalizeUrl(body.tautulli.url) : undefined;
      }
      if (body.tautulli.apiKey !== undefined) {
        if (body.tautulli.apiKey && !body.tautulli.apiKey.includes('****')) {
          settings.tautulliApiKey = body.tautulli.apiKey;
        } else if (body.tautulli.apiKey === '') {
          settings.tautulliApiKey = undefined;
        }
      }
      if (body.tautulli.enabled !== undefined) {
        settings.tautulliEnabled = !!body.tautulli.enabled;
      }
      if (body.tautulli.syncIntervalMinutes !== undefined) {
        settings.tautulliSyncIntervalMinutes = Math.max(5, Math.min(1440, body.tautulli.syncIntervalMinutes));
      }
    }

    // Update UI preferences if provided
    const validThemes = ['dark', 'light', 'vegas', 'macao', 'poker'];
    if (body.uiPreferences) {
      if (body.uiPreferences.theme && validThemes.includes(body.uiPreferences.theme)) {
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
    const tautulliKey = settings.getDecryptedTautulliKey();

    return NextResponse.json({
      success: true,
      settings: {
        setupComplete: settings.setupComplete,
        plex: {
          serverUrl: settings.plexServerUrl || null,
          username: settings.plexUsername || null,
          machineId: settings.plexMachineId || null,
          hasToken: !!plexToken,
          tokenMasked: maskValue(plexToken || undefined),
        },
        tmdb: {
          hasKey: !!tmdbKey,
          keyMasked: maskValue(tmdbKey || undefined),
        },
        tautulli: {
          url: settings.tautulliUrl || null,
          enabled: settings.tautulliEnabled,
          hasKey: !!tautulliKey,
          keyMasked: maskValue(tautulliKey || undefined),
          syncIntervalMinutes: settings.tautulliSyncIntervalMinutes,
          lastSync: settings.tautulliLastSync || null,
        },
        syncFrequencyHours: settings.syncFrequencyHours,
        uiPreferences: settings.uiPreferences,
      },
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
