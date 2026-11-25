import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // New in eslint-plugin-react-hooks 7 (Next 16). Enabling it means rewriting every fetch-on-mount effect, which is UI work outside the runtime upgrade.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    '.cache/**',
    // The Expo app was never in the web lint scope; its known hooks bug is out of scope for spec #18.
    'apps/mobile/**',
  ]),
]);
