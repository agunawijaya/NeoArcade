import { join } from 'node:path';
import { test, type Page } from '@playwright/test';

/**
 * The pictures in media/ (and the Hall's), at 1440 × 900 and one at phone
 * size: each a moment of a seeded flight set up by the scene lab
 * (`?lab=scene&scene=…`), which has the scripted test pilot fly there and
 * hands the flight over paused, so every run takes the same picture.
 *
 *   npx playwright test -c ports/flight-312 --project=screens media
 */
const MEDIA = join(import.meta.dirname, '../media');

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(MEDIA, `${name}.jpg`), type: 'jpeg', quality: 86 });
}

const SCENES: [scene: string, file: string][] = [
  ['takeoff', 'takeoff'],
  ['approach', 'approach'],
  ['breakout', 'breakout'],
  ['night', 'night'],
  ['dusk', 'dusk'],
  ['touchdown', 'touchdown'],
  ['cruise', 'cruise'],
  ['pedestal', 'pedestal'],
  ['overhead', 'overhead'],
  ['engineer', 'engineer'],
  ['chart', 'chart'],
  ['report', 'report'],
  ['1982', 'rules-1982'],
];

test.use({ viewport: { width: 1440, height: 900 } });

for (const [scene, file] of SCENES) {
  test(`the ${scene} scene`, async ({ page }) => {
    await page.goto(`./?lab=scene&scene=${scene}`);
    await page.waitForSelector('body[data-ready="scene"]', { timeout: 600_000 });
    await shot(page, file);
  });
}

test('the title and the briefing', async ({ page }) => {
  await page.goto('./');
  await page.waitForSelector('body[data-ready="title-screen"]');
  await shot(page, 'title');
  await page.getByRole('button', { name: /^Flight 312 / }).click();
  await page.waitForSelector('body[data-ready="briefing"]');
  await shot(page, 'briefing');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the approach in the compact panel', async ({ page }) => {
    await page.goto('./?lab=scene&scene=approach');
    await page.waitForSelector('body[data-ready="scene"]', { timeout: 600_000 });
    await shot(page, 'phone-approach');
  });
});
