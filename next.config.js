/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
      },
    ],
  },
  experimental: {
    outputFileTracingExcludes: {
      '*': ['tests/**'],
    },
  },
  webpack: (config, { dev, isServer, webpack }) => {
    if (!dev && isServer) {
      const path = require('path');

      // Stub out test helpers - replaces imports with empty modules
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(__dirname, 'tests/helpers/plex-mock-service.ts')]: false,
        [path.resolve(__dirname, 'tests/helpers/plex-oauth-mocks.ts')]: false,
      };

      // Replace isE2eMockMode() calls with false at build time
      // This allows webpack to fully eliminate the dead code branches
      config.plugins.push(
        new webpack.DefinePlugin({
          'process.env.__E2E_COMPILE_TIME_CHECK__': JSON.stringify('false'),
        })
      );
    }
    return config;
  },
};

module.exports = nextConfig;
