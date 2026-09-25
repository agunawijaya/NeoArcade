import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createRng } from '@shared/rng';
import {
  createCpuMemory,
  observeThrow,
  planThrow,
  thinkingSeconds,
  type CpuLevel,
} from '../src/engine/ai';
import { startNextRound, takeTurn, type MatchState, type MatchStatus } from '../src/engine/match';
import {
  mirrorMatch,
  openGame,
  runUntil,
  runUntilPhase,
  startFromTitle,
  testSettings,
  typeThrow,
} from './helpers';

/**
 * Plays whole matches against the CPU at every difficulty through the real
 * game. The page's CPU is deterministic for a seed, so Node plays the same
 * match alongside, which lets the "human" (an average player) pick its
 * throws and lets the test check the page never drifts from the rules.
 *
 *   npx playwright test -c ports/skyline-showdown --project=playtest
 */
const LEVELS: CpuLevel[] = ['easy', 'normal', 'hard', 'brutal'];
const SEEDS = [101, 202];
// The stand-in for a person: about as good as the Normal CPU, and typing exact numbers.
const HUMAN_SKILL: CpuLevel = 'normal';
const reportDir = join(import.meta.dirname, '..', 'test-results');

for (const level of LEVELS) {
  for (const seed of SEEDS) {
    test(`a full match against the ${level} CPU (seed ${seed})`, async ({ page }) => {
      const settings = testSettings({
        players: 'humanVsCpu',
        cpuLevel: level,
        points: 3,
        world: 'earth',
      });
      const state = mirrorMatch(settings, seed);
      const cpu = { memory: createCpuMemory(), rng: createRng(seed ^ 0x5eed) };
      const human = { memory: createCpuMemory(), rng: createRng(seed + 7) };
      const throws: [number, number] = [0, 0];
      let rounds = 1;
      const started = Date.now();

      await openGame(page, settings, seed);
      await startFromTitle(page);

      while (state.status !== 'matchOver') {
        const player = state.turn;
        const brain = player === 0 ? human : cpu;
        const plan = planThrow(state, brain.memory, player === 0 ? HUMAN_SKILL : level, brain.rng);
        // The page's CPU also rolls how long to think, from the same generator.
        if (player === 1) thinkingSeconds(level, cpu.rng);
        if (player === 0) {
          // A person types a tidy number.
          plan.angle = Math.round(plan.angle * 10) / 10;
          await typeThrow(page, plan.angle, plan.velocity);
        }
        const result = takeTurn(state, plan);
        observeThrow(brain.memory, plan, result.shot, state);
        throws[player]++;

        // takeTurn changed the status; read it afresh.
        const status = statusOf(state);
        const next = status === 'matchOver' ? 'over' : 'aim';
        // A CPU turn is already in its aiming phase while it thinks: wait for the throw first.
        await runUntilPhase(page, 'flight', 240_000);
        await runUntilPhase(page, next, 240_000);
        const scores = await page.locator('.hud__score strong').allTextContents();
        expect(scores.map(Number), 'the page keeps the same score as the rules').toEqual(
          state.scores,
        );

        if (status === 'roundOver') {
          startNextRound(state);
          rounds++;
          await runUntil(page, (round) => document.body.dataset.round === round, String(rounds));
        }
      }

      const report = {
        level,
        seed,
        winner: state.winner === 0 ? 'human' : 'cpu',
        scores: state.scores,
        rounds,
        humanThrows: throws[0],
        cpuThrows: throws[1],
        cpuThrowsPerPoint: throws[1] / Math.max(1, state.scores[1]),
        realSeconds: Math.round((Date.now() - started) / 1000),
      };
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(
        join(reportDir, `playtest-${level}-${seed}.json`),
        JSON.stringify(report, null, 2),
      );
      process.stdout.write(`${JSON.stringify(report)}\n`);
    });
  }
}

/** Reads the status through a function, since takeTurn changes it behind TypeScript's back. */
function statusOf(match: MatchState): MatchStatus {
  return match.status;
}
