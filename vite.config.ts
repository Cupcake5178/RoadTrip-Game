import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
  build: {
    rollupOptions: {
      output: { manualChunks: { physics: ['@dimforge/rapier3d-compat'], three: ['three'] } },
    },
  },
});
