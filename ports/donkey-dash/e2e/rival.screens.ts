import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { createAutopilot } from '../src/engine/autopilot';
import type { Drive } from '../src/engine/drive';
import { endlessRun } from '../src/engine/modes';
import { closingLaneAt } from '../src/engine/road';
import {
  AHEAD_DISTANCE,
  createRival,
  NO_INPUT,
  rivalMatch,
  stepRival,
  type RivalEvent,
} from '../src/engine/rival';
import {
  createRivalDriver,
  CPU_STYLES,
  type CpuLevel,
  type DriverStyle,
} from '../src/engine/rival-cpu';
import { createRun, stepRun, type RunConfig } from '../src/engine/run';
import { RIVAL_MOVES } from '../src/game/controls';
import {
  DEFAULT_RIVAL_KEYS,
  defaultSettings,
  type CameraView,
  type Settings,
} from '../src/settings';
import { driveTo, openGame, run, runUntil, startMode, type OpenOptions } from './helpers';

/**
 * Screenshots of the shifting road and Rival Driver, for art direction and
 * the docs: a lane closing ahead, a car that stayed in it too long, a trap
 * being sprung, a surge Ahead from start to drop back, a door shut, the
 * results, and the touch pads on a phone held sideways.
 * As in art.screens.ts, every moment is reached by playing: the presses are
 * worked out in Node and replayed into the page.
 *
 *   SCREENSHOT_DIR=somewhere npx playwright test -c ports/donkey-dash --project=screens
 */
const outputDir =
  process.env.SCREENSHOT_DIR ?? join(import.meta.dirname, '..', 'test-results', 'screens');
mkdirSync(outputDir, { recursive: true });

const SIZES = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1024, height: 768 },
  landscape: { width: 844, height: 390 },
  portrait: { width: 390, height: 844 },
} as const;
type SizeName = keyof typeof SIZES;
const VIEWS: CameraView[] = ['chase', 'classic', 'iso'];

const shoot = (page: Page, name: string) =>
  page.screenshot({ path: join(outputDir, `${name}.jpg`), type: 'jpeg', quality: 86 });

async function openAt(
  page: Page,
  size: SizeName,
  theme: 'light' | 'dark',
  options: OpenOptions = {},
) {
  await page.setViewportSize(SIZES[size]);
  await page.emulateMedia({ colorScheme: theme });
  await openGame(page, { theme, ...options });
}

/** Whether the car is in a lane that is closing, or that closes ahead of it. */
function inEndingLane(drive: Drive): boolean {
  const { car, road } = drive;
  if (closingLaneAt(road, car.nose) === car.lane) return true;
  return road.changes.some(
    (change) => change.closes === car.lane && change.barrier !== null && change.barrier > car.nose,
  );
}

/**
 * A good driver who leaves an ending lane late (or never, with `stubborn`).
 * Returns its presses and the first step at which a barrier `distance` metres
 * ahead closes the lane the car is still in, or the step of a barrier crash.
 */
function planLaneEnd(config: RunConfig, distance: number | null, stubborn = false) {
  const game = createRun(config);
  const pilot = createAutopilot({ reactionSeconds: 0.25, pressGap: 0.14 });
  const presses: number[] = [];
  while (game.drive.steps < 60 * 150 && game.phase.kind !== 'over') {
    const { drive } = game;
    const barrier = drive.hazards.find(
      (hazard) => hazard.kind === 'barrier' && hazard.lane === drive.car.lane && !hazard.passed,
    );
    const gap = barrier ? barrier.position - drive.car.nose : Infinity;
    if (distance !== null && barrier && Math.abs(gap - distance) < 0.4 && drive.steps > 300) {
      return { presses, step: drive.steps };
    }
    // Late, or never: stay put in an ending lane until the barrier is close.
    const holding = inEndingLane(drive) && (stubborn || gap > 9);
    const press = game.phase.kind === 'drive' && !holding && pilot.decide(drive);
    if (press) presses.push(drive.steps);
    const events = stepRun(game, { driver: press });
    const crash = events.find((event) => event.type === 'crash');
    if (crash && crash.type === 'crash') {
      if (distance === null && crash.hazard.kind === 'barrier') {
        return { presses, step: game.drive.steps };
      }
      return null;
    }
  }
  return null;
}

