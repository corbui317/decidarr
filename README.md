# Decidarr - Plex Movie Roulette

Can't decide what to watch? Let fate decide!

Decidarr is a movie roulette application that randomly selects movies or TV shows from your Plex libraries. Built with Next.js 16, React 19 and MongoDB, on Node.js 24 LTS.

## Features

- **Random Selection** - Spin the slot machine to pick a random movie or TV show
- **Smart Filters** - Filter by genre, year, rating, age rating, studio/network, and Plex collections
- **Play Now** - Launch content directly in your Plex app with deep link support
- **Tautulli Integration** - Sync watch history per Plex user from Tautulli
- **Library Sync** - Configurable sync frequency with manual refresh option
- **TMDb Integration** - Enhanced movie data, ratings, and certifications
- **Watch Tracking** - Mark items as watched to exclude from future spins
- **Multiple Themes** - Choose from Dark, Light, Vegas Casino, Macao, or Underground Poker themes
- **Beautiful UI** - Slot machine animations with smooth transitions

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- A Plex Media Server, and the Plex account that owns it

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/corbui317/decidarr.git
   cd decidarr
   ```

2. Create a `.env` file with required settings:
   ```bash
   cp .env.example .env
   ```
   
   Generate a secret and put it in `.env` as `DECIDARR_SECRET`:
   ```bash
   openssl rand -hex 32
   ```
   ```env
   DECIDARR_SECRET=<the 64-character value printed above>
   ```
   Decidarr refuses to start in production when `DECIDARR_SECRET` is missing or shorter than 32 characters.

3. Start the application:
   ```bash
   docker compose up -d
   ```

4. Open `http://localhost:3100` in your browser

5. Complete the setup wizard:
   - Sign in with Plex as the owner of your Plex Media Server; the server is detected automatically
   - Optionally add a TMDB API key for enhanced data

## Configuration

All settings are managed through the **Settings** panel (gear icon in the header):

### Plex Tab
| Setting | Description |
|---------|-------------|
| **Server URL** | Where Decidarr reaches your Plex server; detected at setup, change it if the address moves. There is no token to enter: every user reaches the server with their own Plex sign-in. |

### TMDB Tab
| Setting | Description |
|---------|-------------|
| **TMDB API Key** | Optional - enables enhanced movie data and ratings |

### Tautulli Tab
| Setting | Description |
|---------|-------------|
| **Tautulli URL** | Your Tautulli server URL (e.g., `http://192.168.1.100:8181`) |
| **Tautulli API Key** | Found in Tautulli Settings → Web Interface → API Key |
| **Enable Sync** | Toggle to enable watch history syncing |
| **Sync Now** | Manually trigger a watch history sync |

### Sync Tab
| Setting | Description |
|---------|-------------|
| **Sync Frequency** | How often to refresh library cache (1h - 1 week) |

### Preferences Tab
| Setting | Description |
|---------|-------------|
| **Theme** | Choose from 5 visual themes |
| **Default Media Type** | Movies or TV Shows |
| **TV Selection Mode** | Pick a show or pick an episode |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3100 | Port to expose the application |
| `LOG_LEVEL` | info | Logging level: debug, info, warn, error |
| `SECURE_COOKIES` | `true` in production | Set `false` only for local HTTP development |
| `DECIDARR_SECRET` | _(none)_ | **Required in production** - High-entropy secret that session and encryption keys are derived from, at least 32 characters (generate with `openssl rand -hex 32`). Without it, or with a shorter value, the server exits at boot. |
| `DECIDARR_SETUP_SECRET` | _(none)_ | Recommended for public installs - one-time gate on first-run setup while `setupComplete` is `false` (generate with `openssl rand -hex 16`). Must be at least 16 characters or setup requests fail clearly; once setup is complete it is no longer checked. The correct secret is always accepted and never rate limited; wrong guesses are rate limited per client (or under a shared ceiling without `TRUST_PROXY`). |
| `DECIDARR_ALLOW_PRIVATE_URLS` | false | **LAN opt-in** - Set to `true` if your Plex/Tautulli/Overseerr are on your local network (192.168.x.x, 10.x.x.x, 172.16-31.x.x) or on the same host (127.0.0.1). Private addresses are blocked by default for security. |
| `APP_URL` | _(none)_ | Public origin users open Decidarr at (for example `https://decidarr.example.com`). After Plex sign-in, Plex sends the browser back only to this origin; without it, sign-in still works but the Plex window does not return to Decidarr on its own. |
| `TRUST_PROXY` | false | Set to `true` only behind a reverse proxy that sets `X-Forwarded-For` or `X-Real-IP`, so sign-in rate limits are counted per client address. A direct request's own `X-Forwarded-For`/`X-Real-IP` headers are always ignored otherwise, since it could set them to anything; OAuth polling is still counted per sign-in attempt (its PIN), but a start request has no other identity to count by, so it only has a server-wide ceiling as a backstop. Without `TRUST_PROXY`, that ceiling is shared by every source, so one source sending enough requests can use it up and block new sign-ins (and wrong setup-secret guesses) for everyone until the window ends; an already signed-in user is never signed out or blocked by this, since session-checking routes carry no rate limit at all. |

**Important**: If you change `DECIDARR_SECRET` after initial setup, or change `MONGODB_URI` on an install that has not yet started with a `DECIDARR_SECRET`, the stored credentials can no longer be decrypted.
Decidarr never wipes them: every stored value is kept exactly as it was, and everyone is signed out.
The startup log and Settings > Integrations list the credentials that need re-entering.
To get them back, restart with the previous values.
Otherwise sign in again with Plex as the server owner, re-enter the listed TMDB, Tautulli and Overseerr keys in Settings > Integrations, and ask the listed users to sign in again.
See [docs/stored-secrets.md](docs/stored-secrets.md) for how secrets are stored.

