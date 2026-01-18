# Decidarr - Plex Movie Roulette

Can't decide what to watch? Let fate decide!

Decidarr is a movie roulette application that randomly selects movies or TV shows from your Plex libraries. Built with Next.js 14 and MongoDB.

## Features

- **Random Selection** - Spin the slot machine to pick a random movie or TV show
- **Smart Filters** - Filter by genre, year, rating, age rating, and studio/network
- **Library Sync** - Configurable sync frequency (1 hour to 1 week)
- **TMDb Integration** - Optional enhanced movie data and ratings
- **Watch Tracking** - Mark items as watched to exclude from future spins
- **Beautiful UI** - Slot machine animations with a sleek dark theme

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

2. Start the application:
   ```bash
   docker compose up -d
   ```

3. Open `http://localhost:3100` in your browser

4. Complete the setup wizard:
   - Enter your Plex token
   - Select your Plex server
   - Optionally add a TMDB API key for enhanced data

That's it! No `.env` file needed - all configuration is done through the web UI.

## Configuration

All settings are managed through the **Settings** panel (gear icon in the header):

| Setting | Description |
|---------|-------------|
| **Plex Token** | Your Plex authentication token |
| **Plex Server** | Auto-discovered or manually entered |
| **TMDB API Key** | Optional - enables enhanced movie data |
| **Sync Frequency** | How often to refresh library cache (1h - 1 week) |
| **Preferences** | Default media type, TV selection mode |

### Optional Environment Variable

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3100 | Port to expose the application |

To use a different port:
```bash
PORT=8080 docker compose up -d
```

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
- **Styling**: TailwindCSS
- **Animations**: Framer Motion
- **Containerization**: Docker

## Architecture

```
decidarr/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API Routes
│   │   │   ├── auth/        # Authentication
│   │   │   ├── library/     # Plex library endpoints
│   │   │   ├── selection/   # Random selection
│   │   │   ├── settings/    # Configuration endpoints
│   │   │   └── watched/     # Watch tracking
│   │   ├── dashboard/       # Main app page
│   │   └── page.tsx         # Setup wizard / Home
│   ├── components/          # React components
│   ├── context/             # React contexts
│   └── lib/                 # Utilities
│       ├── models/          # MongoDB models
│       └── services/        # Plex & TMDb services
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
```

## Security

- Encryption keys are auto-generated on first run
- Plex tokens and API keys are encrypted in the database
- No sensitive data stored in environment variables or config files

## License

MIT
