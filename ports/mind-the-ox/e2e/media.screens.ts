import { test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { CHAPTERS } from '../src/game/campaign';
import type { Settings } from '../src/settings';
import { advance, openGame, type OpenOptions } from './helpers';

/**
 * The screenshots in media/ for the README, the docs and the Hall: the
 * title, the campaign map, the Daily Sortie, the game in each theme and
 * view, Classic 1984 in four colours, two players and a phone. The game is
 * flown by the scripted pilot, on the fake clock, so every run takes the
 * same pictures.
 *
 *   npx playwright test -c ports/mind-the-ox --project=screens
 */
const MEDIA = fileURLToPath(new URL('../media/', import.meta.url));

/** Every chapter open, the first three with stars, as a player part way through would see it. */
const PART_WAY = {
  chapters: Object.fromEntries(
    CHAPTERS.map((chapter, index) => [
      chapter.id,
      {
        stars: [index < 6, index < 4, index < 2] as [boolean, boolean, boolean],
        bestScore: index < 6 ? 2400 - index * 150 : 0,
      },
    ]),
  ),
  hangarFound: true,
};

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${MEDIA}${name}.jpg`, type: 'jpeg', quality: 86 });
}

async function flyChapter(
  page: Page,
  chapter: string,
  settings: Partial<Settings>,
  seconds: number,
  options: OpenOptions = {},
) {
  await openGame(page, { settings, progress: PART_WAY, bot: true, ...options });
  await page.click('[data-mode="campaign"]');
  await advance(page, 200);
  await page.click(`[data-chapter="${chapter}"]`);
  await advance(page, 200);
  await page.click('[data-action="take-off"]');
  await advance(page, seconds * 1000);
}

test.describe('media', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('title', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGame(page, { progress: PART_WAY });
    await advance(page, 6000);
    await shoot(page, 'title');
  });

  test('campaign', async ({ page }) => {
    await openGame(page, { progress: PART_WAY });
    await page.click('[data-mode="campaign"]');
    await advance(page, 200);
    await page.click('[data-chapter="supply-road"]');
    await advance(page, 300);
    await shoot(page, 'campaign');
  });

  test('daily sortie', async ({ page }) => {
    await openGame(page, { light: 'dark' });
    await page.click('[data-mode="daily"]');
    await advance(page, 300);
    await shoot(page, 'daily');
  });

  test('great war, side view', async ({ page }) => {
    await flyChapter(page, 'ox-pasture', { theme: 'great-war', camera: 'side' }, 27);
    await shoot(page, 'great-war');
  });

  test('great war, diorama', async ({ page }) => {
    await flyChapter(page, 'ox-pasture', { theme: 'great-war', camera: 'diorama' }, 21);
    await shoot(page, 'diorama');
  });

  test('night raid', async ({ page }) => {
    await flyChapter(page, 'lantern-raid', { theme: 'great-war', camera: 'side' }, 24);
    await shoot(page, 'night');
  });

  test('cyan vs magenta', async ({ page }) => {
    await flyChapter(page, 'supply-road', { theme: 'cyan-magenta', camera: 'side' }, 28);
    await shoot(page, 'cyan-magenta');
  });

  test('airshow', async ({ page }) => {
    await flyChapter(page, 'westerly', { theme: 'airshow', camera: 'diorama' }, 28);
    await shoot(page, 'airshow');
  });

  test('classic 1984 in four colours', async ({ page }) => {
    await openGame(page, { settings: { cga: true }, bot: true });
    await page.click('[data-mode="classic"]');
    await advance(page, 40_000);
    await shoot(page, 'classic-cga');
  });

  test('two players', async ({ page }) => {
    await openGame(page, { settings: { twoPlayer: 'versus' } });
    await page.click('[data-mode="two-player"]');
    await advance(page, 200);
    await page.getByRole('button', { name: 'Take off' }).click();
    // Both open the throttle, roll, and pull up off their runways.
    await page.keyboard.down('KeyD');
    await page.keyboard.down('ArrowRight');
    await advance(page, 5000);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    await advance(page, 500);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ArrowUp');
    await advance(page, 1800);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('ArrowRight');
    await shoot(page, 'two-players');
  });

  test('phone', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await flyChapter(page, 'ox-pasture', { theme: 'great-war', touch: 'on' }, 22);
    await shoot(page, 'phone');
  });
});
