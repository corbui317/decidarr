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

## End-to-end tests (Playwright)

```bash
npm run test:e2e
```

E2E starts a local Next.js dev server on port `3101` and uses an isolated MongoDB instance (see `tests/e2e/global-setup.ts`).

### E2E MongoDB lifecycle

Playwright global setup starts an in-memory MongoDB server via `mongodb-memory-server`, writes `.e2e-mongo-uri` and `.e2e-mongo-pid`, and **returns a teardown function** that calls `mongo.stop()` when the e2e run finishes. This avoids orphaned `mongod` processes.

- **CI** (`CI=true`): always uses the managed in-memory server; teardown always stops it.
- **Local dev with `E2E_MONGODB_URI` set**: setup skips the memory server so your existing Mongo instance is not touched; teardown only removes stale marker files.
- **Marker files** (`.e2e-mongo-uri`, `.e2e-mongo-pid`) are gitignored artifacts; the pid file records `{ uri, managed }` where `managed: true` means setup started the instance.

`playwright.config.ts` reads the URI from `.e2e-mongo-uri` when starting the dev server so the Next.js app connects to the correct database.

### E2E environment variables

| Variable | Purpose |
|----------|---------|
| `E2E_MOCK_PLEX` | When `true`, Plex OAuth and API calls use mock responses (set automatically in `playwright.config.ts`). |
| `E2E_MONGODB_URI` | MongoDB connection string for the e2e database. Defaults to `mongodb://127.0.0.1:27017/decidarr-e2e` if not set. |
| `E2E_TEST_RESET_SECRET` | When set, `POST /api/test/reset` requires header `X-E2E-Reset-Secret` with this value. Playwright sets a default (`decidarr-e2e-reset`) in `playwright.config.ts` for e2e runs; override via env for local runs. When unset in dev, reset remains unauthenticated (dev-only). |

### Generated artifacts

Playwright global setup may write:

- `.e2e-mongo-uri` — connection string for the in-memory MongoDB instance
- `.e2e-mongo-pid` — process id of the MongoDB memory server

These files are listed in `.gitignore` and should not be committed.

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
