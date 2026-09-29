import type { Page } from '@playwright/test';
import { createRng } from '@shared/rng';
import { createCpuMemory, observeThrow, planThrow, thinkingSeconds } from '../src/engine/ai';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../src/engine/constants';
import type { Point } from '../src/engine/geometry';
import { createMatch, startNextRound, takeTurn, type MatchState } from '../src/engine/match';
import { simulateShot, type ShotRecord } from '../src/engine/shot';
import { tourSetup } from '../src/game/setup';
import { defaultSettings, matchOptionsFrom, type Settings } from '../src/settings';
import type { Stage } from '../src/tour/stages';
import { DEFAULT_OUTFITS } from '../src/wardrobe/items';

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

/**
 * Opens the game on its title screen with these settings (and anything else
 * put in storage first, such as a World Tour save), its cities seeded, on a
 * paused clock set to `time`.
 */
export async function openGame(
  page: Page,
  settings: Settings,
  seed: number,
  storage: Record<string, unknown> = {},
  time: Date = CLOCK_START,
) {
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  const entries = { 'neoarcade:skyline-showdown:settings': settings, ...storage };
  await page.addInitScript((stored) => {
    // Only on the first load: a test that reloads keeps what the game saved.
    if (sessionStorage.getItem('stored')) return;
    sessionStorage.setItem('stored', 'yes');
    for (const [key, value] of Object.entries(JSON.parse(stored) as Record<string, unknown>)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, JSON.stringify(entries));
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

/** Starts a Quick Match with the stored settings. */
export async function startFromTitle(page: Page) {
  // The clock is paused, so skip Playwright's wait for animations to settle.
  await page.getByRole('button', { name: 'Quick Match', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'Start match' }).click({ force: true });
  await runUntilPhase(page, 'aim');
}

/** From the title: the World Tour map, a stop's card, and its first throw. */
export async function playTourStage(page: Page, stage: string) {
  await page.locator('.title__tour').click({ force: true });
  await page.locator(`[data-stage="${stage}"]`).click({ force: true });
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
          hazards: round.hazards,
        },
        { thrower: state.turn, angle, velocity, powerUp: null },
      );
      if (accept(shot)) return { angle, velocity, shot };
    }
  }
  return null;
}

export interface WinPlan {
  seed: number;
  throws: { angle: number; velocity: number }[];
}

/**
 * A seed where player 1 can win a tour stage without ever being hit: a sure
 * hit found for every one of its turns, while the rival's own throws
 * (planned exactly as the page plans them) all miss.
 */
export function planFlawlessWin(stage: Stage, settings: Settings): WinPlan {
  for (let seed = 1; seed < 300; seed++) {
    const setup = tourSetup(stage, settings, seed, DEFAULT_OUTFITS[0]);
    const rival = setup.players[1].cpu;
    if (!rival) throw new Error('A tour stage always has a rival.');
    const state = createMatch(setup.match);
    const memory = createCpuMemory();
    const rng = createRng(seed ^ 0x5eed);
    const throws: WinPlan['throws'] = [];
    let spoiled = false;
    while (!spoiled && statusOf(state) !== 'matchOver') {
      if (state.turn === 0) {
        const hit = findThrow(state, (shot) => shot.victim === 1);
        if (!hit) {
          spoiled = true;
          break;
        }
        throws.push({ angle: hit.angle, velocity: hit.velocity });
        takeTurn(state, hit);
      } else {
        const aim = planThrow(state, memory, rival.level, rng, rival.style);
        thinkingSeconds(rival.level, rng);
        const result = takeTurn(state, aim);
        observeThrow(memory, aim, result.shot, state);
        if (result.scorer === 1) spoiled = true;
      }
      if (statusOf(state) === 'roundOver') startNextRound(state);
    }
    if (!spoiled && state.winner === 0) return { seed, throws };
  }
  throw new Error(`No flawless win found in ${stage.city}.`);
}

/** Reads the status through a function, since takeTurn changes it behind TypeScript's back. */
function statusOf(state: MatchState): MatchState['status'] {
  return state.status;
}

/** Types each planned throw on the player's turns, skipping the replays, until the results. */
export async function playPlan(page: Page, plan: WinPlan) {
  for (const aim of plan.throws) {
    await runUntil(
      page,
      () => document.body.dataset.phase === 'aim' && document.body.dataset.turn === '0',
      '',
      180_000,
    );
    await typeThrow(page, aim.angle, aim.velocity);
    await runUntilPhase(page, 'replay', 180_000);
    await page.locator('.hud__replay').click({ force: true });
  }
  await runUntil(page, () => !document.querySelector<HTMLElement>('.overlay--results')?.hidden, '');
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
