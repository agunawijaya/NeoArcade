import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface CatalogEntry {
  slug: string;
  title: string;
}

const catalog = JSON.parse(readFileSync('hall/catalog.json', 'utf8')) as CatalogEntry[];
const first = catalog[0];

/** Fails the test on any uncaught error or console error the page produces. */
function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openHall(page: Page, hash = '') {
  await page.goto(`./${hash}`);
  await page.locator('body.is-ready').waitFor();
}

test('the Hall opens cleanly', async ({ page }) => {
  const errors = watchForErrors(page);
  await openHall(page);
  await expect(page.locator('h1.logo')).toContainText('NeoArcade');
  if (catalog.length === 0) {
    await expect(page.getByRole('heading', { name: 'The machines are warming up…' })).toBeVisible();
  } else {
    await expect(page.locator('.grid .cabinet')).toHaveCount(catalog.length);
  }
  expect(errors).toEqual([]);
});

test('the Hall holds still for players who prefer reduced motion', async ({ page }) => {
  const errors = watchForErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHall(page);
  // Animations collapse to a single instant; give the ones started at boot a moment to end.
  await page.waitForTimeout(300);
  const stillRunning = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        const name = animation instanceof CSSAnimation ? animation.animationName : 'transition';
        return `${name} on .${target?.className ?? '?'}`;
      }),
  );
  expect(stillRunning).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('with games in the catalog', () => {
  test.skip(!first, 'The catalog is empty.');
  const game = first as CatalogEntry;

  test('a cabinet opens its detail panel and Esc closes it', async ({ page }) => {
    await openHall(page);
    await page.locator(`.cabinet[data-slug="${game.slug}"]`).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByRole('heading', { name: game.title })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#/games/${game.slug}$`));

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/#\/$/);
  });

  test('the grid is keyboard driven', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones have no keyboard.');
    await openHall(page);
    await page.keyboard.press('/');
    await expect(page.locator('.search__field')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.cabinet').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog[open] .button--play')).toBeFocused();
  });

  test('search narrows the floor and can be cleared', async ({ page }) => {
    await openHall(page);
    await page.locator('.search__field').fill('zzzz no such game');
    await expect(page.locator('.lobby__none')).toBeVisible();
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(page.locator('.grid .cabinet')).toHaveCount(catalog.length);
  });

  test('how to play and about render inside the Hall', async ({ page }) => {
    const errors = watchForErrors(page);
    await openHall(page, `#/games/${game.slug}`);
    await page.locator('dialog[open]').getByRole('link', { name: 'How to play' }).click();
    await expect(page.locator('.prose h1')).toBeVisible();
    await expect(page.locator('.docs__tab[aria-current="page"]')).toHaveText('How to play');

    await page.locator('.docs__tab', { hasText: 'About' }).click();
    await expect(page.locator('.prose h1')).toBeVisible();
    const diagrams = page.locator('.doc-diagram');
    if ((await diagrams.count()) > 0) {
      await expect(diagrams.first().locator('svg')).toBeVisible({ timeout: 15_000 });
    }
    expect(errors).toEqual([]);
  });

  test('Play launches the game, which links back to the Hall', async ({ page }) => {
    await openHall(page, `#/games/${game.slug}`);
    await page.locator('dialog[open] .button--play').click();
    await expect(page).toHaveURL(new RegExp(`/${game.slug}/$`));

    const hallLink = page.getByRole('link', { name: 'Back to the Arcade Hall' });
    await expect(hallLink).toBeVisible();
    await hallLink.click();
    await expect(page.locator('h1.logo')).toBeVisible();
  });

  test('a game loads nothing from outside its own folder', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.goto(`./${game.slug}/`);
    await page.waitForLoadState('networkidle');
    expect(requests.length).toBeGreaterThan(0);
    for (const path of requests) expect(path.startsWith(`/${game.slug}/`)).toBe(true);
  });
});
