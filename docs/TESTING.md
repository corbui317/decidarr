# Testing

## Unit and integration tests (Vitest)

```bash
npm run test           # run all tests once
npm run test:watch     # watch mode
npm run test:coverage  # coverage report (v8)
```

Run a subset:

```bash
npm run test -- tests/components/FilterPanel
```

API route tests call the handlers in-process against the test MongoDB.
`createJsonRequest` in `tests/helpers/auth.ts` sends the same-origin `Origin` header a browser sends, because cookie-authenticated writes on routes declared with `route()` (`src/lib/request/route.ts`) reject any other origin.
For a bearer client, mint a token with `issueTokenPair` from `src/lib/mobile-auth/tokens.ts` and send it as `Authorization: Bearer <token>`.

## End-to-end tests (Playwright)

```bash
npm run test:e2e
```

### Mobile viewport smoke

Automated checks at 375px and 414px widths plus PWA manifest/service-worker registration:

```bash
npm run test:e2e -- tests/e2e/mobile-viewport.spec.ts
```

Manual checklist: [docs/testing/mobile-viewport-smoke.md](./testing/mobile-viewport-smoke.md).

E2E starts a local Next.js dev server on port `3101` against an isolated MongoDB instance.
All E2E connection settings live in `tests/e2e/e2e-env.ts`, which both `playwright.config.ts` and the specs import.

### E2E MongoDB lifecycle

Playwright starts its web servers in order and before any global setup, so MongoDB is a web server too.
The first web server runs `tests/e2e/start-mongo.mjs`, an in-memory `mongodb-memory-server` instance on port `27101`.
Playwright waits for that port, then starts the app with `MONGODB_URI=mongodb://127.0.0.1:27101/decidarr-e2e`.
When the run ends, Playwright sends `SIGTERM` to the Mongo process group, which stops `mongod` and removes its data directory.

- **CI** (`CI=true`): always uses the in-memory server.
- **Local dev with `E2E_MONGODB_URI` set**: no in-memory server starts, and the app and the specs use your URI instead.
  The reset route drops that database, so point it at a throwaway database.
- **Local dev reuse**: outside CI, Playwright reuses a server already listening on `27101` or `3101`.

### E2E environment variables

| Variable | Purpose |
|----------|---------|
| `E2E_MOCK_PLEX` | When `true` outside production, Plex OAuth and API calls use mock responses (set automatically in `playwright.config.ts`). |
| `E2E_MONGODB_URI` | Optional, local runs only: use this MongoDB instead of the in-memory server. |
| `E2E_TEST_RESET_SECRET` | The value the test-only routes (`POST /api/test/reset`, `POST /api/test/restart`) require in the `X-E2E-Reset-Secret` header. Playwright defaults it to `decidarr-e2e-reset`. When it is unset on the server, both routes answer 403. |

### Legacy upgrade seed

The upgrade spec writes a pre-`DECIDARR_SECRET` install (CryptoJS ciphertext, master key derived from `MONGODB_URI`) straight into the E2E MongoDB.
It then calls `POST /api/test/restart`, which boots that data the way a restart after the upgrade would, so the secret migration runs before the next request.
The seed data comes from `tests/helpers/legacy-install-seed.ts`, which the Vitest upgrade test (`tests/api/legacy-upgrade.test.ts`) shares.
No application code imports it, and the restart route answers 404 in production.

## Lint, typecheck, and build

```bash
npm run lint
npm run typecheck
npm run build
```

`typecheck` runs `tsc --noEmit` and catches TypeScript errors without a full Next.js build.

## CI pipeline order

From `.github/workflows/test.yml`:

1. **test** job: `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test` → `npm run test:coverage` → `npm run build`
2. **e2e** job (after test passes): `npm ci` → Playwright browser install → `npm run test:e2e`
