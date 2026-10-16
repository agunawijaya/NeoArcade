import { expect, test, type Page } from '@playwright/test';
import { loadTerrainSource } from '../src/data/unpack';
import { createFlight } from '../src/engine/flight';
import { createPracticePlayer, stepPracticePlayer } from '../src/engine/practice-player';
import { FlightRecorder } from '../src/engine/recording';
import { createTerrain } from '../src/engine/terrain';
import { packReplay } from '../src/game/replay-link';

/**
 * The smoke tests: the title credits the original and offers every mode, a
 * takeoff practice puts the jumbo on the runway with the radio talking, the
 * chart, the checklists and the pause menu open and close, the views
 * change, an approach starts in the air, the glass deck, the flight school
 * and the Daily Approach open, a challenge link plays someone's landing,
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

async function openTitle(page: Page) {
  await page.goto('./');
  await page.waitForSelector('body[data-ready="title-screen"]');
}

async function startPractice(page: Page, mode: 'Takeoff' | 'Approach') {
  await openTitle(page);
  await page.getByRole('button', { name: new RegExp(`^${mode} `) }).click();
  await page.waitForSelector('body[data-ready="briefing"]');
  await page.locator('.screen-footer .primary').click();
  await page.waitForSelector('body[data-ready="flight"]', { timeout: 120_000 });
}

test('the title credits the original and offers every mode', async ({ page }) => {
  await openTitle(page);
  const credit = page.locator('.title-credit');
  await expect(credit).toContainText(
    'Inspired by JETSET, an IFR Boeing 747 simulator by J. (Jean/Gene) Szymanski',
  );
  for (const mode of ['Flight 312', 'Takeoff', 'Approach'])
    await expect(page.getByRole('button', { name: new RegExp(`^${mode} `) })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  // The aircraft is "the jumbo": the maker's name appears in the credit and nowhere else.
  const mentions = await page.evaluate(() => document.body.innerText.match(/Boeing/g)?.length);
  expect(mentions).toBe(1);
});

test('a takeoff practice puts the jumbo on the runway with the radio talking', async ({ page }) => {
  await startPractice(page, 'Takeoff');
  await expect(page.locator('canvas.cockpit')).toBeVisible();
  // The takeoff practice starts on the runway at 07:59:40.
  await expect(page.locator('.hud-status')).toContainText(/07:59|08:0\d/);
  await expect(page.locator('.hud-line').first()).toBeVisible({ timeout: 30_000 });
});

test('the chart, the checklists and the pause menu open and close', async ({ page }) => {
  await startPractice(page, 'Takeoff');
  await page.keyboard.press('m');
  await expect(page.locator('.chart-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Close chart' }).click();
  await expect(page.locator('.chart-overlay')).toHaveCount(0);
  await page.keyboard.press('k');
  await expect(page.locator('.checklist-overlay')).toBeVisible();
  await page.locator('.checklist-overlay').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.checklist-overlay')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.pause')).toHaveCount(0);
});

test('the view buttons look round the flight deck', async ({ page }) => {
  await startPractice(page, 'Takeoff');
  const active = page.locator('.hud-view.active');
  await expect(active).toContainText('Panel');
  // On a phone the list folds into one button that steps to the next view.
  const folded = await page.evaluate(() => matchMedia('(max-height: 520px)').matches);
  if (folded) await active.click();
  else await page.locator('.hud-view', { hasText: 'Pedestal' }).click();
  await expect(page.locator('.hud-view.active')).toContainText('Pedestal');
  await expect(page.locator('.hud')).toHaveAttribute('data-view', 'pedestal');
});

test('an approach starts in the air, fifteen miles out', async ({ page }) => {
  await startPractice(page, 'Approach');
  await expect(page.locator('.hud-status')).toContainText(/09:2\d/);
  await expect(page.locator('canvas.cockpit')).toBeVisible();
});

test('the glass deck is chosen on the briefing, and has no engineer', async ({ page }) => {
  await openTitle(page);
  await page.getByRole('button', { name: /^Approach / }).click();
  await page.waitForSelector('body[data-ready="briefing"]');
  await page.getByRole('radio', { name: /Glass/ }).check();
  await page.locator('.screen-footer .primary').click();
  await page.waitForSelector('body[data-ready="flight"]', { timeout: 120_000 });
  await expect(page.locator('canvas.cockpit')).toBeVisible();
  await expect(page.locator('.hud-view', { hasText: 'Engineer' })).toHaveCount(0);
});

test('the flight school starts a lesson with the instructor', async ({ page }) => {
  await openTitle(page);
  await page.getByRole('button', { name: /^Flight school/ }).click();
  await page.waitForSelector('body[data-ready="school"]');
  await expect(page.locator('.school-lesson')).toHaveCount(13);
  await page.locator('.school-lesson').first().getByRole('button', { name: 'Fly it' }).click();
  await page.waitForSelector('body[data-ready="flight"]', { timeout: 120_000 });
  await expect(page.locator('.hud-lesson')).toContainText('Cockpit tour');
  await expect(page.locator('.hud-instructor')).toContainText('Instructor', { timeout: 15_000 });
});

test('the Daily Approach shows today’s field and its weather', async ({ page }) => {
  await openTitle(page);
  await page.getByRole('button', { name: /^Daily Approach/ }).click();
  await page.waitForSelector('body[data-ready="daily"]', { timeout: 60_000 });
  await expect(page.locator('#daily-title')).toContainText('Daily Approach #');
  await expect(page.locator('.daily-chips li')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Fly today’s approach' })).toBeVisible();
});

/** An approach flown in Node by the practice player, packed as a friend would share it. */
async function challengeLink(): Promise<string> {
  const flight = createFlight(
    { mode: 'approach', level: 'pilot', destination: 'bos', seed: 77, sky: 'low' },
    createTerrain(await loadTerrainSource()),
  );
  const recorder = new FlightRecorder(flight);
  const player = createPracticePlayer(recorder);
  while (!flight.outcome && flight.time < 1500) stepPracticePlayer(player);
  return packReplay({
    meta: { kind: 'approach', nickname: 'Ace' },
    recording: recorder.recording(),
  });
}

test('a challenge link shows who flew what, and plays their landing', async ({ page }) => {
  await page.goto(`./#r=${await challengeLink()}`);
  await page.waitForSelector('body[data-ready="challenge"]', { timeout: 120_000 });
  await expect(page.locator('#challenge-title')).toContainText('Ace flew');
  await expect(page.locator('.challenge-score')).toContainText('points');
  await page.getByRole('button', { name: 'Watch their landing' }).click();
  await expect(page.locator('.replay-bar')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('radio', { name: 'Tower' }).click();
  await expect(page.locator('.replay-label')).toContainText('Tower');
});
