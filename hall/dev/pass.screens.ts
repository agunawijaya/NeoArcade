import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';

/**
 * Every Arcade Pass state at three sizes, in both themes. States are set up
 * through the Pass Lab's presets, which play a profile into existence
 * through the real Pass.
 *
 * By default only the shots the docs use are written, to hall/media/pass/.
 * PASS_SHOTS=all takes every state at every size in both themes (for art
 * direction; point SCREENSHOT_DIR somewhere outside the repo), and
 * PASS_SHOTS=toast,editor takes the states whose names start with those.
 */
const outputDir = process.env.SCREENSHOT_DIR ?? 'hall/media/pass';
const selection = process.env.PASS_SHOTS;
mkdirSync(outputDir, { recursive: true });

const FOR_THE_DOCS = new Set([
  'lobby-desktop-dark',
  'pass-full-desktop-dark',
  'pass-mid-desktop-light',
  'pass-mid-phone-dark',
  'pass-legend-laptop-dark',
  'pass-fresh-laptop-light',
  'toast-badge-desktop-dark',
  'toast-rank-desktop-light',
  'toast-level-phone-dark',
  'toast-not-saving-phone-light',
  'badge-detail-desktop-dark',
  'editor-desktop-dark',
  'backup-import-desktop-light',
  'storage-blocked-laptop-dark',
]);

function wanted(shot: string, file: string): boolean {
  if (selection === 'all') return true;
  if (selection) return selection.split(',').some((prefix) => shot.startsWith(prefix));
  return FOR_THE_DOCS.has(file);
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'laptop', width: 1024, height: 768, scale: 1 },
  { name: 'phone', width: 390, height: 844, scale: 2 },
] as const;
const THEMES = ['dark', 'light'] as const;

async function preset(page: Page, name: string) {
  await page.goto(`hall/dev/pass-lab/?preset=${name}&panel=0`);
  await page.waitForURL((url) => !url.search.includes('preset='));
}

async function openPass(page: Page) {
  await page.goto('hall/#/pass');
  await page.locator('body.is-ready').waitFor();
  await page.locator('.pass:not([hidden]) .pass-hero').waitFor();
  await settle(page);
}

async function settle(page: Page, milliseconds = 1500) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(milliseconds);
}

async function lab(page: Page, query: string) {
  await page.goto(`hall/dev/pass-lab/?panel=0&hold=1&${query}`);
  await page.locator('.neo-toast').waitFor();
  await settle(page, 1200);
}

/** Each shot sets the page up and says whether to capture the whole page. */
const SHOTS: Record<string, (page: Page) => Promise<boolean>> = {
  lobby: async (page) => {
    await preset(page, 'mid');
    await page.goto('hall/');
    await page.locator('body.is-ready').waitFor();
    await settle(page, 2500);
    return false;
  },
  'pass-fresh': async (page) => {
    await openPass(page);
    return true;
  },
  'pass-mid': async (page) => {
    await preset(page, 'mid');
    await openPass(page);
    return true;
  },
  'pass-full': async (page) => {
    await preset(page, 'full');
    await openPass(page);
    return true;
  },
  'pass-legend': async (page) => {
    await preset(page, 'legend');
    await openPass(page);
    return false;
  },
  'toast-badge': async (page) => {
    await preset(page, 'mid');
    await lab(page, 'toast=gold');
    return false;
  },
  'toast-secret': async (page) => {
    await preset(page, 'almost-level');
    await lab(page, 'toast=secret');
    return false;
  },
  'toast-level': async (page) => {
    await preset(page, 'almost-level');
    await lab(page, 'toast=level');
    return false;
  },
  'toast-rank': async (page) => {
    await preset(page, 'almost-rank');
    await lab(page, 'toast=level');
    return false;
  },
  'toast-not-saving': async (page) => {
    await lab(page, 'storage=blocked&toast=queued');
    return false;
  },
  'storage-blocked': async (page) => {
    await page.addInitScript(() => {
      const refuse = () => {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      };
      Storage.prototype.getItem = refuse;
      Storage.prototype.setItem = refuse;
    });
    await openPass(page);
    return false;
  },
  'badge-detail': async (page) => {
    await preset(page, 'full');
    await openPass(page);
    await page.locator('.neo-tile[data-badge="pass-lab/champion"]').click();
    await page.locator('.neo-badge-detail[open]').waitFor();
    await settle(page, 900);
    return false;
  },
  editor: async (page) => {
    await preset(page, 'mid');
    await openPass(page);
    await page.locator('[data-pass-action="edit"]').click();
    await page.getByRole('tab', { name: 'Headwear' }).click();
    await settle(page, 900);
    return false;
  },
  'backup-export': async (page) => {
    await preset(page, 'mid');
    await openPass(page);
    await page.locator('[data-pass-action="backup"]').click();
    await settle(page, 900);
    return false;
  },
  'backup-import': async (page) => {
    await preset(page, 'full');
    await openPass(page);
    await page.locator('[data-pass-action="backup"]').click();
    const code = await page.locator('.backup__code').inputValue();
    await preset(page, 'mid');
    await openPass(page);
    await page.locator('[data-pass-action="safe-restore"]').click();
    await page.locator('.backup__code').fill(code);
    await page.getByRole('button', { name: 'Check backup' }).click();
    await page.locator('.backup__preview').waitFor();
    await settle(page, 900);
    return false;
  },
  reset: async (page) => {
    await preset(page, 'mid');
    await openPass(page);
    await page.locator('[data-pass-action="safe-reset"]').click();
    await settle(page, 900);
    return false;
  },
};

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.scale,
        hasTouch: viewport.name === 'phone',
        isMobile: viewport.name === 'phone',
        colorScheme: theme,
      });

      for (const [name, setUp] of Object.entries(SHOTS)) {
        const file = `${name}-${viewport.name}-${theme}`;
        if (!wanted(name, file)) continue;
        test(name, async ({ page }) => {
          const fullPage = await setUp(page);
          await page.screenshot({
            path: join(outputDir, `${file}.jpg`),
            fullPage,
            type: 'jpeg',
            quality: 82,
          });
        });
      }
    });
  }
}
