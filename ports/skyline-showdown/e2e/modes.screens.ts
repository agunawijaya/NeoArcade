import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { addDays } from '@shared/daily';
import { encodeChallenge } from '../src/challenge/link';
import { DAILY, dailySkyline, startDaily, type DailyResult } from '../src/daily/daily';
import { previewTurn, type TurnAim } from '../src/engine/match';
import { ENGINE_VERSION } from '../src/engine/version';
import { PACKS, PUZZLES } from '../src/tricks/packs';
import { emptyTricks, TRICKS_KEY, type TrickSave } from '../src/tricks/progress';
import { openGame, run, runUntil, runUntilPhase, testSettings, typeThrow } from './helpers';

/**
 * Screenshots of Trick Shot, the Daily Skyline and challenge links, in both
 * themes, on a desktop and a phone held sideways: for art direction, and
 * for media/. Everything is really played, on a clock set to a day with a
 * streak behind it.
 *
 *   SCREENSHOT_DIR=somewhere npx playwright test -c ports/skyline-showdown --project=screens modes
 */
const outputDir =
  process.env.SCREENSHOT_DIR ?? join(import.meta.dirname, '..', 'test-results', 'screens');
mkdirSync(outputDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 844, height: 390 },
] as const;
const THEMES = ['dark', 'light'] as const;

/** Daily #16, with a week of dailies played before it. */
const TODAY = '2026-10-14';
const CLOCK = new Date(`${TODAY}T18:00:00Z`);

const shoot = (page: Page, name: string) =>
  page.screenshot({ path: join(outputDir, `${name}.jpg`), type: 'jpeg', quality: 86 });

/** Warm-up done with a mix of stars, two Wind Readers solved. */
function trickProgress(): TrickSave {
  const save = emptyTricks();
  const [warmUp, windReaders] = PACKS;
  const stars = [3, 3, 2, 3, 1, 2];
  warmUp?.puzzles.forEach((puzzle, index) => {
    const earned = stars[index] ?? 1;
    save.puzzles[puzzle.id] = {
      solved: true,
      fewestAttempts: earned >= 2 ? 1 : 9,
      styled: earned === 3,
    };
  });
  windReaders?.puzzles.slice(0, 2).forEach((puzzle) => {
    save.puzzles[puzzle.id] = { solved: true, fewestAttempts: 2, styled: false };
  });
  return save;
}

/** A week of dailies before today, one of them missed. */
function dailyLog(): Record<string, DailyResult> {
  const throws = [4, 2, 0, 3, 6, 1, 5];
  return Object.fromEntries(
    throws.map((count, index) => [
      addDays(TODAY, index - throws.length),
      count === 0
        ? { outcome: 'outOfThrows', throws: 10, aims: [] }
        : { outcome: 'hit', throws: count, aims: [] },
    ]),
  );
}

/** Two near misses and a hit on today's daily. */
function dailyPlan(): TurnAim[] {
  const state = startDaily(dailySkyline(DAILY.forKey(TODAY)));
  for (const angle of [45, 50, 40, 55, 35, 60]) {
    for (let velocity = 20; velocity <= 180; velocity++) {
      if (previewTurn(state, { angle, velocity }).victim !== 1) continue;
      const short = { angle, velocity: velocity - 7 };
      const long = { angle: angle + 4, velocity: velocity + 4 };
      const missing = [short, long].every((aim) => previewTurn(state, aim).victim === null);
      if (missing) return [short, long, { angle, velocity }];
    }
  }
  throw new Error(`No plan for the daily of ${TODAY}.`);
}

const storage = (theme: string) => ({
  'neoarcade:skyline-showdown:theme': theme,
  [`neoarcade:skyline-showdown:${TRICKS_KEY}`]: trickProgress(),
  'neoarcade:skyline-showdown:daily': dailyLog(),
});

