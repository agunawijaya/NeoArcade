import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface CatalogEntry {
  slug: string;
  title: string;
  added: string;
  category: string;
  secondaryCategory?: string;
  origin: { title: string };
}

const catalog = JSON.parse(readFileSync('hall/catalog.json', 'utf8')) as CatalogEntry[];
// The Hall features its newest game at the top.
const first = [...catalog].sort((a, b) => b.added.localeCompare(a.added))[0];
/** Search and genre filters only appear once the collection is this big. */
const SEARCH_FROM = 6;
/** Each game sits on its category's shelf, and on its second one if it has one. */
const shelfCards = catalog.reduce((sum, game) => sum + (game.secondaryCategory ? 2 : 1), 0);
const categories = [
  ...new Set(catalog.flatMap((game) => [game.category, game.secondaryCategory])),
].filter((category): category is string => Boolean(category));

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
  if (!first) {
    await expect(
      page.getByRole('heading', { name: 'The first games are on their way…' }),
    ).toBeVisible();
  } else {
    await expect(page.locator('.spotlight h2')).toHaveText(first.title);
    await expect(page.locator('.shelf')).toHaveCount(catalog.length > 1 ? categories.length : 0);
    await expect(page.locator('.shelf .card')).toHaveCount(catalog.length > 1 ? shelfCards : 0);
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

  test('the spotlight shows the game itself and invites a first throw', async ({ page }) => {
    await openHall(page);
    const spotlight = page.locator('.spotlight');
    await expect(spotlight.locator('.spotlight__tagline')).toBeVisible();
    const screen = spotlight.locator('.screens__frame.is-active img');
    if ((await screen.count()) > 0) {
      await expect
        .poll(() => screen.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    } else {
      await expect(spotlight.locator('canvas.screens__cover')).toBeVisible();
    }
    await expect(spotlight.getByRole('link', { name: `Play ${game.title}` })).toHaveAttribute(
      'href',
      new RegExp(`${game.slug}/$`),
    );
  });

  test('the detail panel opens from its address and Esc closes it', async ({ page }) => {
    await openHall(page, `#/games/${game.slug}`);
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByRole('heading', { name: game.title })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#/games/${game.slug}$`));

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/#\/$/);
  });

  test('the shelves are keyboard driven', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones have no keyboard.');
    test.skip(categories.length < 2, 'One shelf has nowhere to go up or down.');
    await openHall(page);
    const shelves = page.locator('.shelf');
    const first = shelves.nth(0).locator('[data-row-item]');
    await first.first().focus();

    // Along the shelf, then down to the next one, and back up.
    await page.keyboard.press('ArrowRight');
    await expect(first.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(shelves.nth(1).locator('[data-row-item]:focus')).toHaveCount(1);
    await page.keyboard.press('ArrowUp');
    await expect(shelves.nth(0).locator('[data-row-item]:focus')).toHaveCount(1);
    // Each shelf is a single tab stop.
    await expect(shelves.nth(0).locator('[data-row-item][tabindex="0"]')).toHaveCount(1);

    await first.first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog[open] .button--play')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(first.first()).toBeFocused();
  });

  test('a shelf opens its category page, which sorts and leads back', async ({
    page,
    isMobile,
  }) => {
    test.skip(catalog.length < 2, 'A single game has no shelves.');
    const category = catalog[0]?.category ?? '';
    const members = catalog.filter(
      (game) => game.category === category || game.secondaryCategory === category,
    );
    await openHall(page);
    await page.locator(`.shelf[data-category="${category}"] .shelf__title-link`).click();
    await expect(page).toHaveURL(new RegExp(`#/category/${category}$`));
    const view = page.locator('.category-page');
    await expect(view.locator('h1')).toBeVisible();
    await expect(view.locator('.card')).toHaveCount(members.length);

    await view.getByRole('button', { name: 'A–Z' }).click();
    const titles = [...members].map((game) => game.title).sort((a, b) => a.localeCompare(b));
    await expect(view.locator('.card__title')).toHaveText(titles);
    if (!isMobile && members.length > 1) {
      await view.locator('.card').first().focus();
      await page.keyboard.press('ArrowRight');
      await expect(view.locator('.card').nth(1)).toBeFocused();
    }
    await expect(view.getByRole('button', { name: 'Most played' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // A game's panel opens over the category page and closes back onto it.
    await view.locator('.card').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`#/category/${category}$`));
    await expect(view).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('.spotlight')).toBeVisible();
  });

  test('the Origins timeline shows each original beside its remake', async ({ page }) => {
    await openHall(page);
    await page.getByRole('link', { name: 'Origins' }).click();
    await expect(page).toHaveURL(/#\/timeline/);
    const markers = page.getByRole('tab');
    await expect(markers).toHaveCount(catalog.length);
    await expect(page.locator('.era').first()).toBeVisible();

    const selected = page.locator('.origin-marker[aria-selected="true"]');
    await selected.click();
    const panel = page.getByRole('tabpanel');
    const slug = (await selected.getAttribute('data-slug')) ?? '';
    const game = catalog.find((entry) => entry.slug === slug);
    await expect(panel.locator('.origin-facts__title')).toHaveText(game?.origin.title ?? '');
    await expect(panel.getByRole('link', { name: `Play ${game?.title}` })).toBeVisible();

    if (catalog.length > 1) {
      await page.keyboard.press('ArrowRight');
      await expect(page).not.toHaveURL(new RegExp(`#/timeline/${slug}$`));
      await expect(panel.locator('.origin-facts__title')).not.toHaveText(game?.origin.title ?? '');
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.spotlight')).toBeVisible();
  });

  test('search narrows the collection and can be cleared', async ({ page }) => {
    test.skip(catalog.length < SEARCH_FROM, 'Search appears once there are enough games.');
    await openHall(page);
    await page.keyboard.press('/');
    await expect(page.locator('.search__field')).toBeFocused();
    await page.locator('.search__field').fill('zzzz no such game');
    await expect(page.locator('.lobby__none')).toBeVisible();
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(page.locator('.grid .card')).toHaveCount(catalog.length);
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
    await openHall(page);
    await page.locator('.spotlight .button--play').click();
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

test('the forty-game fixture stays on the dev server', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('.js')) scripts.push(await response.text());
  });
  await openHall(page, '?fixture=big');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.shelf .card')).toHaveCount(catalog.length > 1 ? shelfCards : 0);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).not.toContain('Hammurabi Rising');
});
