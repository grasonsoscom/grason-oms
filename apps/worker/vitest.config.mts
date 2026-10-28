import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: { resolve: { conditions: ['source', 'module', 'node', 'development|production'] } },
  test: { include: ['test/**/*.test.ts'], testTimeout: 20_000 },
});
