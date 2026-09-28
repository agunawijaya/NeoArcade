import { expect, test, type Page } from '@playwright/test';
import {
  openGame,
  run,
  runUntil,
  startMode,
  untilPlaying,
  untilResults,
  watchForErrors,
} from './helpers';

/**
 * Whole runs and matches are played out on the fake clock, frame by frame.
 * Headless browsers draw in software, so those tests shrink the window.
 */
async function longRun(page: Page) {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 480, height: 320 });
}

const lane = (page: Page) => page.evaluate(() => document.body.dataset.lane);
const stepOf = async (page: Page) => Number(await page.evaluate(() => document.body.dataset.step));
const stored = (page: Page, key: string) =>
  page.evaluate(
    (name) => JSON.parse(localStorage.getItem(`neoarcade:donkey-dash:${name}`) ?? 'null'),
    key,
  );

test('boots to the title with the logo, the five modes and the credit line', async ({ page }) => {
  const errors = watchForErrors(page);
  await openGame(page);
  await expect(page.getByRole('heading', { name: /Donkey\s*Dash/ })).toBeVisible();
  for (const mode of ['Road Trip', 'Endless', 'Daily Road', 'Classic Duel', 'Donkey vs Driver']) {
    await expect(page.getByRole('button', { name: new RegExp(mode) })).toBeVisible();
  }
  await expect(page.getByText('Inspired by DONKEY.BAS, © IBM Corp. 1981, 1982.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the Arcade Hall' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('one button switches lanes: a key, or a tap on the road', async ({ page, isMobile }) => {
  const errors = watchForErrors(page);
  await openGame(page);
  await startMode(page, 'endless');
  await untilPlaying(page);
  expect(await lane(page)).toBe('0');
  if (isMobile) await page.locator('.stage__canvas').tap({ force: true });
  else await page.keyboard.press('Space');
  await run(page, 50);
  expect(await lane(page)).toBe('1');
  if (!isMobile) {
    await page.keyboard.press('ArrowLeft');
    await run(page, 50);
    expect(await lane(page)).toBe('0');
  }
  expect(errors).toEqual([]);
});

test('an Endless run with nobody driving ends after three crashes', async ({ page }) => {
  const errors = watchForErrors(page);
  await longRun(page);
  await openGame(page, { settings: { camera: 'classic' } });
  await startMode(page, 'endless');
  await untilResults(page);
  await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Drive again' })).toBeVisible();
  expect(await stored(page, 'endless-normal')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('pauses, switches the camera from the pause menu, and counts back in', async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page);
  await startMode(page, 'endless');
  await untilPlaying(page);
  await page.keyboard.press('Escape');
  await run(page, 50);
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeVisible();
  const step = await stepOf(page);
  await run(page, 1000);
  expect(await stepOf(page)).toBe(step);
  await pause.getByRole('radio', { name: 'Isometric' }).click({ force: true });
  expect((await stored(page, 'settings')).camera).toBe('iso');
  await pause.getByRole('button', { name: 'Resume' }).click({ force: true });
  await expect(pause).toBeHidden();
  // A count-in brings the road back in step with the music, then it moves again.
  await run(page, 50);
  expect(await page.evaluate(() => document.body.dataset.phase)).toBe('countdown');
  await untilPlaying(page);
  await run(page, 500);
  expect(await stepOf(page)).toBeGreaterThan(step);
});

test('asks before leaving mid-run for the Hall', async ({ page }) => {
  await openGame(page);
  await startMode(page, 'endless');
  await untilPlaying(page);
  await page.getByRole('link', { name: 'Back to the Arcade Hall' }).click({ force: true });
  await expect(page.getByText('Leave the road? This run will not be kept.')).toBeVisible();
});

test('the Daily Road counts one run a day, shares it without spoilers, and marks the calendar', async ({
  page,
}) => {
  const errors = watchForErrors(page);
  await longRun(page);
  await openGame(page);
  await startMode(page, 'daily');
  await expect(page.locator('.daily__number')).toHaveText('Road #7');
  await page.getByRole('button', { name: 'Drive today’s road' }).click({ force: true });
  await untilResults(page);
  await expect(page.getByRole('heading', { name: /Daily Road #7/ })).toBeVisible();
  const share = await page.locator('.results .share__text').textContent();
  expect(share).toMatch(/^Donkey Dash · Daily #7 🚗💨 3 🫏💥 · [\d,]+ m\n(🟩|✨|💥|⬜){10}$/u);
  expect(Object.keys(await stored(page, 'daily'))).toEqual(['2026-10-04']);

  await page.getByRole('button', { name: 'Main menu' }).click({ force: true });
  // The Arcade Pass toasts (Early Bird, maybe a level) have their moment first.
  await runUntil(page, () => document.querySelector('.neo-toasts')?.childElementCount === 0);
  await startMode(page, 'daily');
  await expect(page.getByText('Today’s run is in.', { exact: false })).toBeVisible();
  await expect(page.locator('.calendar__day--driven')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Practise' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Classic Duel plays to its points, and the Donkey wins if nobody drives', async ({ page }) => {
  const errors = watchForErrors(page);
  await longRun(page);
  await openGame(page, { settings: { camera: 'classic', points: 2 } });
  await startMode(page, 'classic');
  await expect(page.locator('.hud__plate--left')).toContainText('Donkey');
  await expect(page.locator('.hud__plate--right')).toContainText('Driver');
  await untilResults(page);
  await expect(page.getByRole('heading', { name: 'The Donkey wins' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rematch' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Donkey vs Driver splits the keyboard and swaps roles every point', async ({ page }) => {
  await longRun(page);
  await openGame(page);
  await startMode(page, 'versus');
  await expect(page.locator('.hud__zones')).toBeVisible();
  await untilPlaying(page);
  // Player 2's keys steer the donkey, never the car.
  await page.keyboard.press('KeyL');
  await run(page, 50);
  expect(await lane(page)).toBe('0');
  await page.keyboard.press('KeyA');
  await run(page, 50);
  expect(await lane(page)).toBe('1');
  // P is one of Player 2's keys here, not pause.
  await page.keyboard.press('KeyP');
  await run(page, 50);
  expect(await page.evaluate(() => document.body.dataset.phase)).toBe('play');
  // Player 1 drives first; after the first point, Player 1 is the donkey.
  await expect(page.locator('.hud__plate--left')).toHaveAttribute('data-role', 'driver');
  await runUntil(
    page,
    () => document.querySelector('.hud__plate--left[data-role="donkey"]') !== null,
  );
});

test('Road Trip opens with Farm Lanes and keeps later routes locked', async ({ page }) => {
  await openGame(page);
  await startMode(page, 'trip');
  await expect(page.getByRole('heading', { name: 'Road Trip' })).toBeVisible();
  await expect(page.locator('[data-route="farm"] [data-leg="0"]')).toBeEnabled();
  await expect(page.locator('[data-route="farm"] [data-leg="1"]')).toBeDisabled();
  await expect(page.locator('[data-route="mountain"]')).toHaveClass(/is-locked/);
  await page.locator('[data-route="farm"] [data-leg="0"]').click({ force: true });
  await untilPlaying(page);
  expect(await page.evaluate(() => document.body.dataset.mode)).toBe('trip');
});

test('remembers settings, and the garage keeps locked parts locked', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Settings' }).click({ force: true });
  await page.getByRole('radio', { name: /top-down/ }).click({ force: true });
  await page.getByRole('button', { name: 'More points' }).click({ force: true });
  const settings = await stored(page, 'settings');
  expect(settings.camera).toBe('classic');
  expect(settings.points).toBe(6);
  await page.locator('.screen--panel:not([hidden]) .panel__footer .button--quiet').click({
    force: true,
  });

  await page.getByRole('button', { name: 'Garage' }).click({ force: true });
  await page.getByRole('tab', { name: 'Paint' }).click({ force: true });
  await page.locator('[data-item="paint-cherry"]').click({ force: true });
  await expect(page.locator('.garage__caption')).toContainText('Arcade level 8');
  await page.locator('[data-item="paint-sky"]').click({ force: true });
  expect((await stored(page, 'garage')).paint).toBe('paint-sky');
});

test('follows the device theme, and holds still for reduced motion', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await openGame(page);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await expect(page.locator('.screen--title')).toHaveClass(/is-ready/);
  await page.getByRole('button', { name: 'Switch to the dark theme' }).click({ force: true });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
});