/** A good driver's presses up to the moment a new lane is widening in, `distance` metres ahead. */
function planOpening(config: RunConfig, distance: number) {
  const game = createRun(config);
  const pilot = createAutopilot({ reactionSeconds: 0.25, pressGap: 0.14 });
  const presses: number[] = [];
  while (game.drive.steps < 60 * 150 && game.phase.kind !== 'over') {
    const { drive } = game;
    const opening = drive.road.changes.find(
      (change) => change.opens !== null && Math.abs(change.at - drive.car.nose - distance) < 0.4,
    );
    if (opening && drive.steps > 300) return { presses, step: drive.steps };
    const press = game.phase.kind === 'drive' && pilot.decide(drive);
    if (press) presses.push(drive.steps);
    if (stepRun(game, { driver: press }).some((event) => event.type === 'crash')) return null;
  }
  return null;
}

/** The first seed whose road gives the moment `plan` is looking for. */
function firstSeed(plan: (seed: number) => ReturnType<typeof planLaneEnd>) {
  for (let seed = 1; seed < 400; seed++) {
    const found = plan(seed);
    if (found) return { seed, ...found };
  }
  throw new Error('No seed gave that moment.');
}

test.describe('the shifting road', () => {
  for (const camera of VIEWS) {
    for (const [size, theme] of [
      ['desktop', 'dark'],
      ['laptop', 'light'],
      ['landscape', 'dark'],
    ] as const) {
      test(`a lane closing ahead, ${camera}, ${size}, ${theme}`, async ({ page }) => {
        const { seed, presses, step } = firstSeed((candidate) =>
          planLaneEnd(endlessRun(candidate, 'normal', true, true), 10),
        );
        await openAt(page, size, theme, { seed, settings: { camera } });
        await startMode(page, 'endless');
        await driveTo(page, presses, step, () => page.keyboard.press('Space'));
        await shoot(page, `lane-end-${camera}-${size}-${theme}`);
      });
    }

    test(`a lane opening ahead, the road bending towards it, ${camera}`, async ({ page }) => {
      const { seed, presses, step } = firstSeed((candidate) =>
        planOpening(endlessRun(candidate, 'normal', true, true), 12),
      );
      await openAt(page, 'desktop', 'dark', { seed, settings: { camera } });
      await startMode(page, 'endless');
      await driveTo(page, presses, step, () => page.keyboard.press('Space'));
      await shoot(page, `lane-opening-${camera}`);
    });

    test(`a barrier crash, ${camera}`, async ({ page }) => {
      const { seed, presses, step } = firstSeed((candidate) =>
        planLaneEnd(endlessRun(candidate, 'normal', true, true), null, true),
      );
      await openAt(page, 'desktop', 'dark', { seed, settings: { camera } });
      await startMode(page, 'endless');
      await driveTo(page, presses, step, () => page.keyboard.press('Space'));
      await run(page, 520);
      await shoot(page, `barrier-crash-${camera}`);
    });
  }
});

interface RaceInput {
  step: number;
  key: string;
}

/** The first round of a Rival match in Node, the player in the left car: their presses, and what happened when. */
interface RaceLog {
  inputs: RaceInput[];
  events: { step: number; event: RivalEvent }[];
}

function playRace(seed: number, player: DriverStyle, cpu: CpuLevel): RaceLog {
  const state = createRival(rivalMatch(seed, 3));
  const me = createRivalDriver(player, 0, seed * 7);
  const rival = createRivalDriver(CPU_STYLES[cpu], 1, seed + 1);
  const log: RaceLog = { inputs: [], events: [] };
  while (state.drive.steps < 60 * 90 && state.round === 1 && state.phase.kind === 'race') {
    const mine = me.decide(state);
    const move = RIVAL_MOVES.findIndex((candidate) => mine[candidate]);
    if (move >= 0) {
      log.inputs.push({ step: state.drive.steps, key: DEFAULT_RIVAL_KEYS[0][move] as string });
    }
    for (const event of stepRival(state, [mine, rival.decide(state)])) {
      log.events.push({ step: state.drive.steps, event });
    }
  }
  return log;
}

/** The step of the first event of the player's car that `matches`, from step `after` on. */
function mine(log: RaceLog, after: number, matches: (event: RivalEvent) => boolean) {
  return log.events.find(
    ({ step, event }) => step >= after && 'car' in event && event.car === 0 && matches(event),
  )?.step;
}

/** Just after the CPU refused one of a hesitant player's moves, and the player then crashed. */
function trapIn(log: RaceLog) {
  const crash = mine(log, 0, (event) => event.type === 'crash' && event.trapped);
  if (crash === undefined) return null;
  const bump = log.events.findLast(
    ({ step, event }) =>
      step < crash && event.type === 'bump' && event.car === 0 && event.reason === 'car',
  );
  return bump ? [bump.step + 4] : null;
}

