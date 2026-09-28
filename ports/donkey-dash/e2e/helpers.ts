import type { Page } from '@playwright/test';
import type { ModeId, Settings } from '../src/settings';

/**
 * Helpers shared by the browser tests.
 *
 * The page runs on Playwright's fake clock, kept paused: tests move time on
 * themselves, so a screenshot lands on an exact frame and a whole run can be
 * driven faster than real time. The session publishes what it is doing on
 * <body> (data-screen, data-phase, data-step, data-lane) for tests to sync to.
 */
/** Daily Road #7, in the evening UTC. */
export const CLOCK_START = new Date('2026-10-04T18:00:00Z');
export const FRAME_MS = 1000 / 60;

export interface OpenOptions {
  settings?: Partial<Settings>;
  seed?: number;
  /** Every Road Trip leg finished, so every route is open. */
  allRoutes?: boolean;
  theme?: 'light' | 'dark';
}

export async function openGame(page: Page, options: OpenOptions = {}) {
  await page.clock.install({ time: CLOCK_START });
  await page.clock.pauseAt(new Date(CLOCK_START.getTime() + 1000));
  await page.addInitScript(
    ({ settings, allRoutes, theme }) => {
      localStorage.setItem('neoarcade:donkey-dash:settings', JSON.stringify(settings));
      if (theme) localStorage.setItem('neoarcade:donkey-dash:theme', JSON.stringify(theme));
      if (allRoutes) {
        const legs: Record<string, unknown> = {};
        for (const route of ['farm', 'mountain', 'desert', 'night', 'snow']) {
          for (let leg = 0; leg < 3; leg++) {
            legs[`${route}-${leg}`] = { stars: [true, leg !== 1, leg === 0], bestScore: 1000 };
          }
        }
        localStorage.setItem(
          'neoarcade:donkey-dash:progress',
          JSON.stringify({ version: 1, legs, donkeyStreak: 0 }),
        );
      }
    },
    {
      settings: { camera: 'chase', ...options.settings },
      allRoutes: options.allRoutes ?? false,
      theme: options.theme,
    },
  );
  await page.goto(`./?seed=${options.seed ?? 5}`);
  await runUntil(page, () => document.body.dataset.screen === 'title');
  // Past the 1981 title box.
  await run(page, 2600);
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

export async function startMode(page: Page, mode: ModeId) {
  // The clock is paused, so skip Playwright's wait for animations to settle.
  await page.locator(`[data-mode="${mode}"]`).click({ force: true });
}

export async function untilPlaying(page: Page) {
  await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 50);
}

export async function untilResults(page: Page, limitMs = 400_000) {
  await runUntil(page, () => document.body.dataset.phase === 'results', limitMs, 1000);
}

export function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
