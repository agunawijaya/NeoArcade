import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { determinismTrace } from './determinism-probe';

/**
 * A Daily Skyline or a challenge link is the same for everyone only if the
 * engine computes exactly the same numbers in every browser. This bundles
 * the determinism probe (a hash of every point and event of every throw in
 * a set of seeded matches, every puzzle's solution, a year of dailies and
 * challenge links of every kind) and runs it in each browser against Node's.
 *
 *   npx playwright install firefox webkit
 *   npx playwright test -c ports/skyline-showdown --project='determinism-*'
 */
let bundle = '';

test.beforeAll(async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'skyline-fingerprint-'));
  await build({
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: { '@shared': join(import.meta.dirname, '../../../shared') } },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: join(import.meta.dirname, 'determinism-probe.ts'),
        name: 'SkylineEngine',
        formats: ['iife'],
        fileName: () => 'fingerprint.js',
      },
    },
  });
  bundle = readFileSync(join(outDir, 'fingerprint.js'), 'utf8');
  rmSync(outDir, { recursive: true, force: true });
});

test('every throw, puzzle, daily and challenge comes out exactly as in Node', async ({
  page,
  browserName,
}) => {
  await page.setContent('<!doctype html><title>Skyline Showdown engine</title>');
  await page.addScriptTag({ content: bundle });
  const inBrowser = await page.evaluate(() =>
    (
      window as unknown as { SkylineEngine: { determinismTrace(): string[] } }
    ).SkylineEngine.determinismTrace(),
  );
  const inNode = determinismTrace();
  expect(inBrowser).toHaveLength(inNode.length);
  // Compared line by line, so a failure names the first scenario and throw that differ.
  inNode.forEach((line, index) => {
    expect(inBrowser[index], `${browserName} disagrees with Node`).toBe(line);
  });
});
