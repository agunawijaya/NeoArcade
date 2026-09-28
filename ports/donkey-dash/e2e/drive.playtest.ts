import { expect, test, type Page } from '@playwright/test';
import { createRng } from '@shared/rng';
import { createAutopilot } from '../src/engine/autopilot';
import type { Drive } from '../src/engine/drive';
import { DIFFICULTIES, dailyRun, endlessRun } from '../src/engine/modes';
import { legRun, legSeed, ROUTE_IDS, ROUTES } from '../src/engine/routes';
import {
  createRun,
  legStars,
  metresDriven,
  runScore,
  stepRun,
  type RunConfig,
} from '../src/engine/run';
import { FRAME_MS, openGame, runUntil, startMode } from './helpers';

/**
 * Playtests with a scripted player who has a phone player's limits: about
 * 0.42 s to react, a slower thumb for a second press, and the odd moment of
 * hesitation. First the numbers (Node plays hundreds of runs); then the same
 * player drives the real page, by taps and by keys, and the page must end up
 * exactly where Node's replay of those presses does.
 *
 *   npx playwright test -c ports/donkey-dash --project=playtest
 */
const PHONE_REACTION = 0.42;

function humanPlayer(seed: number, reaction: number) {
  const rng = createRng(seed);
  const pilot = createAutopilot({ reactionSeconds: reaction, pressGap: 0.2 });
  let hesitateUntil = -1;
  return (drive: Drive) => {
    if (drive.roadTime < hesitateUntil) return false;
    if (!pilot.decide(drive)) return false;
    if (rng.chance(0.25)) {
      hesitateUntil = drive.roadTime + rng.float(0.03, 0.18);
      return false;
    }
    return true;
  };
}

/** Plays a run in Node; returns the run and the steps on which the player pressed. */
function simulate(config: RunConfig, seed: number, reaction = PHONE_REACTION, maxSeconds = 900) {
  const run = createRun(config);
  const decide = humanPlayer(seed, reaction);
  const presses: number[] = [];
  for (let step = 0; step < maxSeconds * 60 && run.phase.kind !== 'over'; step++) {
    const press = run.phase.kind === 'drive' && decide(run.drive);
    if (press) presses.push(run.drive.steps);
    stepRun(run, { driver: press });
  }
  return { run, presses };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

test('Normal is fair on a phone, and the difficulties are in order', () => {
  const survival: Record<string, number> = {};
  for (const difficulty of DIFFICULTIES) {
    const seconds = Array.from({ length: 12 }, (_, index) => {
      const { run } = simulate(endlessRun(index + 1, difficulty, true, true), index * 31 + 7);
      return run.drive.roadTime;
    });
    survival[difficulty] = median(seconds);
  }
  test.info().annotations.push({
    type: 'endless median run, phone player',
    description: DIFFICULTIES.map((d) => `${d} ${Math.round(survival[d] ?? 0)} s`).join(', '),
  });
  // A good few minutes on Normal before three crashes; more on Relaxed, less on Frantic.
  expect(survival.normal).toBeGreaterThan(120);
  expect(survival.normal).toBeLessThan(300);
  expect(survival.relaxed).toBeGreaterThan(survival.normal ?? 0);
  expect(survival.frantic).toBeLessThan(survival.normal ?? 0);
});

test('Road Trip gets harder smoothly, and every leg can be finished', () => {
  const lines: string[] = [];
  let previousClean = 11;
  const cleanByRoute: number[] = [];
  for (const route of ROUTE_IDS) {
    let routeClean = 0;
    for (let leg = 0; leg < 3; leg++) {
      let finished = 0;
      let clean = 0;
      for (let attempt = 1; attempt <= 10; attempt++) {
        const stars = legStars(
          simulate(legRun(route, leg, legSeed(route, leg), true), attempt).run,
        );
        finished += Number(stars.finished);
        clean += Number(stars.clean);
      }
      routeClean += clean;
      lines.push(`${ROUTES[route].legs[leg]?.name}: finished ${finished}/10, clean ${clean}/10`);
      // Bosses may bite: half the phone players through a stubborn herd is plenty.
      const floor = ROUTES[route].legs[leg]?.boss ? 4 : 6;
      expect(finished, `${route} leg ${leg + 1}`).toBeGreaterThanOrEqual(floor);
    }
    cleanByRoute.push(routeClean);
    previousClean = Math.min(previousClean, routeClean);
  }
  test.info().annotations.push({ type: 'road trip, phone player', description: lines.join('; ') });
  // Clean runs get rarer from the farm to the summit, with room for a boss to spike.
  expect(cleanByRoute[0]).toBeGreaterThan(cleanByRoute[4] ?? 0);
  expect(cleanByRoute[1]).toBeGreaterThanOrEqual(cleanByRoute[3] ?? 0);
});

test('the Daily Road is a challenge, not a wall', () => {
  let finished = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { run } = simulate(dailyRun(seed * 7919), seed);
    if (run.phase.kind === 'over' && run.phase.reason === 'finish') finished++;
  }
  test
    .info()
    .annotations.push({ type: 'daily finish rate, phone player', description: `${finished}/20` });
  expect(finished).toBeGreaterThanOrEqual(8);
  expect(finished).toBeLessThanOrEqual(18);
});