/** Dismisses every unlock toast waiting its turn, so the picture shows the screen itself. */
async function settle(page: Page) {
  await run(page, 600);
  for (let toast = 0; toast < 12; toast++) {
    const dismiss = page.locator('.neo-toasts').getByRole('button', { name: 'Dismiss' });
    if ((await dismiss.count()) === 0) break;
    await dismiss.first().click({ force: true });
    await run(page, 600);
  }
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    const tag = `${viewport.name}-${theme}`;
    test.describe(tag, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test('mode select, packs, a puzzle and its solve', async ({ page }) => {
        test.setTimeout(240_000);
        await openGame(page, testSettings(), 3, storage(theme), CLOCK);
        await run(page, 2500);
        await shoot(page, `modes-title-${tag}`);
        await page.getByRole('button', { name: /Trick Shot/ }).click({ force: true });
        await run(page, 800);
        await shoot(page, `trick-map-${tag}`);
        await page.locator('[data-puzzle="tailwind"]').click({ force: true });
        await run(page, 800);
        await shoot(page, `puzzle-card-${tag}`);

        await page.getByRole('button', { name: 'Play', exact: true }).click({ force: true });
        await runUntilPhase(page, 'aim');
        const tailwind = PUZZLES.find((puzzle) => puzzle.id === 'tailwind');
        if (!tailwind) throw new Error('No tailwind puzzle.');
        await typeThrow(page, tailwind.solution.angle, tailwind.solution.velocity);
        await runUntilPhase(page, 'flight');
        await run(page, 1500);
        await shoot(page, `puzzle-flight-${tag}`);
        await runUntilPhase(page, 'waiting');
        await settle(page);
        await shoot(page, `puzzle-solved-${tag}`);
      });

      test('the daily, played, and its share line', async ({ page }) => {
        test.setTimeout(480_000);
        await openGame(page, testSettings(), 3, storage(theme), CLOCK);
        await page.getByRole('button', { name: /Daily Skyline/ }).click({ force: true });
        await run(page, 800);
        await shoot(page, `daily-${tag}`);
        await page.getByRole('button', { name: 'Play today’s daily' }).click({ force: true });
        await runUntilPhase(page, 'aim');
        await run(page, 1500);
        await shoot(page, `daily-aim-${tag}`);
        for (const aim of dailyPlan()) {
          await runUntilPhase(page, 'aim');
          await typeThrow(page, aim.angle, aim.velocity);
          await runUntilPhase(page, 'flight');
        }
        // The hit's slow-motion replay is skipped, as a player may.
        await runUntilPhase(page, 'replay');
        await page.locator('.hud__replay').click({ force: true });
        await runUntil(
          page,
          () => !document.querySelector<HTMLElement>('.overlay--daily-results')?.hidden,
          '',
          90_000,
        );
        await settle(page);
        await shoot(page, `daily-results-${tag}`);
      });

      test('a challenge link, from intro to verdict', async ({ page }) => {
        test.setTimeout(240_000);
        const index = PUZZLES.findIndex((puzzle) => puzzle.id === 'here-comes-the-sun');
        const puzzle = PUZZLES[index];
        if (!puzzle) throw new Error('No sun puzzle.');
        const link = encodeChallenge({
          version: ENGINE_VERSION,
          source: { kind: 'trick', puzzle: index },
          wind: puzzle.wind,
          throws: [{ ...puzzle.solution, usePowerUp: true }],
          nickname: 'Ada',
        });
        await openGame(page, testSettings(), 3, storage(theme), CLOCK);
        await page.goto(`./#c=${link}`);
        await page.reload();
        await run(page, 1200);
        await shoot(page, `challenge-intro-${tag}`);
        await page.getByRole('button', { name: 'Watch their shot' }).click({ force: true });
        await runUntilPhase(page, 'watch');
        await run(page, 2600);
        await shoot(page, `challenge-watch-${tag}`);
        await runUntilPhase(page, 'aim');
        await typeThrow(page, puzzle.solution.angle, puzzle.solution.velocity - 4);
        await runUntilPhase(page, 'waiting');
        await settle(page);
        await shoot(page, `challenge-result-${tag}`);
        await page.getByRole('button', { name: 'Send a reply' }).click({ force: true });
        await page.getByRole('textbox').fill('Grace');
        await run(page, 400);
        await shoot(page, `challenge-maker-${tag}`);
      });
    });
  }
}
