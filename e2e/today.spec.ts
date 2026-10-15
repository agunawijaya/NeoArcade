import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PUZZLES } from '../ports/skyline-showdown/src/tricks/packs';

/**
 * Today in NeoArcade and Continue playing: the Hall reads what the games
 * keep (daily logs, the play history), and its links open each game in the
 * right mode.
 */
interface CatalogEntry {
  slug: string;
  daily?: { name: string; mode: string };
}

const catalog = JSON.parse(readFileSync('hall/catalog.json', 'utf8')) as CatalogEntry[];
const withDaily = catalog.filter((game) => game.daily);
const today = () => new Date().toISOString().slice(0, 10);

async function openHall(page: Page, hash = '') {
  await page.goto(`./${hash}`);
  await page.locator('body.is-ready').waitFor();
}

test('a fresh profile sees every daily waiting, and no Continue row', async ({ page }) => {
  test.skip(withDaily.length === 0, 'No game has a daily yet.');
  await openHall(page);
  await expect(page.locator('.continue')).toBeHidden();
  const tiles = page.locator('.today .daily-tile');
  await expect(tiles).toHaveCount(withDaily.length);
  for (const game of withDaily) {
    const tile = tiles.filter({ hasText: game.daily?.name ?? '' });
    await expect(tile).toContainText('Not played yet');
    await expect(tile).toHaveAttribute(
      'href',
      new RegExp(`${game.slug}/\\?play=${game.daily?.mode}$`),
    );
  }
  await expect(page.locator('.today__next')).toContainText(/New dailies in \d/);
});

test("today's result and streak come from the game's own daily log", async ({ page }) => {
  test.skip(!catalog.some((game) => game.slug === 'long-haul'), 'Long Haul is not in the Hall.');
  await page.addInitScript((day) => {
    const yesterday = new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const result = {
      outcome: 'delivered',
      late: false,
      profitCents: 140_250,
      hours: 47,
      tickets: 0,
    };
    localStorage.setItem(
      'neoarcade:long-haul:daily',
      JSON.stringify({ [yesterday]: result, [day]: result }),
    );
  }, today());
  await openHall(page);
  const tile = page.locator('.daily-tile[data-slug="long-haul"]');
  await expect(tile).toHaveClass(/is-done/);
  await expect(tile).toContainText('Delivered, $1,403 in 1 d 23 h');
  await expect(tile).toContainText('2-day streak');
});

test('a link from the Hall opens the game in that mode, once', async ({ page }) => {
  test.skip(!catalog.some((game) => game.slug === 'long-haul'), 'Long Haul is not in the Hall.');
  await page.goto('./long-haul/?play=daily');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'daily');
  // The request leaves the address, so a reload lands on the title as usual.
  await expect(page).toHaveURL(/\/long-haul\/$/);
});

test('playing a mode puts it in Continue playing, which leads back to it', async ({ page }) => {
  test.skip(!catalog.some((game) => game.slug === 'skyline-showdown'), 'Skyline is not here.');
  const puzzle = PUZZLES[0];
  if (!puzzle) throw new Error('Trick Shot has no puzzles.');

  await page.goto(`./skyline-showdown/?play=tricks&item=${puzzle.id}`);
  const card = page.locator('.puzzle-card');
  await expect(card).toBeVisible();
  // Phones held upright get a "turn me sideways" note over the game; press through it.
  await card.getByRole('button', { name: 'Play' }).dispatchEvent('click');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'match');

  await openHall(page);
  const tile = page.locator('.continue .resume').first();
  await expect(tile).toContainText(`Trick Shot · ${puzzle.name}`);
  await expect(tile).toHaveAttribute(
    'href',
    new RegExp(`skyline-showdown/\\?play=tricks&item=${puzzle.id}$`),
  );
  await tile.click();
  await expect(page.locator('.puzzle-card')).toBeVisible();
});

test('the Pass page clears the play history', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const play = {
      game: 'long-haul',
      mode: 'career',
      label: 'Career · Chicago to Denver',
      at: new Date().toISOString(),
    };
    localStorage.setItem('neoarcade:last-played:history', JSON.stringify([play]));
  });
  await openHall(page);
  await expect(page.locator('.continue .resume')).toHaveCount(1);

  await openHall(page, '#/pass');
  await page.getByRole('button', { name: 'Clear history' }).click();
  await expect(page.locator('.pass__status')).toContainText('play history is cleared');
  await expect(page.getByRole('button', { name: 'Clear history' })).toBeDisabled();

  await page.getByRole('link', { name: 'The Hall' }).click();
  await expect(page.locator('.continue')).toBeHidden();
});
