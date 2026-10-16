import { fileURLToPath } from 'node:url';
import { build, mergeConfig } from 'vite';
import { sharedViteConfig } from '../../../scripts/vite-shared';

/**
 * Builds Mind the Ox on its own, exactly as `npm run build` builds it into
 * dist/, so the browser tests can run against the production page even
 * while another port's work in progress keeps the full build from passing.
 * The page goes to node_modules/.cache/, out of the way of git, the linter
 * and the full build.
 *
 *   npx tsx ports/mind-the-ox/dev/build-page.ts
 */
await build(
  mergeConfig(sharedViteConfig, {
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    base: './',
    logLevel: 'warn',
    build: {
      outDir: fileURLToPath(
        new URL('../../../node_modules/.cache/mind-the-ox-page/mind-the-ox', import.meta.url),
      ),
      emptyOutDir: true,
    },
  }),
);
