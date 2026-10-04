import { expect, test } from '@playwright/test';
import {
  driveToTheEnd,
  openGame,
  press,
  pressButton,
  run,
  runUntil,
  startSingleHaul,
} from './helpers';

/**
 * The smoke tests: every mode opens, a Single Haul drives to the logbook in
 * both rhythms and both views, the map and the pause menu open and close,
 * and nothing is logged to the console on the way. They also run at phone
 * size, landscape.
 */
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Console error: ${message.text()}`);
  });
});

test('the title credits the original and offers every mode', async ({ page }) => {
  await openGame(page);
  await expect(page.getByText('Inspired by Trucker by Hughes Glantzberg.')).toBeVisible();
  for (const choice of ['single', 'career', 'daily', 'album', 'settings']) {
    await expect(page.locator(`[data-choice="${choice}"]`)).toBeVisible();
  }
  // The original printed its author's street address; this port never does.
  await expect(page.locator('body')).not.toContainText(
    /\d+\s+\w+\s+(Street|St\.|Avenue|Ave\.|Road|Rd\.)/,
  );
});

test('a Single Haul drives from the terminal to the logbook, leg by leg', async ({ page }) => {
  // Every frame of a whole trip is drawn on the way.
  test.setTimeout(400_000);
  await openGame(page, { settings: { rhythm: 'legs' } });
  await startSingleHaul(page);
  await expect(page.locator('.strip')).toBeVisible();
  const log = await driveToTheEnd(page);
  expect(log.stops).toBeGreaterThan(0);
  await expect(page.locator('.ledger__stamp')).toBeVisible();
  await expect(page.locator('.receipt').first()).toBeVisible();
  await expect(page.locator('.ledger__verdict')).toContainText(/profit|lost|lose|revoked/i);
});

test('real time in the cab: the dashboard, the map and the pause menu', async ({ page }) => {
  await openGame(page, { settings: { view: 'cab', rhythm: 'realtime' } });
  await startSingleHaul(page);
  await run(page, 4000);
  await expect(page.locator('.drive[data-view="cab"]')).toBeVisible();
  await page.keyboard.press('m');
  await run(page, 300);
  await expect(page.locator('.map-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await run(page, 300);
  await expect(page.locator('.map-overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await run(page, 300);
  await expect(page.locator('.pause')).toBeVisible();
  await pressButton(page, 'Back on the road');
  await expect(page.locator('.pause')).toBeHidden();
  const before = await page.evaluate(
    () => document.querySelector('.strip__facts')?.textContent ?? '',
  );
  await run(page, 9000);
  const after = await page.evaluate(
    () => document.querySelector('.strip__facts')?.textContent ?? '',
  );
  expect(after).not.toBe(before);
});

test('the side view pulls in at a truck stop and leaves it', async ({ page }) => {
  await openGame(page, { settings: { view: 'diorama', rhythm: 'realtime', warp: 4 } });
  await startSingleHaul(page);
  await runUntil(
    page,
    () =>
      document.querySelector('.stop-banner') !== null &&
      !document.querySelector('.stop-banner')?.closest('[hidden]'),
    120_000,
  );
  await page.keyboard.press('t');
  await runUntil(
    page,
    () =>
      document.body.dataset.screen === 'stop' ||
      document.querySelector('.ask-stop:not([hidden])') !== null,
    60_000,
  );
  if ((await page.evaluate(() => document.body.dataset.screen)) !== 'stop')
    await press(page, '.ask-stop .button--primary');
  await runUntil(page, () => document.body.dataset.screen === 'stop', 30_000);
  await expect(page.locator('.stop__head .sign')).toBeVisible();
  await press(page, '.stop__leave');
  await runUntil(page, () => document.body.dataset.screen === 'drive', 10_000);
});

test('a career starts in Los Angeles with a job board and a garage', async ({ page }) => {
  await openGame(page);
  await press(page, '[data-choice="career"]');
  await pressButton(page, 'Start a career');
  await expect(page.getByRole('heading', { name: /Los Angeles terminal/ })).toBeVisible();
  await expect(page.locator('.career__load')).toHaveCount(5);
  await expect(page.locator('.career__upgrade')).toHaveCount(6);
  await pressButton(page, /Wait a day/);
  await expect(page.locator('.career__stat').first()).toContainText('$915');
});

test('the Daily Haul shows today’s load, a streak and the calendar', async ({ page }) => {
  await openGame(page);
  await press(page, '[data-choice="daily"]');
  await expect(page.getByRole('heading', { name: /#1/ })).toBeVisible();
  await expect(page.locator('.daily__route')).toContainText('→');
  await expect(page.locator('.daily__month td.is-today')).toHaveCount(1);
});

test('the album shows collected postcards and turns them over', async ({ page }) => {
  await openGame(page, { storage: { postcards: ['barstow', 'state:AZ'] } });
  await press(page, '[data-choice="album"]');
  await run(page, 500);
  await expect(page.locator('.album__tile:not(.album__tile--blank)')).toHaveCount(2);
  await press(page, '.album__tile:not(.album__tile--blank)');
  await expect(page.locator('.album__note')).toContainText('Barstow');
  await page.keyboard.press('Escape');
  await expect(page.locator('.album__viewer')).toBeHidden();
});

test('settings are remembered, and text mode plays the original prompts', async ({ page }) => {
  await openGame(page);
  await press(page, '[data-choice="settings"]');
  await pressButton(page, 'Kilometres');
  await page.locator('.settings__crt input').check({ force: true });
  await page.reload();
  await runUntil(page, () => document.body.dataset.screen === 'title');
  await run(page, 3000);
  await startSingleHaul(page);
  await expect(page.locator('.crt')).toBeVisible();
  await expect(page.locator('.crt__prompt-text')).toContainText('How fast do you wish to go');
  await page.locator('.crt__input').fill('55');
  await page.keyboard.press('Enter');
  await expect(page.locator('.crt__status')).toContainText('Odometer');
});
