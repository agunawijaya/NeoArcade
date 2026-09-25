import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';

export const projectRoot = fileURLToPath(new URL('..', import.meta.url));

/** Settings every page build and the dev server have in common. */
export const sharedViteConfig: UserConfig = {
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    // Mermaid's lazily loaded layout engines are big by nature; the warning is noise.
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      checks: { pluginTimings: false },
    },
  },
};
