import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone (server.js) for PM2 and Docker; no full node_modules on the server.
  output: 'standalone',
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return [
      { source: '/user/:path*', headers: noindex },
      { source: '/admin/:path*', headers: noindex },
    ];
  },
};

export default nextConfig;
