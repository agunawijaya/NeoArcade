import type { Page } from '@playwright/test';
import { defaultSettings, type Settings } from '../src/settings';

/**
 * Helpers shared by the browser tests.
 *
 * The page runs on Playwright's fake clock, kept paused: tests move time on
 * themselves, so a screenshot lands on an exact frame and a whole trip can be
 * driven faster than real time. The game publishes where it is on <body>
 * (data-screen and data-phase) for tests to sync to.
 */
/** Daily Haul #1, in the evening UTC. */
export const CLOCK_START = new Date('2026-10-04T18:00:00Z');
export const FRAME_MS = 1000 / 60;

export interface OpenOptions {
  settings?: Partial<Settings>;
  seed?: number;
  theme?: 'light' | 'dark';
  /** Anything else to put in the game's store first, by key. */
  storage?: Record<string, unknown>;
}

export async function openGame(page: Page, options: OpenOptions = {}) {
  await page.clock.install({ time: CLOCK_START });
  await page.clock.pauseAt(new Date(CLOCK_START.getTime() + 1000));
  await page.addInitScript(
    ({ settings, theme, storage }) => {
      // Only on the first load: a test that reloads keeps what the game saved.
      if (sessionStorage.getItem('stored')) return;
      sessionStorage.setItem('stored', 'yes');
      localStorage.setItem('neoarcade:long-haul:settings', JSON.stringify(settings));
      if (theme) localStorage.setItem('neoarcade:long-haul:theme', JSON.stringify(theme));
      for (const [key, value] of Object.entries(storage)) {
        localStorage.setItem(`neoarcade:long-haul:${key}`, JSON.stringify(value));
      }
    },
    {
      settings: { ...defaultSettings(), ...options.settings },
      theme: options.theme,
      storage: options.storage ?? {},
    },
  );
  await page.goto(`./?seed=${options.seed ?? 1982}`);
  await runUntil(page, () => document.body.dataset.screen === 'title');
  // Past the original's green box: any key skips it.
  await page.keyboard.press('Shift');
  await run(page, 600);
}

/** Moves game time on. */
export async function run(page: Page, milliseconds: number) {
  await page.clock.runFor(Math.max(FRAME_MS, milliseconds));
}

/** Moves game time on until the page reports what we are waiting for. */
export async function runUntil(page: Page, check: () => boolean, limitMs = 240_000, stepMs = 200) {
  for (let elapsed = 0; elapsed <= limitMs; elapsed += stepMs) {
    if (await page.evaluate(check)) return;
    await page.clock.runFor(stepMs);
  }
  throw new Error(`Gave up waiting after ${limitMs} ms of game time.`);
}

/** Clicks a control while the clock is paused, without waiting for animations to settle. */
export async function press(page: Page, selector: string) {
  await page.locator(selector).first().click({ force: true });
}

export async function pressButton(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).first().click({ force: true });
}

/** From the title to the road: Single Haul with the dispatch sheet's choices, the first route. */
export async function startSingleHaul(page: Page) {
  await press(page, '[data-choice="single"]');
  await pressButton(page, 'Choose a route');
  await run(page, 300);
  await pressButton(page, 'Hit the road');
  await runUntil(
    page,
    () => document.body.dataset.screen === 'drive' || document.body.dataset.screen === 'text',
    10_000,
  );
}

export interface DriveLog {
  stops: number;
  cards: number;
  asked: number;
}

/**
 * Plays the trip to its end the way a sensible player would: reads each
 * card and carries on, pulls in when the game asks, fills the tank, sleeps
 * when tired, takes the suggested speed on each leg. Returns when the
 * logbook is up.
 */
export async function driveToTheEnd(page: Page, limitMs = 1_200_000): Promise<DriveLog> {
  const log: DriveLog = { stops: 0, cards: 0, asked: 0 };
  for (let elapsed = 0; elapsed <= limitMs; elapsed += 250) {
    const state = await page.evaluate(() => {
      const shown = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        return Boolean(element && !element.closest('[hidden]') && element.offsetParent !== null);
      };
      return {
        screen: document.body.dataset.screen,
        card: shown('.event-card'),
        ask: shown('.ask-stop'),
        leg: shown('.leg-panel'),
      };
    });
    if (state.screen === 'ledger') return log;
    if (state.screen === 'stop') {
      log.stops++;
      const pump = page.locator('.stop__panel .button--primary:not(.stop__leave):not([disabled])');
      if (await pump.count()) await pump.first().click({ force: true });
      await press(page, '.stop__leave');
      // After a night's sleep with a reefer the stop asks about the tank once more.
      await run(page, 100);
      if ((await page.evaluate(() => document.body.dataset.screen)) === 'stop')
        await press(page, '.stop__leave');
      continue;
    }
    if (state.card) {
      log.cards++;
      await press(page, '.event-card__go');
      continue;
    }
    if (state.ask) {
      log.asked++;
      await press(page, '.ask-stop .button--primary');
      continue;
    }
    if (state.leg) {
      await press(page, '.leg-panel .button--primary');
      continue;
    }
    await page.clock.runFor(250);
  }
  throw new Error(`The trip did not end within ${limitMs} ms of game time.`);
}
