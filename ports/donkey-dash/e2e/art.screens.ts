import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { createAutopilot } from '../src/engine/autopilot';
import { classicDuel, createDuel, stepDuel } from '../src/engine/duel';
import { gapOf } from '../src/engine/drive';
import { endlessRun } from '../src/engine/modes';
import { legRun, legSeed, ROUTE_IDS, type RouteId } from '../src/engine/routes';
import { createRun, stepRun, type RunConfig } from '../src/engine/run';
import type { CameraView } from '../src/settings';
import { FRAME_MS, openGame, run, runUntil, startMode, type OpenOptions } from './helpers';

/**
 * Screenshots for art direction, the docs and the Hall. Every moment is
 * reached by really playing: a good driver's presses are worked out in Node
 * and replayed into the page on the fake clock, step by step.
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

async function sized(page: Page, size: SizeName) {
  await page.setViewportSize(SIZES[size]);
}

interface Plan {
  presses: number[];
  /** A step with a donkey in the middle distance, two if the road allows. */
  scenic: number;
  /** A step just after a near miss, with the donkey still beside the car and the pop-up up. */
  nearMiss: number | null;
}

/** A good driver's run in Node: when to press, and the moments worth a picture. */
function planRun(config: RunConfig, fromStep = 600, daring = 0): Plan {
  const game = createRun(config);
  const pilot = createAutopilot({ reactionSeconds: 0.25, pressGap: 0.14, daring });
  const presses: number[] = [];
  let single = -1;
  let crowd = -1;
  let nearMiss: number | null = null;
  const lastStep = fromStep + 60 * 40;
  while (game.drive.steps < lastStep && game.phase.kind !== 'over') {
    const press = game.phase.kind === 'drive' && pilot.decide(game.drive);
    if (press) presses.push(game.drive.steps);
    const events = stepRun(game, { driver: press });
    const steps = game.drive.steps;
    if (steps <= fromStep) continue;
    if (nearMiss === null && events.some((event) => event.type === 'near-miss')) {
      nearMiss = steps + 3;
    }
    const ahead = game.drive.hazards.filter(
      (hazard) => hazard.kind === 'donkey' && hazard.revealed && !hazard.passed,
    );
    const midway = ahead.some((hazard) => {
      const gap = gapOf(game.drive, hazard);
      return gap > 6 && gap < 10;
    });
    if (midway && single < 0) single = steps;
    if (midway && ahead.length >= 2 && crowd < 0) crowd = steps;
    if (crowd >= 0 && (nearMiss !== null || daring === 0)) break;
  }
  const scenic = crowd >= 0 ? crowd : single >= 0 ? single : fromStep;
  return { presses, scenic, nearMiss };
}

async function stepNow(page: Page) {
  return Number(await page.evaluate(() => document.body.dataset.step ?? -1));
}

/** Replays the presses still ahead up to `until`, then stops the clock right on that step. */
async function driveTo(page: Page, presses: number[], until: number, press: () => Promise<void>) {
  await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
  const from = await stepNow(page);
  const ahead = presses.filter((step) => step >= from && step < until);
  for (const target of [...ahead, until]) {
    let step = await stepNow(page);
    if (target - step > 6) await page.clock.runFor((target - step - 4) * FRAME_MS * 0.95);
    for (step = await stepNow(page); step < target; step = await stepNow(page)) {
      await page.clock.runFor(16);
    }
    if (target !== until) await press();
  }
}

const tapOrKey = (page: Page) => () => page.keyboard.press('Space');

async function openAt(page: Page, size: SizeName, options: OpenOptions = {}) {
  await sized(page, size);
  await openGame(page, options);
}

