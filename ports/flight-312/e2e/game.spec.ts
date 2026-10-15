import { expect, test, type Page } from '@playwright/test';

/**
 * The smoke tests: the title credits the original and offers the three
 * modes, a takeoff practice puts the jumbo on the runway with the radio
 * talking, the chart, the checklists and the pause menu open and close, the
 * views change, an approach starts in the air, and nothing is logged to the
 * console on the way. They also run at phone size, landscape.
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
