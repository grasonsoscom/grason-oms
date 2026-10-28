import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC agar decorator metadata NestJS ikut ter-emit.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  ssr: { resolve: { conditions: ['source', 'module', 'node', 'development|production'] } },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
