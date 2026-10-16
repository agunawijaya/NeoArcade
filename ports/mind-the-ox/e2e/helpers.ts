import type { Page } from '@playwright/test';
import type { Progress } from '../src/progress';
import type { Settings } from '../src/settings';

/**
 * Helpers shared by the browser tests.
 *
 * The page runs on Playwright's fake clock, kept paused: tests move time on
 * themselves, so a screenshot lands on an exact frame and a whole game can
 * be flown faster than real time. The page publishes what it is doing on
 * <body> (data-screen, data-mode, data-phase, data-round, and data-score
 * and data-won on the results) for tests to sync to.
 */
/** Daily Sortie #2, in the afternoon UTC. */
export const CLOCK_START = new Date('2026-10-16T14:00:00Z');
export const FRAME_MS = 1000 / 60;

export interface OpenOptions {
  settings?: Partial<Settings>;
  progress?: Partial<Progress>;
  seed?: number;
  /** Fly the first plane with the scripted pilot. */
  bot?: boolean;
  light?: 'light' | 'dark';
}

export async function openGame(page: Page, options: OpenOptions = {}) {
  await page.clock.install({ time: CLOCK_START });
  await page.clock.pauseAt(new Date(CLOCK_START.getTime() + 1000));
  await page.addInitScript(
    ({ settings, progress, light }) => {
      localStorage.setItem('neoarcade:mind-the-ox:settings', JSON.stringify(settings));
      if (progress)
        localStorage.setItem(
          'neoarcade:mind-the-ox:progress',
          JSON.stringify({
            version: 1,
            chapters: {},
            hangarFound: false,
            classicBest: 0,
            dogfightWins: {},
            ...progress,
          }),
        );
      if (light) localStorage.setItem('neoarcade:mind-the-ox:theme', JSON.stringify(light));
    },
    { settings: options.settings ?? {}, progress: options.progress, light: options.light },
  );
  const query = new URLSearchParams({ seed: String(options.seed ?? 5) });
  if (options.bot) query.set('pilot', 'bot');
  await page.goto(`./?${query.toString()}`);
  await advance(page, 400);
}

/** Lets the page run for this long on the fake clock. */
export async function advance(page: Page, ms: number) {
  await page.clock.runFor(ms);
}

/** Runs the clock in slices until the body says so, or gives up after `limitMs` of game time. */
export async function runUntil(
  page: Page,
  attribute: string,
  value: string,
  limitMs: number,
  sliceMs = 2000,
): Promise<boolean> {
  for (let elapsed = 0; elapsed < limitMs; elapsed += sliceMs) {
    const now = await page.evaluate((name) => document.body.dataset[name], attribute);
    if (now === value) return true;
    await page.clock.runFor(sliceMs);
  }
  return (await page.evaluate((name) => document.body.dataset[name], attribute)) === value;
}
