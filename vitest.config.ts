import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: '"test"',
    __BUILD_TIME__: '"test"',
  },
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
