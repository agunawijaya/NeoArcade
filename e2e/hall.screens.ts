import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Screenshots of the Hall for art direction and for hall/media/.
 * Run with `npm run screenshots`; set SCREENSHOT_DIR to write elsewhere.
 */
const outputDir = process.env.SCREENSHOT_DIR ?? 'hall/media';
mkdirSync(outputDir, { recursive: true });

const catalog = JSON.parse(readFileSync('hall/catalog.json', 'utf8')) as { slug: string }[];
const firstSlug = catalog[0]?.slug;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'laptop', width: 1024, height: 768, scale: 1 },
  { name: 'phone', width: 390, height: 844, scale: 2 },
] as const;

async function settle(page: Page, milliseconds = 1200) {
  await page.locator('body.is-ready').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(milliseconds);
}

const shoot = (page: Page, name: string, fullPage = false) =>
  // JPEG: the Hall's film grain makes PNGs several times larger for no visible gain.
  page.screenshot({ path: join(outputDir, `${name}.jpg`), fullPage, type: 'jpeg', quality: 85 });

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.scale,
      hasTouch: viewport.name === 'phone',
      isMobile: viewport.name === 'phone',
    });

    test('lobby', async ({ page }) => {
      await page.goto('./');
      await settle(page, 2500);
      await shoot(page, `lobby-${viewport.name}`);
      if (viewport.name === 'phone') await shoot(page, `lobby-${viewport.name}-full`, true);
    });

    test('card in focus', async ({ page }) => {
      test.skip(catalog.length < 2, 'A single game is shown in the spotlight, without cards.');
      await page.goto('./');
      await settle(page);
      await page.locator('.card').first().focus();
      await page.waitForTimeout(1200);
      await shoot(page, `lobby-focus-${viewport.name}`);
    });

    test('detail panel', async ({ page }) => {
      test.skip(!firstSlug, 'The catalog is empty.');
      await page.goto(`./#/games/${firstSlug}`);
      await settle(page, 1500);
      await expect(page.locator('dialog[open]')).toBeVisible();
      await shoot(page, `detail-${viewport.name}`);
    });

    test('docs', async ({ page }) => {
      test.skip(!firstSlug, 'The catalog is empty.');
      for (const doc of ['how-to-play', 'about']) {
        await page.goto(`./#/games/${firstSlug}/${doc}`);
        await settle(page, 800);
        await page.locator('.prose h1').waitFor();
        const diagrams = await page.locator('.doc-diagram').count();
        if (diagrams > 0) await page.locator('.doc-diagram--ready').first().waitFor();
        await shoot(page, `docs-${doc}-${viewport.name}`, viewport.name === 'phone');
      }
    });
  });
}

test('demo game', async ({ page }) => {
  test.skip(!catalog.some((game) => game.slug === '_demo'), 'The demo port is gone.');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('./_demo/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(outputDir, 'demo-game.jpg'), type: 'jpeg', quality: 85 });
});
