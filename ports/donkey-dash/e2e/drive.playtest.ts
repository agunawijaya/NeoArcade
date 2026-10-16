import { expect, test, type Page } from '@playwright/test';
import { createRng } from '@shared/rng';
import { createAutopilot } from '../src/engine/autopilot';
import type { Drive } from '../src/engine/drive';
import { DIFFICULTIES, dailyRun, endlessRun } from '../src/engine/modes';
import { legRun, legSeed, ROUTE_IDS, ROUTES } from '../src/engine/routes';
import { createRival, rivalMatch, stepRival, type RivalInput } from '../src/engine/rival';
import {
  createRivalDriver,
  CPU_LEVELS,
  CPU_STYLES,
  type CpuLevel,
  type DriverStyle,
} from '../src/engine/rival-cpu';
import {
  createRun,
  legStars,
  metresDriven,
  runScore,
  stepRun,
  type RunConfig,
} from '../src/engine/run';
import { RIVAL_MOVES } from '../src/game/controls';
import { DEFAULT_RIVAL_KEYS } from '../src/settings';
import { driveTo, FRAME_MS, openGame, runUntil, startMode } from './helpers';

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

/**
 * A phone player in Rival Driver: a little slow, now and then hesitant, and
 * up for a block when one is right there. They never surge, as nobody could
 * before the surge, so their numbers compare with the ones from back then.
 */
const PHONE_RIVAL: DriverStyle = {
  reactionSeconds: PHONE_REACTION,
  reactionSpread: 0,
  pressGap: 0.2,
  trapping: 'near',
  trapChance: 0.3,
  wary: false,
  hesitation: 0.25,
  blunder: 0.02,
  surging: 'never',
  surgeChance: 0,
  ridesAhead: 0,
};

/** A quick player on keys who has worked out that the middle lane is the place to be. */
const SAVVY_RIVAL: DriverStyle = {
  reactionSeconds: 0.34,
  reactionSpread: 0,
  pressGap: 0.15,
  trapping: 'anywhere',
  trapChance: 0.5,
  wary: true,
  hesitation: 0.15,
  blunder: 0.015,
  surging: 'never',
  surgeChance: 0,
  ridesAhead: 0,
};

/**
 * The phone player once they have found the surge: no metronome, they slip
 * out of boxes Ahead and ride there for the bonus some of the time, or all
 * of it.
 */
const surgingPhone = (ridesAhead: number): DriverStyle => ({
  ...PHONE_RIVAL,
  reactionSpread: 0.25,
  surging: 'escape',
  surgeChance: 0.3,
  ridesAhead,
});

/** One Rival match in Node; side 0 is `left`. Returns the winner and how long it took. */
function race(left: DriverStyle, right: DriverStyle, seed: number) {
  const state = createRival(rivalMatch(seed, 3));
  const drivers = [createRivalDriver(left, 0, seed * 3 + 1), createRivalDriver(right, 1, seed + 1)];
  let steps = 0;
  for (; steps < 60 * 60 * 15 && state.phase.kind !== 'over'; steps++) {
    stepRival(state, [drivers[0]!.decide(state), drivers[1]!.decide(state)]);
  }
  return { winner: state.winner, minutes: steps / 3600, state };
}

/** How often `style` beats `against` over `matches` seeded matches, playing both sides of the road. */
function winRate(style: DriverStyle, against: DriverStyle, matches: number, offset = 0) {
  let wins = 0;
  let minutes = 0;
  for (let match = 0; match < matches; match++) {
    const seed = 7000 + offset + match * 13;
    const mine = match % 2 === 0;
    const result = mine ? race(style, against, seed) : race(against, style, seed);
    if (result.winner === (mine ? 0 : 1)) wins++;
    minutes += result.minutes;
  }
  return { rate: wins / matches, minutes: minutes / matches };
}

test('Rival Driver: every CPU level against every other', () => {
  const lines: string[] = [];
  for (const [index, level] of CPU_LEVELS.entries()) {
    const row = CPU_LEVELS.map((other) => {
      const { rate } = winRate(CPU_STYLES[level], CPU_STYLES[other], 16, index * 100);
      return `${other} ${Math.round(rate * 100)}%`;
    });
    lines.push(`${level} beats ${row.join(', ')}`);
    // Two levels up is clearly stronger.
    for (const [lower, other] of CPU_LEVELS.slice(0, Math.max(0, index - 1)).entries()) {
      expect(winRate(CPU_STYLES[level], CPU_STYLES[other], 16, lower * 7).rate).toBeGreaterThan(
        0.6,
      );
    }
  }
  test.info().annotations.push({ type: 'rival, CPU against CPU', description: lines.join('; ') });
});