/**
 * Presses exactly on the engine steps Node chose. The page publishes its
 * engine step on <body>; a press made while it reads `step` is read by the
 * update that takes step + 1, just as in Node.
 */
async function replay(page: Page, presses: number[], press: () => Promise<void>) {
  const current = async () => Number(await page.evaluate(() => document.body.dataset.step ?? -1));
  for (const target of presses) {
    let step = await current();
    if (target - step > 6) await page.clock.runFor((target - step - 4) * FRAME_MS * 0.95);
    for (step = await current(); step < target; step = await current()) {
      await page.clock.runFor(16);
    }
    expect(step, 'the page ran past a press').toBe(target);
    await press();
  }
}

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } });

  test('a phone player taps through Farm Lanes, and the page agrees with Node', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const plan = simulate(legRun('farm', 0, legSeed('farm', 0), true), 11);
    expect(plan.run.phase).toEqual({ kind: 'over', reason: 'finish' });

    await openGame(page, { settings: { camera: 'chase' } });
    await startMode(page, 'trip');
    await page.locator('[data-route="farm"] [data-leg="0"]').click({ force: true });
    await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
    await replay(page, plan.presses, () => page.locator('.stage__canvas').tap({ force: true }));
    await runUntil(page, () => document.body.dataset.phase === 'results', 200_000, 500);
    await expect(page.getByRole('heading', { name: 'Morning Chores: made it!' })).toBeVisible();
    const stats = await page.locator('.results__stats').innerText();
    expect(stats).toContain(`Crashes\n${plan.run.stats.crashes}`);
    expect(stats).toContain(`Score\n${runScore(plan.run).toLocaleString('en')}`);
  });
});

test('a keyboard player drives an Endless run, and the page agrees with Node', async ({ page }) => {
  test.setTimeout(900_000);
  const seed = 42;
  const plan = simulate(endlessRun(seed, 'normal', true, true), 5, PHONE_REACTION, 70);
  await openGame(page, { seed, settings: { camera: 'classic' } });
  await startMode(page, 'endless');
  await runUntil(page, () => document.body.dataset.phase === 'play', 20_000, 16);
  await replay(page, plan.presses, () => page.keyboard.press('Space'));
  const stopAt = plan.run.drive.steps;
  await runUntil(page, () => Number(document.body.dataset.step) >= 0, 1000, 16);
  while (Number(await page.evaluate(() => document.body.dataset.step)) < stopAt) {
    await page.clock.runFor(16);
  }
  const metres = await page.locator('[data-field="metres"]').textContent();
  expect(metres).toBe(`${metresDriven(plan.run).toLocaleString('en')} m`);
});
