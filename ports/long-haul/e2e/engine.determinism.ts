import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { determinismTrace } from '../src/sim/fingerprint';

/**
 * The Daily Haul is the same trip for everyone only if the engine computes
 * exactly the same numbers in every browser. This bundles the determinism
 * trace (whole seeded trips, a year of Daily Hauls, career boards) and runs
 * it in each browser against Node's answer, line by line.
 *
 *   npx playwright install firefox webkit
 *   npx playwright test -c ports/long-haul --project='determinism-*'
 */
let bundle = '';

test.beforeAll(async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'long-haul-fingerprint-'));
  await build({
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: { '@shared': join(import.meta.dirname, '../../../shared') } },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: join(import.meta.dirname, '../src/sim/fingerprint.ts'),
        name: 'LongHaulEngine',
        formats: ['iife'],
        fileName: () => 'fingerprint.js',
      },
    },
  });
  bundle = readFileSync(join(outDir, 'fingerprint.js'), 'utf8');
  rmSync(outDir, { recursive: true, force: true });
});

test('every trip, daily and board comes out exactly as in Node', async ({ page, browserName }) => {
  await page.setContent('<!doctype html><title>Long Haul engine</title>');
  await page.addScriptTag({ content: bundle });
  const inBrowser = await page.evaluate(() =>
    (
      window as unknown as { LongHaulEngine: { determinismTrace(): string[] } }
    ).LongHaulEngine.determinismTrace(),
  );
  const inNode = determinismTrace();
  expect(inBrowser).toHaveLength(inNode.length);
  inNode.forEach((line, index) => {
    expect(inBrowser[index], `${browserName} disagrees with Node`).toBe(line);
  });
});
