import { expect, test, type Page } from '@playwright/test';

/** The Arcade Pass in the built Hall: profile, editor, backups, storage trouble, theme. */
function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openPass(page: Page) {
  await page.goto('./#/pass');
  await page.locator('body.is-ready').waitFor();
  await expect(page.locator('.pass-hero')).toBeVisible();
}

async function editProfile(page: Page) {
  await page.locator('[data-pass-action="edit"]').click();
  await expect(page.locator('dialog.editor[open]')).toBeVisible();
}

test('the masthead chip opens the Pass, and Esc leads back', async ({ page, isMobile }) => {
  const errors = watchForErrors(page);
  await page.goto('./');
  await page.locator('body.is-ready').waitFor();
  const chip = page.getByRole('link', { name: /^Arcade Pass: Player One, level 1/ });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(/#\/pass$/);
  await expect(page.locator('#pass-name')).toHaveText('Player One');
  await expect(page.getByRole('heading', { name: 'Badge cabinet' })).toBeVisible();
  await expect(page.locator('.rank-road__step')).toHaveCount(6);
  if (!isMobile) {
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/$/);
    await expect(chip).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('a new name and look are kept', async ({ page }) => {
  await openPass(page);
  await editProfile(page);
  await page.locator('.editor__name-field').fill('Grace');
  await page.getByRole('tab', { name: 'Eyes' }).click();
  await page.getByRole('radio', { name: 'Happy' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('dialog.editor[open]')).toHaveCount(0);
  await expect(page.locator('#pass-name')).toHaveText('Grace');

  await page.reload();
  await expect(page.locator('#pass-name')).toHaveText('Grace');
  await editProfile(page);
  await page.getByRole('tab', { name: 'Eyes' }).click();
  await expect(page.getByRole('radio', { name: 'Happy' })).toHaveAttribute('aria-checked', 'true');
});

test('locked parts say which level unlocks them, and stay locked', async ({ page }) => {
  await openPass(page);
  await editProfile(page);
  await page.getByRole('tab', { name: 'Headwear' }).click();
  const headphones = page.getByRole('radio', { name: 'Headphones, unlocks at level 2' });
  await expect(headphones).toHaveAttribute('aria-disabled', 'true');
  await expect(headphones).toContainText('Level 2');
  // Playwright won't click an aria-disabled control on its own; a player still can.
  await headphones.click({ force: true });
  await expect(headphones).toHaveAttribute('aria-checked', 'false');
});

test('a backup code brings the Pass back after starting over', async ({ page }) => {
  await openPass(page);
  await editProfile(page);
  await page.locator('.editor__name-field').fill('Ada');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.locator('[data-pass-action="safe-backup"]').click();
  const code = await page.locator('.backup__code').inputValue();
  expect(code).toMatch(/^NEOPASS1\./);
  await page.keyboard.press('Escape');

  await page.locator('[data-pass-action="safe-reset"]').click();
  await expect(page.locator('dialog.reset[open]')).toContainText('This erases Ada’s Arcade Pass');
  await page.getByRole('button', { name: 'Erase my Pass' }).click();
  await expect(page.locator('#pass-name')).toHaveText('Player One');

  await page.locator('[data-pass-action="safe-restore"]').click();
  await page.locator('.backup__code').fill(code);
  await page.getByRole('button', { name: 'Check backup' }).click();
  await expect(page.locator('.backup__preview')).toContainText('Ada');
  await expect(page.locator('#pass-name')).toHaveText('Player One');
  await page.getByRole('button', { name: 'Replace my Pass' }).click();
  await expect(page.locator('#pass-name')).toHaveText('Ada');
  await expect(page.locator('.pass__status')).toHaveText(
    'Welcome back, Ada. Your Pass is restored.',
  );
});

test('a mistyped backup code is refused politely', async ({ page }) => {
  await openPass(page);
  await page.locator('[data-pass-action="safe-restore"]').click();
  await page.locator('.backup__code').fill('NEOPASS1.eyJ2ZXJzaW9uIjox.00000000');
  await page.getByRole('button', { name: 'Check backup' }).click();
  await expect(page.getByRole('alert')).toContainText('incomplete or mistyped');
  await expect(page.locator('.backup__preview')).toHaveCount(0);
});

test('the Pass says so when the browser will not save it', async ({ page }) => {
  const errors = watchForErrors(page);
  await page.addInitScript(() => {
    const refuse = () => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    };
    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;
  });
  await openPass(page);
  await expect(page.locator('.pass-notice')).toContainText('only lasts until you close the tab');
  await expect(page.locator('.pass-chip.has-warning')).toHaveCount(1);
  await editProfile(page);
  await page.locator('.editor__name-field').fill('Still here');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#pass-name')).toHaveText('Still here');
  expect(errors).toEqual([]);
});

test('the theme switch is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await page.locator('body.is-ready').waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to the light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the dev-only Pass Lab never reaches the built site', async ({ page, request }) => {
  // The preview server answers unknown paths with the Hall, so look at what comes back.
  expect(await (await request.get('./hall/dev/pass-lab/')).text()).not.toContain('Pass Lab');
  const scripts: string[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('.js')) scripts.push(await response.text());
  });
  await openPass(page);
  await page.waitForLoadState('networkidle');
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).not.toContain('pass-lab');
});
