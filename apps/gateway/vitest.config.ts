import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'gateway',
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 25_000,
    hookTimeout: 25_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
