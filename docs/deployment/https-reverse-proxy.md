# HTTPS Reverse Proxy Deployment

This guide describes the production ingress contract for self-hosted Decidarr operators. It is deployment-neutral: use Caddy, nginx, Traefik, or another TLS-capable reverse proxy of your choice.

## Threat boundary

- Public ingress terminates TLS at the reverse proxy.
- Next.js remains bound to a private or LAN port (default container port `3000`, host `3100` via Docker Compose).
- Session cookies must be marked `Secure` on any public HTTPS origin.
- Authenticated API responses are **not** cached by the service worker. Installed Decidarr still requires network access for spins, sync, and login.

Disabling TLS or setting `SECURE_COOKIES=false` on a public origin is unsupported.

## Prerequisites

| Item | Requirement |
|------|-------------|
| Canonical origin | One operator-chosen `https://` hostname (for example `https://decidarr.example.com`) |
| TLS certificate | Valid, unexpired certificate with complete chain |
| Reverse proxy | Terminates TLS and forwards to Decidarr |
| Production env | `NODE_ENV=production` and `SECURE_COOKIES=true` (Docker Compose default) |
| Secret | `DECIDARR_SECRET` set to a high-entropy value |

Choose a single canonical origin. Accessing the same instance by raw LAN IP and by domain creates separate cookies and service-worker registrations.

## Environment variables

### Production (HTTPS behind a reverse proxy)

```env
NODE_ENV=production
SECURE_COOKIES=true
DECIDARR_SECRET=<openssl rand -hex 32>
PORT=3100
```

### Local development (HTTP only)

```env
NODE_ENV=development
SECURE_COOKIES=false
PORT=3100
```

`SECURE_COOKIES` defaults to `true` when `NODE_ENV=production` even if unset. Set it explicitly in production compose files to avoid ambiguity.

## Required proxy behavior

| Requirement | Expected behavior |
|-------------|-------------------|
| HTTP handling | Redirect `http://` to the canonical `https://` origin with `301` or `308` |
| Upstream | Forward to Decidarr on the internal port (for example `127.0.0.1:3100`) |
| Host header | Preserve the public hostname |
| Forwarded headers | Set `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-For` |
| WebSocket | Not required for current Decidarr features |
| Body size | Default proxy limits are sufficient for the web UI |

Decidarr session cookies are controlled by `SECURE_COOKIES` and production defaults in `src/lib/security/cookie-options.ts`. The app does not need to see raw TLS bytes; the proxy must advertise HTTPS via forwarded headers when operators inspect cookie behavior.

## Caddy reference configuration

```caddy
decidarr.example.com {
    encode gzip

    reverse_proxy 127.0.0.1:3100 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-For {remote_host}
    }
}
```

Caddy obtains and renews certificates automatically when the hostname resolves publicly.

## nginx header requirements

```nginx
server {
    listen 443 ssl http2;
    server_name decidarr.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name decidarr.example.com;
    return 308 https://$host$request_uri;
}
```

## Traefik header requirements

```yaml
http:
  routers:
    decidarr:
      rule: Host(`decidarr.example.com`)
      entryPoints:
        - websecure
      service: decidarr
      tls:
        certResolver: letsencrypt
  services:
    decidarr:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:3100
```

Traefik sets `X-Forwarded-*` headers automatically for routed services.

## LAN-only deployments

Operators may use a private hostname and an internal certificate authority. Requirements are unchanged:

- Use one canonical HTTPS origin for installation and sessions.
- Install the CA trust on devices that should accept the certificate without warnings.
- Do not disable secure cookies because the deployment is LAN-only.

## Certificate renewal and HTTP checks

1. Renew certificates before expiry using your proxy or ACME workflow.
2. Confirm `http://<host>` redirects to `https://<host>`.
3. Confirm browsers load the app without certificate warnings.
4. Run the automated origin probe (below).

## Production verification

### Automated origin probe

After deploying a production build to your HTTPS origin:

```bash
npm run verify:pwa -- https://decidarr.example.com
```

The probe checks:

- HTTP to HTTPS redirect (skipped for localhost)
- Root document manifest link and `theme-color`
- `/manifest.webmanifest` metadata, scope, and icons
- `/sw.js` JavaScript content type and payload
- Every manifest icon returns `200` with the declared media type

The probe is read-only. It does not authenticate, modify data, or print cookies.

### Lighthouse quality evidence

Lighthouse no longer reports a dedicated PWA category. Capture current quality categories as release evidence:

```bash
mkdir -p artifacts
npx lighthouse@12 "$DECIDARR_PRODUCTION_URL" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=html --output=json \
  --output-path=./artifacts/decidarr-lighthouse
```

Record the Lighthouse version, timestamp, commit SHA, and tested URL with the artifacts.

Targets:

- Accessibility: `>= 90`
- Best practices: `>= 90`
- Performance: recorded and trended; first production run establishes the baseline

Installability is **not** defined by Lighthouse. Verify installation separately.

### Manual install checks

| Platform | Check |
|----------|-------|
| Chrome / Edge desktop or Android | Install prompt or menu install; launch opens standalone display mode |
| iOS Safari | Add to Home Screen; launch shows expected name, icon, theme, and safe-area padding |
| Chrome DevTools → Application | Manifest has no errors; service worker is activated and controlling the page |
| Authenticated session | Cookies include `Secure`, `HttpOnly`, and intended `SameSite` after login through the proxy |

### Service-worker update smoke

1. Install the app from production.
2. Deploy a new build that changes only static assets or `CACHE_NAME` in `public/sw.js`.
3. Reload twice or restart the installed app.
4. Confirm the UI loads without stranded missing static assets.

## Release checklist

- [ ] Canonical HTTPS origin chosen and DNS or LAN trust configured
- [ ] Reverse proxy forwards required headers
- [ ] `SECURE_COOKIES=true` in production
- [ ] `npm run verify:pwa -- https://<your-origin>` passes
- [ ] Lighthouse accessibility and best-practices reports captured
- [ ] Chrome/Edge or Android install and standalone launch verified
- [ ] iOS Add to Home Screen verified on a physical device
- [ ] Login cookie attributes verified through the proxy
- [ ] Service-worker update smoke completed after a tagged release

## Rollback

Rollback by restoring the previous proxy target or container image. Do **not** roll back by disabling TLS or secure cookies.

```bash
docker compose down
git checkout <previous-tag>
docker compose up -d --build
```

Restore the previous certificate or DNS record if those changed during the failed rollout.

## Known limits

- Hosted CI cannot probe private home-server URLs. Run the origin probe from your network or a trusted runner with access.
- Automated Chromium tests are not evidence for real iOS Safari behavior.
- SVG icons may behave differently across platforms. If a browser rejects SVG install icons, add generated PNG `192`, `512`, and maskable fallbacks and update manifest tests.
