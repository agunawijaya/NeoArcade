import { build, mergeConfig } from 'vite';
import { passManifestProblems } from './check-pass-manifests';
import { discoverPages } from './pages';
import { projectRoot, sharedViteConfig } from './vite-shared';

// A broken Arcade Pass manifest would only be skipped (with a warning) by
// the Hall at runtime; the build refuses it instead.
const manifestProblems = await passManifestProblems(projectRoot);
if (manifestProblems.length > 0) {
  for (const problem of manifestProblems) console.error(problem);
  process.exit(1);
}

// Each page is built on its own rather than as one multi-page build: a shared
// Rollup graph would hoist common code into dist/assets, and a game folder
// copied out of dist/ would then be missing half its code.
const pages = discoverPages(projectRoot);

for (const page of pages) {
  const started = performance.now();
  await build(
    mergeConfig(sharedViteConfig, {
      configFile: false,
      root: page.root,
      base: './',
      logLevel: 'warn',
      build: {
        outDir: page.outDir,
        // The Hall builds first and owns dist/, so it clears everything.
        emptyOutDir: true,
      },
    }),
  );
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`built ${page.name.padEnd(24)} → ${page.outDir} (${seconds}s)`);
}
