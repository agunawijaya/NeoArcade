import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
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
 * Candidate pictures for media/ (and the Hall), at 1280 × 800: a trip in
 * both views sampled every few hours of the road, a truck stop, an event
 * card, the map, the logbook, and the other screens, saved in
 * long-haul-media/ in the system's temporary folder. The chosen ones are
 * copied into media/ by hand.
 *
 *   npx playwright test -c ports/long-haul --project=screens media
 */
// Outside test-results/, which Playwright empties at the start of every run.
const OUT = join(tmpdir(), 'long-haul-media');

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86 });
}

test.use({ viewport: { width: 1280, height: 800 } });

for (const view of ['diorama', 'cab'] as const) {
  test(`a trip in the ${view} view`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openGame(page, {
      settings: { view, rhythm: 'realtime', warp: 1, eventPause: 'major' },
      theme: 'dark',
    });
    await startSingleHaul(page);
    for (let sample = 0; sample < 18; sample++) {
      await run(page, 9000);
      const state = await page.evaluate(() => ({
        card: document.querySelector('.event-card:not([hidden])') !== null,
        ask: document.querySelector('.ask-stop:not([hidden])') !== null,
        screen: document.body.dataset.screen,
      }));
      await shot(
        page,
        `${view}-${String(sample).padStart(2, '0')}${state.card ? '-card' : ''}${state.screen === 'stop' ? '-stop' : ''}`,
      );
      if (state.screen === 'ledger') break;
      if (state.card) await press(page, '.event-card__go');
      if (state.ask) await press(page, '.ask-stop .button--primary');
      if (state.screen === 'stop') {
        await press(page, '.stop__leave');
        await run(page, 200);
        if ((await page.evaluate(() => document.body.dataset.screen)) === 'stop')
          await press(page, '.stop__leave');
      }
      if (sample === 6) {
        await page.keyboard.press('m');
        await run(page, 600);
        await shot(page, `${view}-map`);
        await page.keyboard.press('m');
        await run(page, 300);
      }
    }
  });
}

test('the logbook and the menus', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openGame(page, {
    settings: { rhythm: 'legs' },
    theme: 'light',
    storage: {
      postcards: [
        'barstow',
        'needles',
        'flagstaff',
        'gallup',
        'albuquerque',
        'amarillo',
        'state:AZ',
        'state:NM',
        'state:TX',
        'oklahoma-city',
        'cajon-pass',
        'kingman',
      ],
    },
  });
  await shot(page, 'title-light');
  await press(page, '[data-choice="single"]');
  await press(page, '.choice--oranges');
  await pressButton(page, 'Choose a route');
  await run(page, 300);
  await pressButton(page, 'Hit the road');
  await driveToTheEnd(page);
  await run(page, 200);
  await page.waitForTimeout(3200);
  // A badge toast would cover the heading; the picture is of the logbook.
  await page.evaluate(() => document.querySelector('.neo-toasts')?.setAttribute('hidden', ''));
  await shot(page, 'ledger-light');
  await page.evaluate(() => document.querySelector('.neo-toasts')?.removeAttribute('hidden'));
  await press(page, '.ledger__actions .button:not(.button--primary)');
  await runUntil(page, () => document.body.dataset.screen === 'title', 5000);
  await press(page, '[data-choice="album"]');
  await run(page, 600);
  await press(page, '.album__tile:not(.album__tile--blank)');
  await run(page, 400);
  await shot(page, 'postcard-light');
  await press(page, '.album__close');
  await press(page, 'section:not([hidden]) [aria-label="Back to the title"]');
  await press(page, '[data-choice="career"]');
  await pressButton(page, 'Start a career');
  await run(page, 300);
  await shot(page, 'career-light');
});

test('the original’s text mode', async ({ page }) => {
  await openGame(page, { settings: { textMode: true } });
  await startSingleHaul(page);
  for (let turn = 0; turn < 14; turn++) {
    const prompt = (await page.locator('.crt__prompt-text').textContent()) ?? '';
    if (prompt.includes('Do you want to stop')) await page.keyboard.press('y');
    else if (prompt.includes('sleep') || prompt.includes('buy')) await page.keyboard.press('n');
    else {
      await page.locator('.crt__input').fill(prompt.includes('gallons') ? '' : '58');
      await page.keyboard.press('Enter');
    }
  }
  await shot(page, 'text-mode');
});
