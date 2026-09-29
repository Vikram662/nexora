import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return [
      { source: '/user/:path*', headers: noindex },
      { source: '/admin/:path*', headers: noindex },
    ];
  },
};

export default nextConfig;
