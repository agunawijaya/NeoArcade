import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { determinismTrace } from '../src/engine/fingerprint';

/**
 * A replay, a shared seed or a flight flown again is the same flight only
 * if the engine computes exactly the same numbers in every browser. This
 * bundles the determinism trace (the weather of forty seeds and six whole
 * flights by the test pilot, from the takeoff roll to the report) and runs
 * it in each browser against Node's answer, line by line.
 *
 *   npx playwright install firefox webkit
 *   npx playwright test -c ports/flight-312 --project='determinism-*'
 */
let bundle = '';

test.beforeAll(async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'flight-312-fingerprint-'));
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
        name: 'Flight312Engine',
        formats: ['iife'],
        fileName: () => 'fingerprint.js',
      },
    },
  });
  bundle = readFileSync(join(outDir, 'fingerprint.js'), 'utf8');
  rmSync(outDir, { recursive: true, force: true });
});

test('every flight and every sky comes out exactly as in Node', async ({ page, browserName }) => {
  await page.setContent('<!doctype html><title>Flight 312 engine</title>');
  await page.addScriptTag({ content: bundle });
  const inBrowser = await page.evaluate(() =>
    (
      window as unknown as { Flight312Engine: { determinismTrace(): Promise<string[]> } }
    ).Flight312Engine.determinismTrace(),
  );
  const inNode = await determinismTrace();
  expect(inBrowser).toHaveLength(inNode.length);
  inNode.forEach((line, index) => {
    expect(inBrowser[index], `${browserName} disagrees with Node`).toBe(line);
  });
});
