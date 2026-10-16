import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { engineFingerprint } from '../src/engine/fingerprint';

/**
 * The Daily Sortie is the same battle for everyone only if the engine
 * computes exactly the same numbers in every browser. This bundles the
 * engine's fingerprint (seeded matches flown by the scripted pilot, every
 * plane, shot, bird and target sampled, bit for bit) and runs it in each
 * browser, against Node's answer.
 *
 *   npx playwright install firefox webkit
 *   npx playwright test -c ports/mind-the-ox --project='determinism-*'
 */
let bundle = '';

test.beforeAll(async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ox-fingerprint-'));
  await build({
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: { '@shared': join(import.meta.dirname, '../../../shared') } },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: join(import.meta.dirname, '../src/engine/fingerprint.ts'),
        name: 'OxEngine',
        formats: ['iife'],
        fileName: () => 'fingerprint.js',
      },
    },
  });
  bundle = readFileSync(join(outDir, 'fingerprint.js'), 'utf8');
  rmSync(outDir, { recursive: true, force: true });
});

test('the engine flies the same battles as Node, bit for bit', async ({ page, browserName }) => {
  await page.setContent('<!doctype html><title>Mind the Ox engine</title>');
  await page.addScriptTag({ content: bundle });
  const inBrowser = await page.evaluate(() =>
    (
      window as unknown as { OxEngine: { engineFingerprint(): string } }
    ).OxEngine.engineFingerprint(),
  );
  expect(inBrowser, `${browserName} disagrees with Node`).toBe(engineFingerprint());
});
