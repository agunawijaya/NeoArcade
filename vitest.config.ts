import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedViteConfig } from './scripts/vite-shared.ts';

export default mergeConfig(
  sharedViteConfig,
  defineConfig({
    test: {
      include: ['{shared,hall,ports,scripts}/**/*.test.ts'],
      environment: 'node',
    },
  }),
);
