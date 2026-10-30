import { defineConfig } from 'vitest/config';

// Package internal di-resolve ke TypeScript mentah (kondisi `source`), bukan dist/.
export default defineConfig({
  ssr: { resolve: { conditions: ['source', 'module', 'node', 'development|production'] } },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
