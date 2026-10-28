import path from 'node:path';
import type { NextConfig } from 'next';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@grason/shared'],
  // Dashboard dan API satu origin di mata browser, jadi cookie sesi ikut terkirim.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
