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

### E2E environment variables

| Variable | Purpose |
|----------|---------|
| `E2E_MOCK_PLEX` | When `true`, Plex OAuth and API calls use mock responses (set automatically in `playwright.config.ts`). |
| `E2E_MONGODB_URI` | MongoDB connection string for the e2e database. Defaults to `mongodb://127.0.0.1:27017/decidarr-e2e` if not set. |
| `E2E_TEST_RESET_SECRET` | When set, `POST /api/test/reset` requires header `X-E2E-Reset-Secret` with this value. |

### Generated artifacts

Playwright global setup may write:

- `.e2e-mongo-uri` — connection string for the in-memory MongoDB instance
- `.e2e-mongo-pid` — process id of the MongoDB memory server

These files are listed in `.gitignore` and should not be committed.

## Lint and build

```bash
npm run lint
npm run build
```

## CI pipeline order

From `.github/workflows/test.yml`:

1. **test** job: `npm ci` → `npm run lint` → `npm run test` → `npm run test:coverage` → `npm run build`
2. **e2e** job (after test passes): `npm ci` → Playwright browser install → `npm run test:e2e`