/**
 * The owner's example: boxed in, the player surges Ahead, cuts across in
 * front of the CPU and drops back on the other side. A frame from each.
 */
function slipThroughIn(log: RaceLog) {
  for (const { step: blocked, event } of log.events) {
    if (event.type !== 'bump' || event.car !== 0 || event.move !== 'lane') continue;
    const surge = mine(log, blocked, (next) => next.type === 'shift' && next.to === 'ahead');
    if (surge === undefined || surge - blocked > 90) continue;
    const cut = mine(log, surge, (next) => next.type === 'move' && next.cut);
    if (cut === undefined || cut - surge > 90) continue;
    const drop = mine(log, cut, (next) => next.type === 'shift' && next.to === 'level');
    const crash = mine(log, surge, (next) => next.type === 'crash');
    if (drop === undefined || drop - cut > 120) continue;
    if (crash !== undefined && crash < drop + 40) continue;
    return [surge + 12, cut + 8, drop + 12];
  }
  return null;
}

/** A drop back refused, the CPU sitting in the player's Level slot. */
function doorShutIn(log: RaceLog) {
  const step = mine(
    log,
    0,
    (event) => event.type === 'bump' && event.move === 'drop' && event.reason === 'car',
  );
  return step === undefined ? null : [step + 3];
}

/** A crash while riding Ahead, playing out. */
function crashAheadIn(log: RaceLog) {
  const step = mine(
    log,
    0,
    (event) => event.type === 'crash' && event.ahead >= AHEAD_DISTANCE - 0.01,
  );
  return step === undefined ? null : [step + 24];
}

/** The first seed whose match gives the moments `find` looks for, and the presses to get there. */
function findRace(player: DriverStyle, cpu: CpuLevel, find: (log: RaceLog) => number[] | null) {
  for (let seed = 1; seed < 400; seed++) {
    const log = playRace(seed, player, cpu);
    const steps = find(log);
    if (steps) return { seed, inputs: log.inputs, steps };
  }
  throw new Error('No match gave that moment.');
}

/** Opens a match against the CPU on the race's seed and shoots each of its steps, replaying the player's presses. */
async function shootRace(
  page: Page,
  race: ReturnType<typeof findRace>,
  open: { size: SizeName; theme: 'light' | 'dark'; cpu: CpuLevel; camera: CameraView },
  names: readonly string[],
) {
  await openAt(page, open.size, open.theme, {
    seed: race.seed,
    settings: rivalSettings(open.cpu, open.camera),
  });
  await page.locator('[data-rival="cpu"]').click({ force: true });
  const keys = new Map(race.inputs.map((input) => [input.step, input.key]));
  for (const [index, step] of race.steps.entries()) {
    await driveTo(
      page,
      race.inputs.map((input) => input.step),
      step,
      (at) => page.keyboard.press(keys.get(at) ?? 'KeyD'),
    );
    await shoot(page, names[index] as string);
  }
}

/** A player who surges like the Hard CPU, to show the surge off. */
const SURGER: DriverStyle = { ...CPU_STYLES.hard, blunder: 0, hesitation: 0.1 };

/** A Rival match in Node up to the moment the player's car drops back onto the road. */
function planRespawn(seed: number) {
  const state = createRival(rivalMatch(seed, 3));
  const rival = createRivalDriver(CPU_STYLES.normal, 1, seed + 1);
  for (let step = 0; step < 60 * 90 && state.round === 1 && state.phase.kind === 'race'; step++) {
    const events = stepRival(state, [NO_INPUT, rival.decide(state)]);
    if (events.some((event) => event.type === 'respawn' && event.car === 0)) {
      return state.drive.steps + 12;
    }
  }
  return null;
}

function rivalSettings(cpu: CpuLevel, camera: CameraView): Partial<Settings> {
  return { camera, rival: { ...defaultSettings().rival, cpu, opponent: 'cpu' } };
}

