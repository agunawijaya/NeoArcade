import { expect, test, type Page } from '@playwright/test';
import { botControls, createBotMemory } from '../src/engine/bot';
import { TICKS_PER_SECOND } from '../src/engine/constants';
import { createMatch, matchScore, stepMatch } from '../src/engine/match';
import { DAILY } from '../src/game/daily';
import { planMode, type ModeRequest } from '../src/game/modes';
import { CLOCK_START, openGame, runUntil } from './helpers';

/**
 * The scripted pilot flies whole games in the real page, faster than real
 * time on the fake clock, and the page must end exactly where the engine
 * says the same flight ends in Node: the same score, the same result. It
 * proves the page runs the engine faithfully (no dropped or doubled
 * ticks, no input leaking in) and prints how each game went, for tuning.
 *
 *   npx playwright test -c ports/mind-the-ox --project=playtest
 */

/** Writes a line of the report. */
function print(...parts: unknown[]) {
  process.stdout.write(`${parts.join(' ')}\n`);
}

const SEED = 5;

interface Flight {
  name: string;
  request: ModeRequest;
  open: (page: Page) => Promise<void>;
}

const FLIGHTS: Flight[] = [
  {
    name: 'Daily Sortie',
    request: { kind: 'daily', day: DAILY.on(CLOCK_START), practice: false },
    async open(page) {
      await page.click('[data-mode="daily"]');
      await page.getByRole('button', { name: 'Take off' }).click();
    },
  },
  {
    name: 'Dogfight against Normal',
    request: { kind: 'dogfight', opponents: 1, level: 'normal' },
    async open(page) {
      await page.click('[data-mode="dogfight"]');
      await page.getByRole('button', { name: 'Take off' }).click();
    },
  },
  {
    name: 'Campaign chapter 1',
    request: { kind: 'campaign', chapter: 'ox-pasture' },
    async open(page) {
      await page.click('[data-mode="campaign"]');
      await page.click('[data-action="take-off"]');
    },
  },
  {
    name: 'At Sea mission 1',
    request: { kind: 'at-sea', chapter: 'deck-trials' },
    async open(page) {
      await page.click('[data-mode="at-sea"]');
      await page.click('[data-action="take-off"]:visible');
    },
  },
];

/** The same flight in Node: until the match is over, or the page's own limit. */
function flyInNode(request: ModeRequest) {
  const plan = planMode(request, {
    seed: SEED,
    flight: 'smooth',
    autoRoll: true,
    secretWeapons: false,
  });
  const match = createMatch(plan.setup);
  const memory = createBotMemory();
  let ticks = 0;
  while (match.phase !== 'over' && ticks < 20 * 60 * TICKS_PER_SECOND) {
    const player = match.world.planes[plan.humans[0] ?? 0];
    stepMatch(match, [player ? botControls(match.world, player, memory) : undefined]);
    ticks += 1;
  }
  const last = match.world;
  return {
    score: matchScore(match, 0),
    won: match.lastWinner === 0,
    seconds: ticks / TICKS_PER_SECOND,
    targetsLeft: last.targets.filter((target) => target.side === 1 && target.standing).length,
  };
}

for (const flight of FLIGHTS) {
  test(`${flight.name}: the page ends where the engine does`, async ({ page }) => {
    await openGame(page, { bot: true, seed: SEED });
    await flight.open(page);
    const finished = await runUntil(page, 'phase', 'results', 20 * 60_000, 5000);
    expect(finished, 'the game reached its results').toBe(true);
    const inPage = await page.evaluate(() => ({
      score: Number(document.body.dataset.score),
      won: document.body.dataset.won === 'true',
    }));
    const inNode = flyInNode(flight.request);
    print(
      `${flight.name}: ${inNode.won ? 'won' : 'lost'} in ${inNode.seconds.toFixed(0)} s, score ${inNode.score}, ${inNode.targetsLeft} targets left`,
    );
    expect(inPage).toEqual({ score: inNode.score, won: inNode.won });
  });
}