To use a different port or enable LAN access:
```bash
PORT=8080 DECIDARR_ALLOW_PRIVATE_URLS=true docker compose up -d
```

### Production HTTPS and PWA verification

For public or LAN HTTPS deployments behind a reverse proxy, see [HTTPS reverse proxy deployment](docs/deployment/https-reverse-proxy.md).

After deployment, verify installability resources:

```bash
npm run verify:pwa -- https://your-decidarr-origin.example
```

Lighthouse quality checks and physical-device install smoke tests are documented in the deployment guide release checklist.

## Filters

Decidarr supports powerful filtering to narrow down your selection pool:

- **Collections** - Filter by Plex collections (works great with Kometa-managed collections)
- **Genres** - Action, Comedy, Drama, etc.
- **Year Range** - Filter by release year
- **Age Rating** - PG, PG-13, R, TV-MA, etc.
- **Score Rating** - Filter by TMDb rating or use presets (Top Rated, Hidden Gems, etc.)
- **Studios/Networks** - Filter by streaming service, anime studio, or traditional studio
- **Unwatched Only** - Exclude items you've already seen

## Play Now

When a movie or show is selected, click the **Play** button to launch it directly in your Plex app. Decidarr uses Plex deep links (`plex://`) to open the native app, with a fallback to Plex Web if the app isn't available.

## Getting a TMDB API Key (Optional)

1. Create a free account at https://www.themoviedb.org
2. Go to Settings → API
3. Request an API key (select "Developer" option)
4. Copy your API Key (v3 auth)

## Tech Stack

- **Runtime**: Node.js 24 LTS
- **Framework**: Next.js 16 with App Router, React 19
- **Language**: TypeScript
- **Database**: MongoDB
- **Styling**: TailwindCSS with CSS Variables for theming
- **Animations**: Framer Motion
- **Containerization**: Docker

## Architecture

```
decidarr/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API Routes
│   │   │   ├── auth/        # Authentication
│   │   │   ├── library/     # Plex library & collections
│   │   │   ├── selection/   # Random selection & pool count
│   │   │   ├── settings/    # Configuration endpoints
│   │   │   ├── tautulli/    # Tautulli sync endpoints
│   │   │   └── watched/     # Watch tracking
│   │   ├── dashboard/       # Main app page
│   │   └── page.tsx         # Setup wizard / Home
│   ├── components/          # React components
│   ├── context/             # React contexts (Auth, App, Theme)
│   ├── types/               # TypeScript types
│   └── lib/                 # Utilities
│       ├── models/          # MongoDB models
│       └── services/        # Plex, TMDb, Tautulli services
├── docker-compose.yml       # Docker configuration
├── Dockerfile               # Container build
└── tailwind.config.ts       # TailwindCSS config
```

## Development

Requires Node.js 24 LTS.

```bash
# Install dependencies
npm install

# Start MongoDB (required)
docker compose up mongo -d

# Run development server
npm run dev

# Build for production
npm run build

# Lint and type check
npm run lint
npm run typecheck

# Check the production server refuses a missing or short DECIDARR_SECRET (after a build)
npm run test:boot
```

## Updating

To update an existing deployment:

```bash
cd /path/to/decidarr
git pull origin main
docker compose up -d --build
docker image prune -f  # Clean up old images
```

Your settings and watch history are stored in MongoDB and will be preserved.

## Security

- Session and encryption keys are derived from `DECIDARR_SECRET` with HKDF, one key per purpose
- Plex tokens and integration keys are encrypted in the database with AES-256-GCM, each bound to its record and field ([details](docs/stored-secrets.md))
- A credential that cannot be decrypted is kept and reported to the Admin, never wiped
- Plex sign-in uses a user's plex.tv account token once, to fetch their access token for this install's Plex server; only that per-server token is stored and sent to the server, including by the image proxy ([ADR 0002](docs/adr/0002-per-server-plex-tokens.md)). A Friend's account token is never stored; the Admin's is kept because listing Friends needs it. Upgrading exchanges previously stored account tokens the same way, and anyone whose exchange fails is asked to sign in again with their data untouched.
- Each install generates its own Plex client identifier, so no other app or page can pose as it in the Plex sign-in prompt
- Session-based authentication with JWT
- SSRF protection for every outbound request to Plex, plex.tv, Tautulli, Overseerr and TMDb:
  - each request resolves the host and checks every address when it connects, then connects only to the address it checked, so a changed DNS answer cannot redirect it;
  - link-local and cloud metadata, carrier-grade NAT (100.64.0.0/10), benchmarking (198.18.0.0/15), IPv6 unique local (fc00::/7), multicast and reserved addresses are always refused;
  - private LAN addresses (RFC 1918) and loopback are refused unless `DECIDARR_ALLOW_PRIVATE_URLS=true`;
  - redirects are never followed, so tokens and API keys are only ever sent to the configured host.
- Production refuses to start without a `DECIDARR_SECRET` of at least 32 characters
- `DECIDARR_SECRET` is the only secret kept outside the database
- Every response carries a Content-Security-Policy, `X-Content-Type-Options: nosniff`, a `frame-ancestors 'none'` policy, and a `Referrer-Policy`; HTTPS deployments also get `Strict-Transport-Security`
- The Plex image proxy only forwards responses whose content type is an allowed image type
- Docker Compose publishes on `BIND_ADDRESS` (default `0.0.0.0`, all interfaces); set `BIND_ADDRESS=127.0.0.1` in `.env` to keep Decidarr off the network, for example behind a reverse proxy on the same host

## License

MIT
