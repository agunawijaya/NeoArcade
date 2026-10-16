import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import type { PoliceStops } from '../src/settings';
import { openGame, press, pressButton, run, runUntil } from './helpers';

/**
 * A police stop in the real game, photographed at every step: the lights in
 * the mirror, the overtake, pulling over, the trooper at the window, the
 * ticket, the hearing, back on the road, and for a fourth offence the jail
 * and the revoked licence. Each run is a Single Haul of oranges driven
 * gently until a set hour, then flat out until the patrol catches it; the
 * seeds and hours are ones known to end in a stop. Both views, both
 * themes, three sizes, at night and at dusk; the art bench poses any step
 * in any weather (dev/art, ?stop=officer&at=3&condition=rain). The shots land in
 * long-haul-police/ in the system's temporary folder; the best go into
 * media/ by hand.
 *
 *   npx playwright test -c ports/long-haul --project=screens police
 */
const OUT = join(tmpdir(), 'long-haul-police');

interface StopRun {
  name: string;
  seed: number;
  /** The hour of the clock to put the foot down, and how hard. */
  from: string;
  mph: number;
  view: 'cab' | 'diorama';
  size: { width: number; height: number };
  theme: 'dark' | 'light';
  stops: PoliceStops;
  /** A stop has been seen before, so it may be skipped. */
  seen?: boolean;
  /** Stops to photograph before the run ends. */
  count?: number;
}

const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1280, height: 720 };
const PHONE = { width: 844, height: 390 };

const RUNS: StopRun[] = [
  {
    name: 'night-cab',
    seed: 7,
    from: '8 PM',
    mph: 79,
    view: 'cab',
    size: LAPTOP,
    theme: 'dark',
    stops: 'full',
  },
  {
    name: 'night-side',
    seed: 7,
    from: '8 PM',
    mph: 79,
    view: 'diorama',
    size: LAPTOP,
    theme: 'dark',
    stops: 'full',
  },
  {
    name: 'night-cab-wide',
    seed: 7,
    from: '8 PM',
    mph: 79,
    view: 'cab',
    size: DESKTOP,
    theme: 'light',
    stops: 'full',
  },
  {
    name: 'night-side-wide',
    seed: 7,
    from: '8 PM',
    mph: 79,
    view: 'diorama',
    size: DESKTOP,
    theme: 'light',
    stops: 'full',
  },
  {
    name: 'dusk-cab-phone',
    seed: 13,
    from: '5 PM',
    mph: 79,
    view: 'cab',
    size: PHONE,
    theme: 'light',
    stops: 'full',
  },
  {
    name: 'dusk-side-phone',
    seed: 13,
    from: '5 PM',
    mph: 79,
    view: 'diorama',
    size: PHONE,
    theme: 'dark',
    stops: 'full',
  },
  {
    name: 'jail-short',
    seed: 7,
    from: '11 AM',
    mph: 82,
    view: 'diorama',
    size: LAPTOP,
    theme: 'dark',
    stops: 'short',
    seen: true,
    count: 4,
  },
];

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

function hourOf(clock: string): number | null {
  const match = /(\d+)(?::\d+)?\s*(AM|PM)/.exec(clock);
  if (!match) return null;
  return (Number(match[1]) % 12) + (match[2] === 'PM' ? 12 : 0);
}

async function setLever(page: Page, mph: number) {
  await page.evaluate((value) => {
    const lever = document.querySelector<HTMLInputElement>('.throttle__lever');
    if (!lever || lever.disabled || Number(lever.value) === value) return;
    lever.value = String(value);
    lever.dispatchEvent(new Event('input', { bubbles: true }));
  }, mph);
}

async function readRoad(page: Page) {
  return page.evaluate(() => {
    const shown = (selector: string) => {
      const element = document.querySelector(selector);
      return Boolean(element && !element.closest('[hidden]'));
    };
    return {
      screen: document.body.dataset.screen,
      card: shown('.event-card'),
      ask: shown('.ask-stop'),
      police: shown('.police'),
      caption: document.querySelector('.police__caption')?.textContent ?? '',
      ticket: shown('.citation__go'),
      licence: document.querySelector('.jail__go:not([disabled])') !== null,
      clock: document.querySelector('.hud__clock')?.textContent ?? '',
    };
  });
}

for (const stopRun of RUNS) {
  test(`a police stop: ${stopRun.name}`, async ({ page }) => {
    await page.setViewportSize(stopRun.size);
    await page.emulateMedia({ colorScheme: stopRun.theme });
    await openGame(page, {
      seed: stopRun.seed,
      theme: stopRun.theme,
      settings: {
        view: stopRun.view,
        rhythm: 'realtime',
        warp: 1,
        eventPause: 'major',
        policeStops: stopRun.stops,
      },
      storage: stopRun.seen ? { 'stops-seen': true } : {},
    });
    await press(page, '[data-choice="single"]');
    await run(page, 300);
    await press(page, '.choice--oranges');
    await pressButton(page, 'Choose a route');
    await run(page, 300);
    await pressButton(page, 'Hit the road');
    await runUntil(page, () => document.body.dataset.screen === 'drive', 10_000);

    let flatOut = false;
    let caption = '';
    let inStep = 0;
    let stops = 0;
    const name = (label: string) => `${stopRun.name}-${String(stops + 1)}-${label}`;
    for (let step = 0; step < 8000; step++) {
      const road = await readRoad(page);
      if (road.screen === 'ledger') {
        await shot(page, name('ledger'));
        return;
      }
      if (road.screen === 'stop') {
        const pump = page.locator(
          '.stop__panel .button--primary:not(.stop__leave):not([disabled])',
        );
        if (await pump.count()) await pump.first().click({ force: true });
        await press(page, '.stop__leave');
        await run(page, 100);
        if ((await page.evaluate(() => document.body.dataset.screen)) === 'stop')
          await press(page, '.stop__leave');
        continue;
      }
      if (road.ask) {
        await press(page, '.ask-stop .button--primary');
        continue;
      }
      if (road.police) {
        // Two pictures a step: as it begins and a moment in.
        if (road.caption !== caption) {
          caption = road.caption;
          inStep = 0;
        }
        const slug = caption.toLowerCase().replace(/[^a-z]+/g, '-');
        if (inStep === 0 || inStep === 3)
          await shot(page, name(`${slug}${inStep ? '-later' : ''}`));
        inStep++;
        if (road.ticket) {
          await run(page, 1200);
          await shot(page, name('ticket'));
          await press(page, '.citation__go');
        }
        if (road.licence) {
          await shot(page, name('licence'));
          await press(page, '.jail__go');
        }
        await run(page, 600);
        continue;
      }
      if (caption) {
        caption = '';
        stops++;
        await run(page, 1500);
        await shot(page, `${stopRun.name}-${String(stops)}-after`);
        if (stops >= (stopRun.count ?? 1)) return;
      }
      if (road.card) {
        await press(page, '.event-card__go');
        continue;
      }
      if (!flatOut && hourOf(road.clock) === hourOf(stopRun.from)) flatOut = true;
      if (flatOut) await setLever(page, stopRun.mph);
      await run(page, 250);
    }
    throw new Error('No police stop came along.');
  });
}
