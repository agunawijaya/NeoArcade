import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createRng } from '@shared/rng';
import { createMatch, startNextRound, type MatchState } from '../src/engine/match';
import { tourSetup } from '../src/game/setup';
import { chapterUnlocked, recordStage, starsFor, totalStars } from '../src/tour/progress';
import { emptyTour, type TourSave } from '../src/tour/save';
import { CHAPTERS, STAGES, stagesIn, type Chapter, type Stage } from '../src/tour/stages';
import { DEFAULT_OUTFITS } from '../src/wardrobe/items';
import { PACE, playersFor, playTurn } from '../test/tour-sim';
import { openGame, playTourStage, runUntil, testSettings, typeThrow } from './helpers';

/**
 * Plays the whole World Tour through the real page, one chapter per test,
 * with the stand-in "decent human" from test/tour-sim.ts typing its throws
 * against every rival. Node plays each match alongside, so the page must
 * keep the same score and award the same stars; the time each stage would
 * take a person is estimated as the tuning test estimates it.
 *
 *   npx playwright test -c ports/skyline-showdown --project=playtest tour
 */
const settings = testSettings({ players: 'humanVsCpu', aiming: 'typed' });
// A chapter runs for most of an hour; a trace of every call would be too big to write.
test.use({ trace: 'off' });
const TOUR_KEY = 'neoarcade:skyline-showdown:tour';
const reportDir = join(import.meta.dirname, '..', 'test-results', 'tour-playtest');
const MAX_ATTEMPTS = 8;

interface Attempt {
  stage: string;
  seed: number;
  won: boolean;
  scores: [number, number];
  throws: number;
  stars: number;
  /** A person's time for it, estimated from the session's pacing. */
  minutes: number;
}

/** A save with every earlier chapter won on two stars a stage: enough for every gate. */
function saveBefore(chapter: Chapter): TourSave {
  const save = emptyTour();
  for (const stage of STAGES.slice(
    0,
    STAGES.findIndex((each) => each.chapter === chapter.id),
  )) {
    save.stages[stage.id] = { stars: 2, won: true, bestThrows: stage.throwBudget, plays: 1 };
    if (!save.rivalsBeaten.includes(stage.rival)) save.rivalsBeaten.push(stage.rival);
  }
  return save;
}

function statusOf(state: MatchState): MatchState['status'] {
  return state.status;
}

/** Runs the page on to a phase, skipping any instant replay on the way to save time. */
async function runToPhase(page: Page, phase: string) {
  await runUntil(
    page,
    (wanted) => {
      const now = document.body.dataset.phase;
      if (now === 'replay') document.querySelector<HTMLButtonElement>('.hud__replay')?.click();
      return now === wanted;
    },
    phase,
    600_000,
  );
}

/** Plays one attempt at a stage in the page and in Node, turn for turn. */
async function playAttempt(page: Page, stage: Stage, seed: number): Promise<Attempt> {
  const setup = tourSetup(stage, settings, seed, DEFAULT_OUTFITS[0]);
  const state = createMatch(setup.match);
  const players = playersFor(setup);
  let seconds = PACE.menus + PACE.roundIntro;
  let throws = 0;

  await page.goto(`./?seed=${seed}`);
  await runUntil(page, (screen) => document.body.dataset.screen === screen, 'title');
  await playTourStage(page, stage.id);

  while (statusOf(state) !== 'matchOver') {
    const player = state.turn;
    const turn = playTurn(state, players);
    seconds += turn.seconds;
    if (player === 0) {
      throws++;
      await typeThrow(page, turn.aim.angle, turn.aim.velocity);
    }
    // A CPU turn is already in its aiming phase while it thinks: wait for the throw first.
    await runToPhase(page, 'flight');
    await runToPhase(page, statusOf(state) === 'matchOver' ? 'over' : 'aim');
    const scores = await page.locator('.hud__score strong').allTextContents();
    expect(scores.map(Number), `${stage.city}: the page keeps the rules' score`).toEqual(
      state.scores,
    );
    if (statusOf(state) === 'roundOver') {
      startNextRound(state);
      seconds += PACE.roundIntro;
    }
  }

  await runUntil(page, () => !document.querySelector<HTMLElement>('.overlay--results')?.hidden, '');
  const won = state.winner === 0;
  const { stars } = starsFor(stage, { won, throws, timesHit: state.scores[1], aimAssist: false });
  await expect(page.locator('.results__stars')).toHaveAttribute(
    'aria-label',
    `${stars} of 3 stars`,
  );
  return {
    stage: stage.id,
    seed,
    won,
    scores: [...state.scores],
    throws,
    stars,
    minutes: Math.round((seconds / 60) * 10) / 10,
  };
}

for (const chapter of CHAPTERS) {
  test(`chapter ${chapter.number}, ${chapter.name}, played through by a decent player`, async ({
    page,
  }) => {
    test.setTimeout(3 * 60 * 60 * 1000);
    let save = saveBefore(chapter);
    await openGame(page, settings, 1, { [TOUR_KEY]: save });
    const seeds = createRng(chapter.number * 1009);
    const attempts: Attempt[] = [];

    const attempt = async (stage: Stage) => {
      const played = await playAttempt(page, stage, seeds.int(1, 2 ** 30));
      attempts.push(played);
      save = recordStage(save, stage, {
        ...played,
        timesHit: played.scores[1],
        aimAssist: false,
      }).save;
      process.stdout.write(`${JSON.stringify(played)}\n`);
    };

    for (const stage of stagesIn(chapter.id)) {
      for (let tries = 0; tries < MAX_ATTEMPTS && !save.stages[stage.id]?.won; tries++) {
        await attempt(stage);
      }
      expect(save.stages[stage.id]?.won, `${stage.city} was beaten`).toBe(true);
    }
    // Chase stars until the next chapter opens, as a player would.
    const next = CHAPTERS[chapter.number];
    const own = stagesIn(chapter.id);
    for (let replay = 0; next && !chapterUnlocked(save, next) && replay < MAX_ATTEMPTS; replay++) {
      const weakest = [...own].sort(
        (a, b) => (save.stages[a.id]?.stars ?? 0) - (save.stages[b.id]?.stars ?? 0),
      )[0] as Stage;
      await attempt(weakest);
    }
    if (next) expect(chapterUnlocked(save, next), `${next.name} opens`).toBe(true);

    const stored = JSON.parse(
      (await page.evaluate((key) => localStorage.getItem(key), TOUR_KEY)) ?? 'null',
    ) as TourSave;
    expect(totalStars(stored)).toBe(totalStars(save));

    const minutes = attempts.reduce((sum, each) => sum + each.minutes, 0);
    const report = {
      chapter: chapter.name,
      plays: attempts.length,
      minutes: Math.round(minutes),
      stars: own.reduce((sum, stage) => sum + (save.stages[stage.id]?.stars ?? 0), 0),
      attempts,
    };
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, `${chapter.id}.json`), JSON.stringify(report, null, 2));
  });
}
