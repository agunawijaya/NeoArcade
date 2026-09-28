import { expect, test, type Page } from '@playwright/test';
import {
  findThrow,
  mirrorMatch,
  openGame,
  run,
  runUntil,
  runUntilPhase,
  startFromTitle,
  testSettings,
  typeThrow,
} from './helpers';

function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('boots to the title with the credit line and no errors', async ({ page }) => {
  const errors = watchForErrors(page);
  await openGame(page, testSettings(), 1);
  await expect(page.getByRole('heading', { name: 'Skyline Showdown' })).toBeVisible();
  await expect(
    page.getByText('Inspired by QBasic Gorillas, © Microsoft Corporation 1990.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the Arcade Hall' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a keyboard throw against the CPU, and the CPU throws back', async ({ page }) => {
  const errors = watchForErrors(page);
  await openGame(page, testSettings({ players: 'humanVsCpu', aiming: 'drag' }), 21);
  await startFromTitle(page);
  await expect(page.locator('.hud__plate--p2 .hud__badge')).toBeVisible();
  await expect(page.locator('.hud__aim')).toHaveText('45° · 60');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await run(page, 50);
  await expect(page.locator('.hud__aim')).toHaveText('46° · 61');

  await page.keyboard.press('Space');
  await runUntilPhase(page, 'flight');
  await runUntil(page, (player) => document.body.dataset.turn === player, '1');
  // The CPU thinks, winds up and throws on its own.
  await runUntilPhase(page, 'flight');
  expect(errors).toEqual([]);
});

test('pauses, resumes and asks before leaving mid-match', async ({ page }) => {
  await openGame(page, testSettings({ players: 'humanVsCpu', aiming: 'drag' }), 21);
  await startFromTitle(page);
  await page.keyboard.press('Escape');
  await run(page, 50);
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();

  await page.getByRole('link', { name: 'Back to the Arcade Hall' }).click({ force: true });
  await expect(page.getByText('Leave the match? The score will not be kept.')).toBeVisible();
});

test('classic typed input plays a whole point to victory', async ({ page }) => {
  // A whole point, replay and victory, every frame rendered: it takes a while.
  test.setTimeout(240_000);
  const settings = testSettings({ points: 1, world: 'earth' });
  const seed = 6;
  const state = mirrorMatch(settings, seed);
  const hit = findThrow(state, (shot) => shot.victim === 1);
  if (!hit) throw new Error('No winning throw in this city.');

  await openGame(page, settings, seed);
  await startFromTitle(page);
  await expect(page.locator('.hud__typed')).toContainText('Angle:');
  await typeThrow(page, hit.angle, hit.velocity);
  await runUntilPhase(page, 'over');
  await expect(page.getByRole('heading', { name: 'Ada wins!' })).toBeVisible();
  await expect(page.locator('.hud__plate--p1 .hud__score strong')).toHaveText('1');
});

test('the hidden aim guide against the CPU predicts the hit', async ({ page }) => {
  test.setTimeout(240_000);
  const settings = testSettings({ players: 'humanVsCpu', points: 1, world: 'earth' });
  const seed = 6;
  const hit = findThrow(mirrorMatch(settings, seed), (shot) => shot.victim === 1);
  if (!hit) throw new Error('No winning throw in this city.');
  const guide = () => page.evaluate(() => document.body.dataset.guide);

  await openGame(page, settings, seed);
  await startFromTitle(page);
  await run(page, 50);
  expect(await guide()).toBe('off');

  await page.keyboard.press('c');
  await page.keyboard.type(String(hit.angle));
  await page.keyboard.press('Enter');
  await page.keyboard.type(String(hit.velocity));
  await run(page, 50);
  await expect(page.locator('.hud__toast')).toHaveText('Aim guide on');
  expect(await guide()).toBe('hit');

  await page.keyboard.press('Enter');
  await runUntilPhase(page, 'over');
  await expect(page.getByRole('heading', { name: 'Ada wins!' })).toBeVisible();
});

test('popping a balloon hands its crate to the thrower', async ({ page }) => {
  const settings = testSettings({ powerUps: true });
  let found: { seed: number; angle: number; velocity: number } | null = null;
  for (let seed = 1; seed < 200 && !found; seed++) {
    const state = mirrorMatch(settings, seed);
    if (!state.round.balloon) continue;
    const pop = findThrow(state, (shot) => shot.collected !== null && shot.victim === null);
    if (pop) found = { seed, angle: pop.angle, velocity: pop.velocity };
  }
  if (!found) throw new Error('No city with a balloon to pop.');

  await openGame(page, settings, found.seed);
  await startFromTitle(page);
  await typeThrow(page, found.angle, found.velocity);
  await runUntilPhase(page, 'aim');
  await expect(page.locator('.hud__plate--p1 .hud__power')).toBeVisible();
});

test('remembers the chosen settings', async ({ page }) => {
  await openGame(page, testSettings(), 1);
  await page.getByRole('button', { name: 'Quick Match' }).click({ force: true });
  await page.getByRole('radio', { name: /Mars/ }).click({ force: true });
  await page.getByRole('button', { name: 'Start match' }).click({ force: true });
  await runUntilPhase(page, 'aim');
  const stored = await page.evaluate(() =>
    localStorage.getItem('neoarcade:skyline-showdown:settings'),
  );
  expect(JSON.parse(stored ?? '{}').world).toBe('mars');
  await expect(page.locator('.hud__round')).toContainText('Mars');
});

test('aim assist, switched on in the settings, shows the opening of the throw', async ({
  page,
}) => {
  await openGame(page, testSettings({ aiming: 'drag' }), 1);
  await page.getByRole('button', { name: 'Quick Match' }).click({ force: true });
  await page.getByRole('switch', { name: 'Aim assist' }).click({ force: true });
  await page.getByRole('button', { name: 'Start match' }).click({ force: true });
  await runUntilPhase(page, 'aim');
  await run(page, 50);
  expect(await page.evaluate(() => document.body.dataset.guide)).toBe('assist');
});

test('follows the device theme until a theme is chosen, then remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openGame(page, testSettings(), 1);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe('light');

  await page.getByRole('button', { name: 'Switch to the dark theme' }).click({ force: true });
  expect(await theme()).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await theme()).toBe('dark');
  const stored = await page.evaluate(() =>
    localStorage.getItem('neoarcade:skyline-showdown:theme'),
  );
  expect(JSON.parse(stored ?? 'null')).toBe('dark');

  await page.getByRole('button', { name: 'Settings', exact: true }).click({ force: true });
  await page.getByRole('radio', { name: /Auto/ }).click({ force: true });
  expect(await theme()).toBe('light');
});
