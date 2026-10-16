import { expect, test } from '@playwright/test';
import { advance, openGame } from './helpers';

/**
 * The page end to end: every mode starts and flies, pausing works, the
 * campaign opens chapter by chapter, the Secret Hangar can be found, keys
 * can be changed. Whole games, flown by the scripted pilot, are in
 * campaign.playtest.ts.
 */
test.describe('Mind the Ox', () => {
  test('shows the title with every mode and the credit to the original', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openGame(page);
    for (const mode of [
      'campaign',
      'at-sea',
      'sortie',
      'dogfight',
      'classic',
      'daily',
      'two-player',
    ])
      await expect(page.locator(`[data-mode="${mode}"]`)).toBeVisible();
    await expect(page.getByText('Inspired by Sopwith by David L. Clark')).toBeVisible();
    await expect(page.getByText('Great War 1917')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('flies a campaign chapter, pauses and goes back to the menu', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openGame(page);
    await page.click('[data-mode="campaign"]');
    await expect(page.getByText('Chapter 1 · A protected ox herd')).toBeVisible();
    await expect(page.locator('[data-chapter="westerly"]')).toBeDisabled();
    await page.click('[data-action="take-off"]');
    await advance(page, 500);
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
    await page.keyboard.down('KeyD');
    await advance(page, 1500);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('Escape');
    await advance(page, 200);
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: 'Menu' }).click();
    await advance(page, 200);
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
    expect(errors).toEqual([]);
  });

  test('starts every other mode', async ({ page }) => {
    await openGame(page);
    const start = async (mode: string, button: string | null) => {
      await page.click(`[data-mode="${mode}"]`);
      await advance(page, 200);
      if (button) await page.getByRole('button', { name: button }).first().click();
      await advance(page, 800);
      await expect(page.locator('body')).toHaveAttribute('data-mode', mode);
      await page.keyboard.press('Escape');
      await advance(page, 200);
      await page.getByRole('button', { name: 'Menu' }).click();
      await advance(page, 200);
    };
    await start('at-sea', 'Take off');
    await start('sortie', 'Take off');
    await start('dogfight', 'Take off');
    await start('classic', null);
    await start('daily', 'Take off');
    await start('two-player', 'Take off');
    await expect(page.locator('.stage__pane')).toHaveCount(1);
  });

  test('opens a shared Custom Sortie from its link, ready to fly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-16T14:00:00Z') });
    await page.goto('./?sortie=cbs1dn0-2n5');
    await advance(page, 400);
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'sortie');
    await expect(page.getByText('Code cbs1dn0-2n5')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anti-ship' })).toBeVisible();
    await page.getByRole('button', { name: 'Take off' }).click();
    await advance(page, 800);
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'sortie');
    expect(errors).toEqual([]);
  });

  test('splits the screen for two players', async ({ page }) => {
    await openGame(page);
    await page.click('[data-mode="two-player"]');
    await page.getByRole('button', { name: 'Versus' }).click();
    await page.getByRole('button', { name: 'Take off' }).click();
    await advance(page, 1000);
    await expect(page.locator('.stage__pane')).toHaveCount(2);
  });

  test('opens the Secret Hangar for whoever types 1984’s hidden switch', async ({ page }) => {
    await openGame(page);
    await page.keyboard.type('-x');
    await advance(page, 300);
    await expect(page.getByRole('heading', { name: 'The Secret Hangar' })).toBeVisible();
    const stored = await page.evaluate(() =>
      localStorage.getItem('neoarcade:mind-the-ox:progress'),
    );
    expect(JSON.parse(stored ?? '{}').hangarFound).toBe(true);
  });

  test('lets a key be changed in Settings', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await advance(page, 200);
    const guns = page.locator('.keys').first().locator('.keys__item', { hasText: 'Guns' });
    await guns.getByRole('button').click();
    await page.keyboard.press('KeyJ');
    await advance(page, 100);
    await expect(guns.getByRole('button')).toHaveText('J');
    const stored = await page.evaluate(() =>
      localStorage.getItem('neoarcade:mind-the-ox:settings'),
    );
    expect(JSON.parse(stored ?? '{}').keys.solo.fire).toBe('KeyJ');
  });
});
