import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import {
  openGame,
  press,
  pressButton,
  run,
  runUntil,
  startSingleHaul,
  type OpenOptions,
} from './helpers';

/**
 * Screenshots of every screen at the four sizes the art direction checks
 * (1440 × 900, 1280 × 720, 1024 × 768 and a landscape phone), day and night.
 * They land in long-haul-screens/ in the system's temporary folder; the
 * best go into media/ by hand.
 *
 *   npx playwright test -c ports/long-haul --project=screens
 */
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 720 },
  { name: '1024', width: 1024, height: 768 },
  { name: 'phone', width: 844, height: 390 },
] as const;
const THEMES = ['dark', 'light'] as const;
// Outside test-results/, which Playwright empties at the start of every run.
const OUT = join(tmpdir(), 'long-haul-screens');

const POSTCARDS = [
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
  'denver',
  'cajon-pass',
];

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

async function open(
  page: Page,
  size: (typeof SIZES)[number],
  theme: 'dark' | 'light',
  options: OpenOptions = {},
) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.emulateMedia({ colorScheme: theme });
  await openGame(page, { theme, storage: { postcards: POSTCARDS }, ...options });
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    const tag = `${size.name}-${theme}`;

    test(`menus ${tag}`, async ({ page }) => {
      await open(page, size, theme);
      await shot(page, `title-${tag}`);
      await press(page, '[data-choice="single"]');
      await run(page, 300);
      await shot(page, `dispatch-${tag}`);
      await pressButton(page, 'Choose a route');
      await run(page, 600);
      await shot(page, `planner-${tag}`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await press(page, '[data-choice="career"]');
      await pressButton(page, 'Start a career');
      await run(page, 300);
      await shot(page, `career-${tag}`);
      await page.keyboard.press('Escape');
      await press(page, '[data-choice="daily"]');
      await run(page, 300);
      await shot(page, `daily-${tag}`);
      await page.keyboard.press('Escape');
      await press(page, '[data-choice="album"]');
      await run(page, 800);
      await shot(page, `album-${tag}`);
      await press(page, '.album__tile:not(.album__tile--blank)');
      await run(page, 300);
      await shot(page, `postcard-${tag}`);
    });

    for (const view of ['diorama', 'cab'] as const) {
      test(`on the road ${view} ${tag}`, async ({ page }) => {
        await open(page, size, theme, { settings: { view, rhythm: 'realtime', warp: 1 } });
        await startSingleHaul(page);
        await run(page, 5000);
        await shot(page, `drive-${view}-early-${tag}`);
        // On into the first night.
        await runUntil(
          page,
          () =>
            document.querySelector('.event-card:not([hidden]), .ask-stop:not([hidden])') !== null ||
            document.body.dataset.screen === 'stop',
          60_000,
        );
        await shot(page, `drive-${view}-moment-${tag}`);
        if (await page.locator('.event-card:not([hidden])').count())
          await press(page, '.event-card__go');
        if (await page.locator('.ask-stop:not([hidden])').count())
          await press(page, '.ask-stop .button--primary');
        await runUntil(page, () => document.body.dataset.screen === 'stop', 120_000).catch(
          () => undefined,
        );
        if ((await page.evaluate(() => document.body.dataset.screen)) === 'stop') {
          await run(page, 500);
          await shot(page, `stop-${view}-${tag}`);
          await press(page, '.stop__leave');
        }
        await page.keyboard.press('m');
        await run(page, 600);
        await shot(page, `map-${view}-${tag}`);
      });
    }
  }
}
