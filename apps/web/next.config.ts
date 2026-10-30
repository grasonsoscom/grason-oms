import path from 'node:path';
import type { NextConfig } from 'next';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Lingkungan uji sambung (pnpm uji) berjalan berdampingan dengan dev, jadi butuh folder build sendiri.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@grason/shared'],
  // Dashboard dan API satu origin di mata browser, jadi cookie sesi ikut terkirim.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
