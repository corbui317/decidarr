import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { authenticateTestSession, clearTestCookies, seedConfiguredSettings } from '../helpers/auth';
import { fakeIntegrations, redirectTo, sequenceLookup } from '../helpers/fake-integrations';
import { POST as overseerrTestPost } from '@/app/api/overseerr/test/route';
import { GET as plexImageGet } from '@/app/api/plex/image/route';
import { IntegrationError } from '@/lib/integrations/client';
import { OverseerrService } from '@/lib/services/overseerr';
import { PlexService } from '@/lib/services/plex';
import { fetchPlexUser } from '@/lib/services/plex-oauth';
import { TautulliService } from '@/lib/services/tautulli';
import { TMDbService } from '@/lib/services/tmdb';

const PUBLIC = '93.184.216.34';

function overseerrTestRequest(url: string): NextRequest {
  return new NextRequest('http://localhost/api/overseerr/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify({ url, apiKey: 'overseerr-secret-key' }),
  });
}

function imageRequest(): NextRequest {
  return new NextRequest('http://localhost/api/plex/image?path=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F2');
}

describe('Integration URL policy at request time', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
  });

  it('refuses a hostname that resolves to a blocked address at request time, after passing the save-time check', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();
    // The save-time check sees a public address; at connect time the same host answers cloud metadata.
    const lookup = sequenceLookup([PUBLIC], ['169.254.169.254']);
    const { sent } = fakeIntegrations(() => Response.json({ version: '1.0.0' }), lookup);

    const res = await overseerrTestPost(overseerrTestRequest('http://overseerr.rebind.example'));
    const body = await res.json();

    expect(lookup.calls).toEqual(['overseerr.rebind.example', 'overseerr.rebind.example']);
    expect(body.success).toBe(false);
    expect(sent).toEqual([]);
  });

  it('refuses a Plex server hostname that now resolves to cloud metadata, without sending the Plex token', async () => {
    await seedConfiguredSettings({ plexServerUrl: 'http://plex.rebind.example:32400' });
    await authenticateTestSession();
    const { sent } = fakeIntegrations(() => new Response('image'), sequenceLookup(['169.254.169.254']));

    const res = await plexImageGet(imageRequest());

    expect(res.status).toBe(502);
    expect(sent).toEqual([]);
  });

  it('connects to the address it checked', async () => {
    await seedConfiguredSettings({ plexServerUrl: 'http://plex.example:32400' });
    await authenticateTestSession();
    const lookup = sequenceLookup([PUBLIC], ['10.0.0.5']);
    const { sent } = fakeIntegrations(
      () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
      lookup
    );

    const res = await plexImageGet(imageRequest());

    expect(res.status).toBe(200);
    expect(lookup.calls).toHaveLength(1);
    expect(sent.map((r) => [r.url.host, r.address])).toEqual([['plex.example:32400', PUBLIC]]);
  });
});

describe('Integration redirects', () => {
  const EVIL = 'http://collector.evil.example';

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
  });

  /** Every integration answers with a redirect to another host. */
  function redirectEverything() {
    return fakeIntegrations(({ url }) => redirectTo(`${EVIL}${url.pathname}${url.search}`));
  }

  function expectNothingSentTo(sent: { url: URL }[], host: string) {
    expect(sent).toHaveLength(1);
    expect(sent.filter((r) => r.url.host === host)).toEqual([]);
  }

  it('reports a Plex server redirect as an integration error without following it', async () => {
    const { sent } = redirectEverything();

    const error = await new PlexService('plex-secret-token', 'http://plex.example:32400')
      .getLibrarySections()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ integration: 'Plex', reason: 'redirect', status: 302 });
    expectNothingSentTo(sent, 'collector.evil.example');
  });

  it('reports a plex.tv redirect as an integration error without following it', async () => {
    const { sent } = redirectEverything();

    await expect(fetchPlexUser('plex-account-token')).rejects.toMatchObject({
      integration: 'plex.tv',
      reason: 'redirect',
    });
    expectNothingSentTo(sent, 'collector.evil.example');
  });

  it('reports a Tautulli redirect as a failed connection without following it', async () => {
    const { sent } = redirectEverything();

    const result = await new TautulliService('http://tautulli.example', 'tautulli-secret-key').testConnection();

    expect(result).toEqual({ success: false, error: expect.stringMatching(/redirect/) });
    expectNothingSentTo(sent, 'collector.evil.example');
  });

  it('reports an Overseerr redirect as a failed connection without following it', async () => {
    const { sent } = redirectEverything();

    const result = await new OverseerrService('http://overseerr.example', 'overseerr-secret-key').testConnection();

    expect(result).toEqual({ success: false, error: expect.stringMatching(/redirect/) });
    expectNothingSentTo(sent, 'collector.evil.example');
  });

  it('reports a TMDb redirect as an integration error without following it', async () => {
    const { sent } = redirectEverything();

    await expect(new TMDbService('tmdb-secret-key').testApiKey()).rejects.toMatchObject({
      integration: 'TMDb',
      reason: 'redirect',
    });
    expectNothingSentTo(sent, 'collector.evil.example');
  });

  it('never sends X-Plex-Token or X-Api-Key to a redirect target through a route', async () => {
    await seedConfiguredSettings({ plexServerUrl: 'http://plex.example:32400' });
    await authenticateTestSession();
    const { sent } = redirectEverything();

    const image = await plexImageGet(imageRequest());
    const overseerr = await (await overseerrTestPost(overseerrTestRequest('http://overseerr.example'))).json();

    expect(image.status).toBe(502);
    expect(overseerr.success).toBe(false);
    expect(sent.map((r) => r.url.host)).toEqual(['plex.example:32400', 'overseerr.example']);
    expect(sent[0].headers.get('X-Plex-Token')).toBe('test-plex-token-abcdefghijklmnop');
    expect(sent[1].headers.get('X-Api-Key')).toBe('overseerr-secret-key');
  });
});
