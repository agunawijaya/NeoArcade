import type { Page } from '@playwright/test';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../src/engine/constants';
import type { Point } from '../src/engine/geometry';
import { createMatch, startNextRound, takeTurn, type MatchState } from '../src/engine/match';
import { simulateShot, type ShotRecord } from '../src/engine/shot';
import { defaultSettings, matchOptionsFrom, type Settings } from '../src/settings';

/**
 * Helpers shared by the browser tests.
 *
 * The page runs on Playwright's fake clock, kept paused: tests move time
 * forward themselves, so a screenshot lands on an exact frame and a whole
 * match can be played faster than real time.
 *
 * The game is also deterministic for a seed, so a test can rebuild the same
 * match in Node, work out a throw with the engine and type it into the page.
 */
const CLOCK_START = new Date('2026-09-25T18:00:00Z');
const FRAME_MS = 1000 / 60;

export function testSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...defaultSettings(),
    players: 'humanVsHuman',
    aiming: 'typed',
    powerUps: false,
    names: ['Ada', 'Grace'],
    ...overrides,
  };
}

export async function openGame(page: Page, settings: Settings, seed: number) {
  await page.clock.install({ time: CLOCK_START });
  await page.clock.pauseAt(new Date(CLOCK_START.getTime() + 1000));
  await page.addInitScript((stored) => {
    localStorage.setItem('neoarcade:skyline-showdown:settings', stored);
  }, JSON.stringify(settings));
  await page.goto(`./?seed=${seed}`);
  await runUntil(page, (screen) => document.body.dataset.screen === screen, 'title');
}

/** Moves game time on, frame by frame. */
export async function run(page: Page, milliseconds: number) {
  await page.clock.runFor(Math.max(FRAME_MS, milliseconds));
}

/** Moves game time on until the page reports what we are waiting for. */
export async function runUntil(
  page: Page,
  check: (argument: string) => boolean,
  argument: string,
  limitMs = 120_000,
) {
  for (let elapsed = 0; elapsed <= limitMs; elapsed += 200) {
    if (await page.evaluate(check, argument)) return;
    await page.clock.runFor(200);
  }
  throw new Error(`Gave up waiting after ${limitMs} ms of game time.`);
}

export async function runUntilPhase(page: Page, phase: string, limitMs = 120_000) {
  await page.clock.runFor(FRAME_MS);
  await runUntil(page, (wanted) => document.body.dataset.phase === wanted, phase, limitMs);
}

export async function startFromTitle(page: Page) {
  // The clock is paused, so skip Playwright's wait for animations to settle.
  await page.getByRole('button', { name: 'Play', exact: true }).click({ force: true });
  await runUntilPhase(page, 'aim');
}

/** Types a throw the way the original asked for it. */
export async function typeThrow(page: Page, angle: number, velocity: number) {
  await page.keyboard.type(String(angle));
  await page.keyboard.press('Enter');
  await page.keyboard.type(String(velocity));
  await page.keyboard.press('Enter');
}

/** The same match the page is playing, rebuilt in Node. */
export function mirrorMatch(settings: Settings, seed: number): MatchState {
  return createMatch(matchOptionsFrom(settings, seed));
}

export function mirrorThrow(state: MatchState, angle: number, velocity: number) {
  return takeTurn(state, { angle, velocity });
}

export function mirrorNextRound(state: MatchState) {
  startNextRound(state);
}

/** Searches for a throw by whoever's turn it is whose shot passes the test. */
export function findThrow(
  state: MatchState,
  accept: (shot: ShotRecord) => boolean,
  angles: readonly number[] = range(30, 75, 1),
): { angle: number; velocity: number; shot: ShotRecord } | null {
  const { round } = state;
  for (const angle of angles) {
    for (let velocity = 20; velocity <= 160; velocity++) {
      const shot = simulateShot(
        {
          terrain: round.terrain,
          gorillas: round.gorillas,
          wind: round.wind,
          gravity: round.world.gravity,
          balloon: round.balloon,
          shields: round.shields,
        },
        { thrower: state.turn, angle, velocity, powerUp: null },
      );
      if (accept(shot)) return { angle, velocity, shot };
    }
  }
  return null;
}

export function range(from: number, to: number, step: number): number[] {
  const values = [];
  for (let value = from; value <= to; value += step) values.push(value);
  return values;
}

/** Where a world point appears on screen while the camera is at rest. */
export function onScreen(point: Point, viewport: { width: number; height: number }): Point {
  const scale = Math.min(viewport.width / WORLD_WIDTH, viewport.height / WORLD_HEIGHT);
  return {
    x: (viewport.width - WORLD_WIDTH * scale) / 2 + point.x * scale,
    y: viewport.height - WORLD_HEIGHT * scale + point.y * scale,
  };
}
