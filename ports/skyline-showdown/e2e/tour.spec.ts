import { expect, test, type Page } from '@playwright/test';
import { emptyTour } from '../src/tour/save';
import { stageById, type Stage } from '../src/tour/stages';
import {
  openGame,
  planFlawlessWin,
  playPlan,
  playTourStage,
  run,
  runUntil,
  runUntilPhase,
  startFromTitle,
  testSettings,
  typeThrow,
} from './helpers';

/**
 * The World Tour, the wardrobe, badges and "So close!" in the real page.
 * Tour matches are rebuilt in Node from the same seed, CPU and all, so a
 * test can pick its throws and know what the page must show.
 */
const settings = testSettings({ players: 'humanVsCpu', aiming: 'typed' });
const TOUR_KEY = 'neoarcade:skyline-showdown:tour';
const PASS_KEY = 'neoarcade:pass:profile';

async function stored<T>(page: Page, key: string): Promise<T> {
  return JSON.parse((await page.evaluate((name) => localStorage.getItem(name), key)) ?? 'null');
}

test('the map starts in Jakarta, and its card explains the twist and the stars', async ({
  page,
}) => {
  await openGame(page, testSettings({ aimAssist: true }), 1);
  await page.locator('.title__tour').click({ force: true });
  await expect(page.locator('[data-stage="jakarta"]')).toHaveClass(/stop--next/);
  await expect(page.locator('[data-stage="tokyo"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.tour__chapter').nth(1)).toContainText('Needs 10 more ★');

  await page.locator('[data-stage="jakarta"]').click({ force: true });
  const card = page.getByRole('dialog', { name: 'Jakarta' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Monsoon gusts');
  await expect(card).toContainText('Drizzle');
  await expect(card.locator('.card__goal')).toHaveCount(3);
  await expect(card).toContainText('this stage can earn 1 star at most');
});

test('a flawless win in Jakarta earns three stars, a badge and the road to Tokyo', async ({
  page,
}) => {
  // A whole match, every frame rendered: it takes a while.
  test.setTimeout(360_000);
  const plan = planFlawlessWin(stageById('jakarta') as Stage, settings);
  await openGame(page, settings, plan.seed);
  await playTourStage(page, 'jakarta');
  await expect(page.locator('.hud__twist')).toHaveText('Monsoon gusts');
  await expect(page.locator('.hud__plate--p2 .hud__name')).toHaveText('Drizzle');
  await playPlan(page, plan);

  const results = page.getByRole('dialog', { name: 'Jakarta cleared!' });
  await expect(results).toBeVisible();
  await expect(results.locator('.results__stars')).toHaveAttribute('aria-label', '3 of 3 stars');
  await expect(results).toContainText('Drizzle can now be picked in Quick Match');

  const tour = await stored<ReturnType<typeof emptyTour>>(page, TOUR_KEY);
  expect(tour.stages.jakarta).toMatchObject({ stars: 3, won: true });
  expect(tour.rivalsBeaten).toEqual(['drizzle']);
  const profile = await stored<{ games: Record<string, { badges: Record<string, unknown> }> }>(
    page,
    PASS_KEY,
  );
  expect(Object.keys(profile.games['skyline-showdown']?.badges ?? {})).toContain(
    'singing-in-the-rain',
  );

  await results.getByRole('button', { name: 'Next stop' }).click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Tokyo' })).toBeVisible();
});

test('a miss says how close it came, and the marker fades before the next turn', async ({
  page,
}) => {
  await openGame(page, testSettings({ points: 1 }), 6);
  await startFromTitle(page);
  await typeThrow(page, 45, 40);
  await runUntilPhase(page, 'settle');
  await run(page, 200);
  const marker = page.locator('.hud__miss');
  await expect(marker).toBeVisible();
  await expect(marker.locator('strong')).toHaveText(/^\d+\.\d m (short|long|over|blocked)$/);
  await expect(marker).not.toHaveClass(/hud__miss--light/);
  await runUntil(page, (turn) => document.body.dataset.turn === turn, '1');
  await runUntilPhase(page, 'aim');
  await expect(marker).toHaveClass(/hud__miss--out/);
});

test('the wardrobe dresses player 1, and the choice is saved', async ({ page }) => {
  await openGame(page, settings, 1);
  await page.getByRole('button', { name: 'Wardrobe' }).click({ force: true });
  await page.getByRole('tab', { name: 'Headwear' }).click({ force: true });
  await page.getByRole('radio', { name: /^Cap/ }).click({ force: true });
  await expect(page.getByRole('radio', { name: /^Cap/ })).toHaveAttribute('aria-checked', 'true');
  const tour = await stored<ReturnType<typeof emptyTour>>(page, TOUR_KEY);
  expect(tour.outfits[0].headwear).toBe('hat-cap');

  // A locked item stays locked and says how to earn it.
  await page.getByRole('radio', { name: /^Top hat/ }).click({ force: true });
  await expect(page.locator('.wardrobe__detail')).toContainText('Collect 12 World Tour stars');
  expect((await stored<ReturnType<typeof emptyTour>>(page, TOUR_KEY)).outfits[0].headwear).toBe(
    'hat-cap',
  );
});

test('the badges screen shows this game’s shelf of the Pass', async ({ page }) => {
  await openGame(page, settings, 1);
  await page.getByRole('button', { name: 'Badges' }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Skyline Showdown' })).toBeVisible();
  await expect(page.locator('.neo-shelf__count')).toContainText('0 / 35 badges');
});

test('a rival beaten on the tour can be picked in Quick Match', async ({ page }) => {
  const tour = { ...emptyTour(), rivalsBeaten: ['drizzle'] };
  await openGame(page, settings, 3, { [TOUR_KEY]: tour });
  await page.getByRole('button', { name: 'Quick Match' }).click({ force: true });
  await page.getByRole('button', { name: 'Drizzle' }).click({ force: true });
  await page.getByRole('button', { name: 'Start match' }).click({ force: true });
  await runUntilPhase(page, 'aim');
  await expect(page.locator('.hud__plate--p2 .hud__name')).toHaveText('Drizzle');
});

test('the main menu offers every mode, and nothing that does not work yet', async ({ page }) => {
  await openGame(page, settings, 1);
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await expect(menu.locator('button, a')).toHaveText([
    /World Tour/,
    /Daily Skyline/,
    /Trick Shot/,
    'Quick Match',
    'Wardrobe',
    'Badges',
    'Settings',
    'How to play',
    'Back to Hall',
  ]);
});
