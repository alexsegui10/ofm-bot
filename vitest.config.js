import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks', // prevent fake-timer state leaking between test files
    include: ['src/**/*.test.js'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/agents/**', 'src/orchestrator.js'],
    },
  },
});