test.describe('Rival Driver', () => {
  for (const camera of VIEWS) {
    for (const [size, theme] of [
      ['desktop', 'dark'],
      ['landscape', 'light'],
    ] as const) {
      test(`a trap sprung, ${camera}, ${size}, ${theme}`, async ({ page }) => {
        const race = findRace({ ...CPU_STYLES.easy, blunder: 0 }, 'hard', trapIn);
        await shootRace(page, race, { size, theme, cpu: 'hard', camera }, [
          `rival-trap-${camera}-${size}-${theme}`,
        ]);
      });
    }
  }

  for (const camera of VIEWS) {
    for (const [size, theme] of [
      ['desktop', 'dark'],
      ['laptop', 'light'],
    ] as const) {
      test(`the surge: boxed in, Ahead, across and back, ${camera}, ${size}, ${theme}`, async ({
        page,
      }) => {
        const race = findRace(SURGER, 'hard', slipThroughIn);
        const names = ['surge', 'cut', 'drop'].map(
          (moment) => `surge-${moment}-${camera}-${size}-${theme}`,
        );
        await shootRace(page, race, { size, theme, cpu: 'hard', camera }, names);
      });
    }

    test(`a drop back refused, the door shut, ${camera}`, async ({ page }) => {
      const race = findRace(SURGER, 'brutal', doorShutIn);
      await shootRace(page, race, { size: 'landscape', theme: 'dark', cpu: 'brutal', camera }, [
        `surge-door-shut-${camera}`,
      ]);
    });

    test(`a crash while riding Ahead, ${camera}`, async ({ page }) => {
      const race = findRace({ ...SURGER, blunder: 0.05 }, 'hard', crashAheadIn);
      await shootRace(page, race, { size: 'laptop', theme: 'light', cpu: 'hard', camera }, [
        `surge-crash-${camera}`,
      ]);
    });
  }

  for (const camera of ['classic', 'chase'] as const) {
    test(`a crashed car dropping back onto the road, ${camera}`, async ({ page }) => {
      let seed = 1;
      let step = planRespawn(seed);
      while (step === null && seed < 100) step = planRespawn(++seed);
      if (step === null) throw new Error('Nobody ever crashed.');
      await openAt(page, 'desktop', 'light', { seed, settings: rivalSettings('normal', camera) });
      await page.locator('[data-rival="cpu"]').click({ force: true });
      await driveTo(page, [], step, async () => undefined);
      await shoot(page, `rival-comeback-${camera}`);
    });
  }

  for (const [camera, theme] of [
    ['classic', 'dark'],
    ['chase', 'light'],
  ] as const) {
    test(`racing upright on a phone, ${camera}, ${theme}`, async ({ page }) => {
      await openAt(page, 'portrait', theme, { settings: rivalSettings('hard', camera) });
      await page.locator('[data-rival="cpu"]').click({ force: true });
      await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
      await run(page, 6000);
      await shoot(page, `rival-portrait-${camera}-${theme}`);
    });
  }

  for (const [size, theme] of [
    ['desktop', 'dark'],
    ['laptop', 'light'],
  ] as const) {
    test(`results, ${size}, ${theme}`, async ({ page }) => {
      await openAt(page, size, theme, { settings: rivalSettings('brutal', 'classic') });
      await page.locator('[data-rival="cpu"]').click({ force: true });
      await runUntil(page, () => document.body.dataset.phase === 'results', 900_000, 1000);
      await run(page, 800);
      await shoot(page, `rival-results-${size}-${theme}`);
    });
  }

  test.describe('on a phone held sideways', () => {
    test.use({ hasTouch: true, isMobile: true });

    for (const theme of ['dark', 'light'] as const) {
      test(`the touch pads, two players, ${theme}`, async ({ page }) => {
        await openAt(page, 'landscape', theme, { settings: { camera: 'chase' } });
        await page.locator('[data-rival="friend"]').click({ force: true });
        await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
        await run(page, 2400);
        await shoot(page, `rival-touch-landscape-${theme}`);
      });
    }

    test('the touch pad against the CPU, riding Ahead', async ({ page }) => {
      const race = findRace(SURGER, 'hard', slipThroughIn);
      const open = { size: 'landscape', theme: 'light', cpu: 'hard', camera: 'iso' } as const;
      await shootRace(page, { ...race, steps: race.steps.slice(1, 2) }, open, [
        'surge-touch-landscape-light',
      ]);
    });
  });

  test('the title, with Rival Driver among the modes', async ({ page }) => {
    await openAt(page, 'desktop', 'dark');
    await run(page, 1200);
    await shoot(page, 'rival-title-desktop-dark');
  });

  test('the settings: CPU, rounds and the four buttons each', async ({ page }) => {
    await openAt(page, 'desktop', 'dark');
    await page.getByRole('button', { name: 'Settings' }).click({ force: true });
    await page.locator('[data-focus-key="key-0-0"]').scrollIntoViewIfNeeded();
    await run(page, 300);
    await shoot(page, 'rival-settings-desktop-dark');
  });
});
