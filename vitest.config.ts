import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        'src/lib/auth.ts': { lines: 70 },
        'src/lib/auth-login.ts': { lines: 70 },
        'src/lib/security/**': { lines: 70 },
        'src/lib/integrations/**': { lines: 70 },
        'src/app/api/auth/**': { lines: 70 },
        'src/lib/services/overseerr.ts': { lines: 70 },
      },
      exclude: [
        'src/**/*.d.ts',
        'src/app/**/layout.tsx',
        'src/app/**/page.tsx',
      ],
    },
    testTimeout: 30000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit-api',
          include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./vitest.setup.ts', './tests/setup-db.ts', './tests/setup-integrations.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
