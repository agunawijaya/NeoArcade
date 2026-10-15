import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { createAutopilot } from '../src/engine/autopilot';
import type { Drive } from '../src/engine/drive';
import { endlessRun } from '../src/engine/modes';
import { closingLaneAt } from '../src/engine/road';
import { createRival, rivalMatch, stepRival, type RivalInput } from '../src/engine/rival';
import { createRivalDriver, CPU_STYLES, type CpuLevel } from '../src/engine/rival-cpu';
import { createRun, stepRun, type RunConfig } from '../src/engine/run';
import { defaultSettings, type CameraView, type Settings } from '../src/settings';
import { driveTo, openGame, run, runUntil, startMode, type OpenOptions } from './helpers';

/**
 * Screenshots of the shifting road and Rival Driver, for art direction and
 * the docs: a lane closing ahead, a car that stayed in it too long, a trap
 * being sprung, the results, and the touch zones on a phone held sideways.
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
  key: 'KeyA' | 'KeyD';
}

/**
 * A Rival match against the CPU in Node, with a hesitant player in the other
 * car, up to the moment the CPU boxes that player in: the player's presses,
 * and the step just after the move that was refused.
 */
function planTrap(seed: number, cpu: CpuLevel) {
  const state = createRival(rivalMatch(seed, 3));
  const player = createRivalDriver({ ...CPU_STYLES.easy, blunder: 0 }, 0, seed * 7);
  const rival = createRivalDriver(CPU_STYLES[cpu], 1, seed + 1);
  const inputs: RaceInput[] = [];
  let bumpedAt = -1;
  for (let step = 0; step < 60 * 90 && state.round === 1 && state.phase.kind === 'race'; step++) {
    const mine: RivalInput = player.decide(state);
    if (mine.left || mine.right) {
      inputs.push({ step: state.drive.steps, key: mine.left ? 'KeyA' : 'KeyD' });
    }
    const events = stepRival(state, [mine, rival.decide(state)]);
    for (const event of events) {
      if (event.type === 'bump' && event.car === 0 && event.reason === 'car') {
        bumpedAt = state.drive.steps;
      }
      if (event.type === 'crash' && event.car === 0 && event.trapped && bumpedAt > 0) {
        return { inputs, step: bumpedAt + 4 };
      }
    }
  }
  return null;
}

/** A Rival match in Node up to the moment the player's car is back on the road as a ghost. */
function planRespawn(seed: number) {
  const state = createRival(rivalMatch(seed, 3));
  const rival = createRivalDriver(CPU_STYLES.normal, 1, seed + 1);
  for (let step = 0; step < 60 * 90 && state.round === 1 && state.phase.kind === 'race'; step++) {
    const events = stepRival(state, [{ left: false, right: false }, rival.decide(state)]);
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
        let found: { seed: number; inputs: RaceInput[]; step: number } | null = null;
        for (let seed = 1; seed < 300 && !found; seed++) {
          const trap = planTrap(seed, 'hard');
          if (trap) found = { seed, ...trap };
        }
        if (!found) throw new Error('The CPU never sprang a trap.');
        const { seed, inputs, step } = found;
        await openAt(page, size, theme, { seed, settings: rivalSettings('hard', camera) });
        await page.locator('[data-rival="cpu"]').click({ force: true });
        const keys = new Map(inputs.map((input) => [input.step, input.key]));
        await driveTo(
          page,
          inputs.map((input) => input.step),
          step,
          (at) => page.keyboard.press(keys.get(at) ?? 'KeyD'),
        );
        await shoot(page, `rival-trap-${camera}-${size}-${theme}`);
      });
    }
  }

  for (const camera of ['classic', 'chase'] as const) {
    test(`a crashed car back as a ghost, ${camera}`, async ({ page }) => {
      let seed = 1;
      let step = planRespawn(seed);
      while (step === null && seed < 100) step = planRespawn(++seed);
      if (step === null) throw new Error('Nobody ever crashed.');
      await openAt(page, 'desktop', 'light', { seed, settings: rivalSettings('normal', camera) });
      await page.locator('[data-rival="cpu"]').click({ force: true });
      await driveTo(page, [], step, async () => undefined);
      await shoot(page, `rival-ghost-${camera}`);
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
      test(`the touch zones, ${theme}`, async ({ page }) => {
        await openAt(page, 'landscape', theme, { settings: { camera: 'chase' } });
        await page.locator('[data-rival="friend"]').click({ force: true });
        await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
        await run(page, 2400);
        await shoot(page, `rival-touch-landscape-${theme}`);
      });
    }
  });

  test('the title, with Rival Driver among the modes', async ({ page }) => {
    await openAt(page, 'desktop', 'dark');
    await run(page, 1200);
    await shoot(page, 'rival-title-desktop-dark');
  });

  test('the settings: CPU, rounds and the two-button layout', async ({ page }) => {
    await openAt(page, 'desktop', 'dark');
    await page.getByRole('button', { name: 'Settings' }).click({ force: true });
    await page.locator('[data-focus-key="key-0-0"]').scrollIntoViewIfNeeded();
    await run(page, 300);
    await shoot(page, 'rival-settings-desktop-dark');
  });
});
