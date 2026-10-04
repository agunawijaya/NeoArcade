import { expect, test } from '@playwright/test';
import { driveToTheEnd, openGame, press, pressButton, run } from './helpers';

/**
 * A sensible player drives whole Single Hauls through the real page, leg by
 * leg: the suggested speed, every card read, pulling in whenever asked,
 * filling the tank and sleeping when tired. Each logbook must add up (the
 * receipts sum to the bottom line), and the results are printed as a small
 * balance table to compare with the engine simulations.
 *
 *   npx playwright test -c ports/long-haul --project=playtest
 */
const SEEDS = [11, 23, 37, 41, 59, 67];

function cents(text: string): number {
  const negative = /[−-]/.test(text);
  const value = Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);
  return negative ? -value : value;
}

for (const seed of SEEDS) {
  test(`a Single Haul with oranges, seed ${seed}`, async ({ page }) => {
    await openGame(page, {
      seed,
      settings: { rhythm: 'legs', view: seed % 2 === 0 ? 'cab' : 'diorama' },
    });
    await press(page, '[data-choice="single"]');
    await press(page, '.choice--oranges');
    await pressButton(page, 'Choose a route');
    await run(page, 300);
    await pressButton(page, 'Hit the road');
    const log = await driveToTheEnd(page);

    const rows = await page.locator('.receipt').evaluateAll((items) =>
      items.map((item) => ({
        total: item.classList.contains('receipt--total'),
        amount: item.querySelector('.receipt__amount')?.textContent ?? '',
      })),
    );
    const total = rows.find((row) => row.total);
    expect(total, 'the receipts end in a total').toBeDefined();
    const sum = rows.filter((row) => !row.total).reduce((acc, row) => acc + cents(row.amount), 0);
    expect(sum).toBe(cents(total?.amount ?? ''));

    const verdict = (await page.locator('.ledger__verdict').textContent()) ?? '';
    const stamp = (await page.locator('.ledger__stamp').textContent()) ?? '';
    test.info().annotations.push({
      type: 'result',
      description: `seed ${seed}: ${stamp} · ${total?.amount} · ${log.stops} stops, ${log.cards} cards, asked ${log.asked}× · ${verdict.split('\n')[0]?.trim()}`,
    });
    process.stdout.write(
      `[playtest] seed ${seed}: ${stamp} ${total?.amount} (${log.stops} stops, ${log.cards} cards)\n`,
    );
  });
}
