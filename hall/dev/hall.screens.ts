import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';

/**
 * The lobby's shelves, Today and Continue playing, a category page and the
 * Origins timeline, on a fresh profile and with history, at three sizes in
 * both themes; and the forty-game fixture that proves the shelves scale.
 * Runs against the dev server, which is the only place the fixture exists:
 *
 *   npx playwright test -c hall/dev hall.screens
 *   SCREENSHOT_DIR=somewhere HALL_SHOTS=all npx playwright test -c hall/dev hall.screens
 *
 * By default only the shots the docs use are written, to hall/media/.
 * HALL_SHOTS=all takes everything; HALL_SHOTS=timeline,big takes the shots
 * whose names start with those.
 */
const outputDir = process.env.SCREENSHOT_DIR ?? 'hall/media';
const selection = process.env.HALL_SHOTS;
mkdirSync(outputDir, { recursive: true });

const FOR_THE_DOCS = new Set([
  'lobby-history-desktop-dark',
  'lobby-history-phone-light',
  'lobby-fresh-laptop-light',
  'category-desktop-light',
  'timeline-desktop-dark',
  'timeline-phone-dark',
  'timeline-laptop-light',
  'big-desktop-dark',
  'big-search-laptop-dark',
]);

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'laptop', width: 1024, height: 768, scale: 1 },
  { name: 'phone', width: 390, height: 844, scale: 2 },
] as const;
const THEMES = ['dark', 'light'] as const;

function wanted(shot: string, file: string): boolean {
  if (selection === 'all') return true;
  if (selection) return selection.split(',').some((prefix) => shot.startsWith(prefix));
  return FOR_THE_DOCS.has(file);
}

/** A player who has been around: plays in three games, a Daily Skyline done today, a Haul streak. */
function seedHistory() {
  const now = Date.now();
  const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const plays = [
    {
      game: 'skyline-showdown',
      mode: 'tour',
      item: 'tokyo',
      label: 'World Tour · Tokyo',
      at: ago(35),
    },
    {
      game: 'long-haul',
      mode: 'career',
      label: 'Career · Chicago to Denver, frozen food',
      at: ago(60 * 5),
    },
    {
      game: 'donkey-dash',
      mode: 'trip',
      item: 'farm',
      label: 'Road Trip · Farm Lanes, leg 2',
      at: ago(60 * 26),
    },
    { game: 'skyline-showdown', mode: 'daily', label: 'Daily Skyline #17', at: ago(60 * 27) },
    {
      game: 'long-haul',
      mode: 'daily',
      label: 'Daily Haul #11 · Memphis to Atlanta',
      at: ago(60 * 30),
    },
  ];
  const set = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
  set('neoarcade:last-played:history', plays);
  set('neoarcade:last-played:counts', { 'long-haul': 9, 'skyline-showdown': 6, 'donkey-dash': 2 });
  set('neoarcade:skyline-showdown:daily', {
    [day(-1)]: { outcome: 'outOfThrows', throws: 10, aims: [] },
    [day(0)]: { outcome: 'hit', throws: 3, aims: [] },
  });
  set('neoarcade:long-haul:daily', {
    [day(-3)]: { outcome: 'delivered', late: false, profitCents: 91_000, hours: 40, tickets: 0 },
    [day(-2)]: { outcome: 'delivered', late: true, profitCents: 12_000, hours: 52, tickets: 1 },
    [day(-1)]: { outcome: 'delivered', late: false, profitCents: 140_250, hours: 47, tickets: 0 },
  });
}

/** Brings a part of the page to the top of the screen, with a little air above it. */
async function scrollToTop(page: Page, selector: string) {
  await page.locator(selector).evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -28);
  });
  await page.waitForTimeout(600);
}

async function open(page: Page, path: string, theme: string, history: boolean) {
  await page.addInitScript(
    ({ theme: chosen, history: seeded, seed }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('neoarcade:hall:theme', JSON.stringify(chosen));
      if (seeded) new Function(`(${seed})()`)();
    },
    { theme, history, seed: seedHistory.toString() },
  );
  await page.goto(path);
  await page.locator('body.is-ready').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1400);
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.scale,
        hasTouch: viewport.name === 'phone',
        isMobile: viewport.name === 'phone',
      });
      const name = (shot: string) => `${shot}-${viewport.name}-${theme}`;
      const shoot = (page: Page, shot: string, fullPage = false) =>
        page.screenshot({
          path: join(outputDir, `${name(shot)}.jpg`),
          fullPage,
          type: 'jpeg',
          quality: 85,
        });

      test('lobby, fresh', async ({ page }) => {
        test.skip(!wanted('lobby-fresh', name('lobby-fresh')));
        await open(page, 'hall/', theme, false);
        await scrollToTop(page, '.today');
        await shoot(page, 'lobby-fresh');
      });

      test('lobby, with history', async ({ page }) => {
        test.skip(!wanted('lobby-history', name('lobby-history')));
        await open(page, 'hall/', theme, true);
        await scrollToTop(page, '.continue');
        await shoot(page, 'lobby-history');
        // Whole pages are for art direction only; they are too big for the docs.
        if (selection) await shoot(page, 'lobby-history-full', true);
      });

      test('a card in focus on a shelf', async ({ page }) => {
        test.skip(viewport.name === 'phone' || !wanted('shelf-focus', name('shelf-focus')));
        await open(page, 'hall/', theme, true);
        await page.locator('.shelf [data-row-item]').first().focus();
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(900);
        await shoot(page, 'shelf-focus');
      });

      test('category page', async ({ page }) => {
        test.skip(!wanted('category', name('category')));
        await open(page, 'hall/#/category/arcade', theme, true);
        await shoot(page, 'category');
      });

      test('a game opened from a category page', async ({ page }) => {
        test.skip(!wanted('category-detail', name('category-detail')));
        await open(page, 'hall/#/category/simulation', theme, true);
        await page.locator('.category-page .card').first().click();
        await page.waitForTimeout(900);
        await shoot(page, 'category-detail');
      });

      test('play history on the Pass page', async ({ page }) => {
        test.skip(!wanted('pass-history', name('pass-history')));
        await open(page, 'hall/#/pass', theme, true);
        await scrollToTop(page, '.pass-history');
        await shoot(page, 'pass-history');
      });

      test('timeline', async ({ page }) => {
        test.skip(!wanted('timeline', name('timeline')));
        await open(page, 'hall/#/timeline/long-haul', theme, false);
        await shoot(page, 'timeline');
        if (selection) await shoot(page, 'timeline-full', true);
      });

      test('forty games', async ({ page }) => {
        test.skip(!wanted('big', name('big')));
        await open(page, 'hall/?fixture=big', theme, true);
        await scrollToTop(page, '.toolbar');
        await shoot(page, 'big');
        if (selection) await shoot(page, 'big-full', true);
      });

      test('forty games, searching', async ({ page }) => {
        test.skip(!wanted('big-search', name('big-search')));
        await open(page, 'hall/?fixture=big', theme, false);
        await page.locator('.search__field').fill('an');
        await scrollToTop(page, '.toolbar');
        await shoot(page, 'big-search');
      });

      test('forty games on the timeline', async ({ page }) => {
        test.skip(!wanted('big-timeline', name('big-timeline')));
        await open(page, 'hall/?fixture=big#/timeline', theme, false);
        await shoot(page, 'big-timeline');
      });
    });
  }
}