test.describe('menus', () => {
  for (const size of Object.keys(SIZES) as SizeName[]) {
    for (const theme of ['dark', 'light'] as const) {
      test(`title, ${size}, ${theme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await openAt(page, size, { theme });
        await run(page, 1500);
        await shoot(page, `title-${size}-${theme}`);
      });
    }
  }

  for (const size of ['desktop', 'portrait'] as const) {
    test(`screens, ${size}`, async ({ page }) => {
      await openAt(page, size, { allRoutes: size === 'desktop' });
      await page.getByRole('button', { name: 'Settings' }).click({ force: true });
      await run(page, 300);
      await shoot(page, `settings-${size}`);
      await page.keyboard.press('Escape');
      await startMode(page, 'trip');
      await run(page, 300);
      await shoot(page, `trip-${size}`);
      await page.keyboard.press('Escape');
      await startMode(page, 'daily');
      await run(page, 300);
      await shoot(page, `daily-${size}`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Garage' }).click({ force: true });
      await run(page, 300);
      await shoot(page, `garage-${size}`);
    });
  }
});

test.describe('routes in every view', () => {
  for (const route of ROUTE_IDS) {
    for (const camera of VIEWS) {
      test(`${route}, ${camera}`, async ({ page }) => {
        const leg = route === 'desert' || route === 'snow' ? 1 : 0;
        const plan = planRun(
          legRun(route as RouteId, leg, legSeed(route as RouteId, leg), true),
          700,
        );
        await openAt(page, 'desktop', { allRoutes: true, settings: { camera } });
        await startMode(page, 'trip');
        await page.locator(`[data-route="${route}"] [data-leg="${leg}"]`).click({ force: true });
        await driveTo(page, plan.presses, plan.scenic, tapOrKey(page));
        await shoot(page, `route-${route}-${camera}`);
      });
    }
  }
});

test.describe('moments', () => {
  for (const camera of VIEWS) {
    test(`crash, ${camera}`, async ({ page }) => {
      await openAt(page, 'desktop', { settings: { camera }, seed: 3 });
      await startMode(page, 'endless');
      await runUntil(page, () => document.body.dataset.moment === 'crash', 60_000, 16);
      await run(page, 700);
      await shoot(page, `crash-${camera}`);
    });

    test(`near miss, ${camera}`, async ({ page }) => {
      const seed = 12;
      const plan = planRun(endlessRun(seed, 'normal', true, true), 500, 0.12);
      await openAt(page, 'desktop', { settings: { camera }, seed });
      await startMode(page, 'endless');
      await driveTo(page, plan.presses, plan.nearMiss ?? plan.scenic, tapOrKey(page));
      await shoot(page, `near-miss-${camera}`);
    });
  }

  test('Classic Duel, up the road and over the top', async ({ page }) => {
    const seed = 4;
    const duel = createDuel(classicDuel(seed, 5, false));
    const pilot = createAutopilot({ reactionSeconds: 0.1, pressGap: 0.1 });
    const presses: number[] = [];
    let highUp = -1;
    let summit = -1;
    for (let step = 0; step < 60 * 60 && summit < 0; step++) {
      const press = duel.phase.kind === 'drive' && pilot.decide(duel.drive);
      if (press) presses.push(duel.drive.steps);
      const events = stepDuel(duel, { driver: press });
      if (highUp < 0 && duel.drive.climb === 7 && duel.wave?.donkeys[0]?.revealed)
        highUp = duel.drive.steps + 8;
      if (events.some((event) => event.type === 'point' && event.side === 'driver'))
        summit = duel.drive.steps;
    }
    await openAt(page, 'desktop', { settings: { camera: 'classic' }, seed });
    await startMode(page, 'classic');
    await driveTo(page, presses, highUp, tapOrKey(page));
    await shoot(page, 'duel-classic-climb');
    await driveTo(page, presses, summit, tapOrKey(page));
    await run(page, 500);
    await shoot(page, 'duel-classic-summit');
  });

  for (const [size, camera] of [
    ['desktop', 'chase'],
    ['portrait', 'classic'],
  ] as const) {
    test(`Donkey vs Driver, ${size}`, async ({ page }) => {
      await openAt(page, size, { settings: { camera } });
      await startMode(page, 'versus');
      await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
      await run(page, 1200);
      await page.keyboard.press('KeyL');
      await run(page, 120);
      await shoot(page, `versus-${size}-${camera}`);
    });
  }

  for (const size of ['desktop', 'portrait'] as const) {
    test(`Daily Road results, ${size}`, async ({ page }) => {
      await openAt(page, size, { settings: { camera: 'classic' } });
      await startMode(page, 'daily');
      await page.getByRole('button', { name: 'Drive today’s road' }).click({ force: true });
      await runUntil(page, () => document.body.dataset.phase === 'results', 300_000, 500);
      await run(page, 800);
      await shoot(page, `daily-results-${size}`);
    });
  }

  for (const [size, camera, theme] of [
    ['portrait', 'chase', 'dark'],
    ['portrait', 'iso', 'dark'],
    ['landscape', 'classic', 'dark'],
    ['landscape', 'chase', 'light'],
    ['laptop', 'iso', 'light'],
    ['desktop', 'classic', 'light'],
  ] as const) {
    test(`playing, ${size}, ${camera}, ${theme}`, async ({ page }) => {
      const seed = 21;
      const plan = planRun(endlessRun(seed, 'normal', true, true), 700);
      await page.emulateMedia({ colorScheme: theme });
      await openAt(page, size, { settings: { camera }, seed, theme });
      await startMode(page, 'endless');
      await driveTo(page, plan.presses, plan.scenic, tapOrKey(page));
      await shoot(page, `play-${size}-${camera}-${theme}`);
    });
  }

  for (const filter of ['cga', 'crt'] as const) {
    test(`filter, ${filter}`, async ({ page }) => {
      const seed = 21;
      const plan = planRun(endlessRun(seed, 'normal', true, true), 700);
      await openAt(page, 'desktop', { settings: { camera: 'classic', filter }, seed });
      await startMode(page, 'endless');
      await driveTo(page, plan.presses, plan.scenic, tapOrKey(page));
      await shoot(page, `filter-${filter}`);
    });
  }

  test('pause menu', async ({ page }) => {
    await openAt(page, 'desktop', { settings: { camera: 'iso' } });
    await startMode(page, 'endless');
    await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
    await run(page, 1500);
    await page.keyboard.press('Escape');
    await run(page, 300);
    await shoot(page, 'pause-desktop');
  });
});
