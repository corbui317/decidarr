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
  webpack: (config, { dev, isServer }) => {
    if (!dev && isServer) {
      const path = require('path');

      // Stub out test helpers - replaces imports with empty modules
      // Combined with inline NODE_ENV checks in the factories, this ensures
      // test-only code is fully eliminated from production builds
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(__dirname, 'tests/helpers/plex-mock-service.ts')]: false,
        [path.resolve(__dirname, 'tests/helpers/plex-oauth-mocks.ts')]: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