test('Rival Driver: Normal is a fair fight, and Brutal is sharp but beatable', () => {
  const rates = Object.fromEntries(
    CPU_LEVELS.map((level) => [level, winRate(PHONE_RIVAL, CPU_STYLES[level], 40)]),
  ) as Record<CpuLevel, { rate: number; minutes: number }>;
  const savvy = winRate(SAVVY_RIVAL, CPU_STYLES.brutal, 40);
  test.info().annotations.push({
    type: 'rival, phone player wins',
    description: CPU_LEVELS.map(
      (level) =>
        `${level} ${Math.round(rates[level].rate * 100)}% (${rates[level].minutes.toFixed(1)} min a match)`,
    ).join(', '),
  });
  test.info().annotations.push({
    type: 'rival, quick player who holds the middle, against Brutal',
    description: `${Math.round(savvy.rate * 100)}%`,
  });
  expect(rates.easy.rate).toBeGreaterThan(0.6);
  expect(rates.normal.rate).toBeGreaterThan(0.3);
  expect(rates.normal.rate).toBeLessThan(0.65);
  expect(rates.hard.rate).toBeLessThan(rates.normal.rate);
  expect(rates.brutal.rate).toBeLessThan(rates.hard.rate + 0.05);
  // Sharp, not cheating: a good player still takes matches off it.
  expect(rates.brutal.rate).toBeGreaterThan(0);
  expect(savvy.rate).toBeGreaterThan(0.2);
});

test('Rival Driver: riding Ahead pays against some levels, not against all of them', () => {
  const ways = { level: surgingPhone(0), sometimes: surgingPhone(0.3), always: surgingPhone(1) };
  const rates = Object.fromEntries(
    Object.entries(ways).map(([way, style]) => [
      way,
      Object.fromEntries(
        CPU_LEVELS.map((level) => [level, winRate(style, CPU_STYLES[level], 40).rate]),
      ),
    ]),
  ) as Record<keyof typeof ways, Record<CpuLevel, number>>;
  test.info().annotations.push({
    type: 'rival, phone player who surges, wins by how much they ride Ahead',
    description: Object.entries(rates)
      .map(
        ([way, byLevel]) =>
          `${way}: ${CPU_LEVELS.map((level) => `${level} ${Math.round(byLevel[level] * 100)}%`).join(', ')}`,
      )
      .join('; '),
  });
  // Tempting, not dominant: never riding Ahead must still win somewhere.
  expect(CPU_LEVELS.some((level) => rates.level[level] >= rates.always[level])).toBe(true);
  expect(rates.always.easy).toBeGreaterThan(0.3);
});

test('a scripted player races the CPU in the page, and the page agrees with Node', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const seed = 31;
  // Node first: the player's presses through the first round, and where both cars end up.
  const state = createRival(rivalMatch(seed, 3));
  const player = createRivalDriver(PHONE_RIVAL, 0, 5);
  const cpu = createRivalDriver(CPU_STYLES.normal, 1, seed + 1);
  const presses = new Map<number, string>();
  while (state.round === 1 && state.phase.kind === 'race' && state.drive.steps < 60 * 50) {
    const mine: RivalInput = player.decide(state);
    const key = RIVAL_MOVES.findIndex((move) => mine[move]);
    if (key >= 0) presses.set(state.drive.steps, DEFAULT_RIVAL_KEYS[0][key] as string);
    stepRival(state, [mine, cpu.decide(state)]);
  }
  const stopAt = state.drive.steps;

  await openGame(page, {
    seed,
    settings: {
      camera: 'classic',
      rival: {
        opponent: 'cpu',
        cpu: 'normal',
        rounds: 3,
        keys: DEFAULT_RIVAL_KEYS,
      },
    },
  });
  await page.locator('[data-rival="cpu"]').click({ force: true });
  await driveTo(page, [...presses.keys()], stopAt, (step) =>
    page.keyboard.press(presses.get(step) ?? 'KeyD'),
  );
  const shown = await page.evaluate(() => [
    document.body.dataset.lanes,
    document.body.dataset.meters,
  ]);
  expect(shown).toEqual([
    state.cars.map((car) => car.lane).join(','),
    state.cars.map((car) => car.meter).join(','),
  ]);
});
