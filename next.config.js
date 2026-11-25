/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // next dev would otherwise rewrite AGENTS.md, which this repo maintains by hand.
  agentRules: false,
  // Dev only: E2E opens the dev server at 127.0.0.1, which Next 16 otherwise treats as cross-origin.
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
      },
    ],
  },
  outputFileTracingExcludes: {
    '*': ['tests/**'],
  },
};

module.exports = nextConfig;
