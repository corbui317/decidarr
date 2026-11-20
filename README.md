# Decidarr - Plex Movie Roulette

Can't decide what to watch? Let fate decide!

Decidarr is a movie roulette application that randomly selects movies or TV shows from your Plex libraries. Built with Next.js 14 and MongoDB.

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
- A Plex Media Server with a valid token

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
   
   Edit `.env` and set `DECIDARR_SECRET`:
   ```bash
   # Required in production
   DECIDARR_SECRET=$(openssl rand -hex 32)
   ```

3. Start the application:
   ```bash
   docker compose up -d
   ```

4. Open `http://localhost:3100` in your browser

5. Complete the setup wizard:
   - Enter your Plex token
   - Your Plex servers will be auto-discovered (or enter manually)
   - Optionally add a TMDB API key for enhanced data

## Configuration

All settings are managed through the **Settings** panel (gear icon in the header):

### Plex Tab
| Setting | Description |
|---------|-------------|
| **Plex Token** | Your Plex authentication token |
| **Plex Server** | Auto-discovered or manually entered |

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
| `DECIDARR_SECRET` | _(none)_ | **Required in production** - High-entropy secret for JWT/encryption (generate with `openssl rand -hex 32`) |
| `DECIDARR_ALLOW_PRIVATE_URLS` | false | **LAN opt-in** - Set to `true` if your Plex/Tautulli/Overseerr are on your local network (192.168.x.x, 10.x.x.x). Private addresses are blocked by default for security. |
| `APP_URL` | _(none)_ | Public origin users open Decidarr at (for example `https://decidarr.example.com`). After Plex sign-in, Plex sends the browser back only to this origin; without it, sign-in still works but the Plex window does not return to Decidarr on its own. |
| `TRUST_PROXY` | false | Set to `true` only behind a reverse proxy that sets `X-Forwarded-For`, so sign-in rate limits are counted per client. Otherwise they are keyed by `X-Real-IP`, and clients without it share one limit. |

**Important**: If you change `DECIDARR_SECRET` after initial setup, the stored credentials can no longer be decrypted.
On the next start Decidarr logs this, generates fresh internal keys, clears the stored Plex tokens and integration keys, and signs everyone out; user accounts are kept.
To recover, sign in again with Plex as the server owner, then re-enter the TMDB, Tautulli and Overseerr settings in the Settings UI.

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

## Getting Your Plex Token

1. Sign in to Plex at https://app.plex.tv
2. Open any media item and click the three dots menu
3. Click "Get Info" then "View XML"
4. Find `X-Plex-Token=` in the URL

Or visit: https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/

## Getting a TMDB API Key (Optional)

1. Create a free account at https://www.themoviedb.org
2. Go to Settings → API
3. Request an API key (select "Developer" option)
4. Copy your API Key (v3 auth)

## Tech Stack

- **Framework**: Next.js 14 with App Router
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

```bash
# Install dependencies
npm install

# Start MongoDB (required)
docker compose up mongo -d

# Run development server
npm run dev

# Build for production
npm run build

# Type check
npx tsc --noEmit
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

- Encryption keys are auto-generated on first run
- Plex tokens, TMDB keys, and Tautulli keys are encrypted in the database
- Session-based authentication with JWT
- SSRF protection for server URLs
- No sensitive data stored in environment variables or config files

## License

MIT
