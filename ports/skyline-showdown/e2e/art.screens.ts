import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { STEPS_PER_SECOND } from '../src/engine/constants';
import { gorillaCentre, throwingHand } from '../src/engine/gorillas';
import type { WorldId } from '../src/engine/worlds';
import { emptyTour, type TourSave } from '../src/tour/save';
import { STAGES, stageById, type Stage } from '../src/tour/stages';
import {
  findThrow,
  mirrorMatch,
  mirrorThrow,
  onScreen,
  openGame,
  planFlawlessWin,
  playPlan,
  playTourStage,
  run,
  runUntilPhase,
  startFromTitle,
  testSettings,
  typeThrow,
} from './helpers';

/**
 * Screenshots for art direction and for media/. Every state is reached by
 * really playing: the throws are worked out with the engine for a known
 * seed and typed in, and game time is stepped so each frame is exact.
 *
 *   SCREENSHOT_DIR=somewhere npx playwright test -c ports/skyline-showdown --project=screens
 */
const outputDir =
  process.env.SCREENSHOT_DIR ?? join(import.meta.dirname, '..', 'test-results', 'screens');
mkdirSync(outputDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'phone', width: 844, height: 390 },
] as const;

/** Throw animation before the banana leaves the hand. */
const RELEASE_MS = 130;

const shoot = (page: Page, name: string) =>
  page.screenshot({ path: join(outputDir, `${name}.jpg`), type: 'jpeg', quality: 86 });

const stepsToMs = (steps: number) => (steps / STEPS_PER_SECOND) * 1000;

interface Plan {
  seed: number;
  miss: { angle: number; velocity: number; steps: number };
  hit: { angle: number; velocity: number; steps: number };
}

/** A city where player 1 blows a hole in a building mid-town and player 2 then hits player 1. */
function planFor(world: WorldId): Plan {
  const settings = testSettings({ world, points: 1 });
  for (let seed = 1; seed < 80; seed++) {
    const state = mirrorMatch(settings, seed);
    const [left, right] = state.round.gorillas;
    const miss = findThrow(state, (shot) => {
      const blast = shot.events.at(-1);
      return (
        blast?.type === 'explosion' &&
        blast.x > left.x + 120 &&
        blast.x < right.x - 60 &&
        blast.step > 40
      );
    });
    if (!miss) continue;
    mirrorThrow(state, miss.angle, miss.velocity);
    const hit = findThrow(state, (shot) => shot.victim === 0 && shot.steps > 45);
    if (!hit) continue;
    return {
      seed,
      miss: { angle: miss.angle, velocity: miss.velocity, steps: miss.shot.steps },
      hit: { angle: hit.angle, velocity: hit.velocity, steps: hit.shot.steps },
    };
  }
  throw new Error(`No suitable city found on ${world}.`);
}

const TOUR_KEY = 'neoarcade:skyline-showdown:tour';
const tourSettings = testSettings({ players: 'humanVsCpu', aiming: 'typed' });

/** A tour with the first `count` stages won on these stars, and their rivals beaten. */
function tourAfter(count: number, stars: (index: number) => number = () => 3): TourSave {
  const save = emptyTour();
  STAGES.slice(0, count).forEach((stage, index) => {
    save.stages[stage.id] = { stars: stars(index), won: true, bestThrows: 6, plays: 1 };
    if (!save.rivalsBeaten.includes(stage.rival)) save.rivalsBeaten.push(stage.rival);
  });
  save.outfits[0] = {
    ...save.outfits[0],
    headwear: 'hat-top',
    eyewear: 'eyes-shades',
    neckwear: 'neck-scarf',
    trail: 'trail-sparkle',
  };
  return save;
}

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('title and settings', async ({ page }) => {
      await openGame(page, testSettings(), 3);
      await run(page, 3000);
      await shoot(page, `title-${viewport.name}`);
      await page.getByRole('button', { name: 'Quick Match' }).click({ force: true });
      await run(page, 600);
      await shoot(page, `settings-${viewport.name}`);
    });

    test('the World Tour map and a stage card', async ({ page }) => {
      await openGame(page, tourSettings, 5, {
        [TOUR_KEY]: tourAfter(7, (index) => [3, 2, 3, 2, 3, 2, 1][index] ?? 0),
      });
      await page.locator('.title__tour').click({ force: true });
      await run(page, 1200);
      await shoot(page, `tour-map-${viewport.name}`);
      await page.locator('[data-stage="dubai"]').click({ force: true });
      await run(page, 1400);
      await shoot(page, `stage-card-${viewport.name}`);
    });

    test('a flawless win on the tour, and the badges it earns', async ({ page }) => {
      test.setTimeout(600_000);
      const plan = planFlawlessWin(stageById('jakarta') as Stage, tourSettings);
      await openGame(page, tourSettings, plan.seed, { [TOUR_KEY]: tourAfter(0) });
      await playTourStage(page, 'jakarta');
      await run(page, 1500);
      await shoot(page, `tour-hello-${viewport.name}`);
      await playPlan(page, plan);
      await run(page, 2600);
      await shoot(page, `results-${viewport.name}`);
      await page.getByRole('button', { name: 'Map' }).click({ force: true });
      await page.getByRole('button', { name: 'Back' }).click({ force: true });
      await page.getByRole('button', { name: 'Badges' }).click({ force: true });
      await run(page, 800);
      await shoot(page, `badges-${viewport.name}`);
    });

    test('the wardrobe', async ({ page }) => {
      await openGame(page, tourSettings, 5, { [TOUR_KEY]: tourAfter(8) });
      await page.getByRole('button', { name: 'Wardrobe' }).click({ force: true });
      await run(page, 1500);
      await shoot(page, `wardrobe-${viewport.name}`);
      await page.getByRole('tab', { name: 'Headwear' }).click({ force: true });
      await run(page, 800);
      await shoot(page, `wardrobe-hats-${viewport.name}`);
    });

    test('so close', async ({ page }) => {
      await openGame(page, testSettings({ points: 1 }), 6);
      await startFromTitle(page);
      await typeThrow(page, 45, 52);
      await runUntilPhase(page, 'settle');
      await run(page, 500);
      await shoot(page, `so-close-${viewport.name}`);
    });

    test('slingshot aiming', async ({ page }) => {
      const settings = testSettings({ players: 'humanVsCpu', aiming: 'drag' });
      const seed = 11;
      const state = mirrorMatch(settings, seed);
      await openGame(page, settings, seed);
      await startFromTitle(page);
      const hand = onScreen(throwingHand(state.round.gorillas[0], 0), viewport);
      const body = onScreen(gorillaCentre(state.round.gorillas[0]), viewport);
      await page.mouse.move(body.x, body.y);
      await page.mouse.down();
      await run(page, 50);
      await page.mouse.move(hand.x - viewport.width * 0.05, hand.y + viewport.height * 0.07, {
        steps: 8,
      });
      await run(page, 400);
      await shoot(page, `aiming-${viewport.name}`);
      await page.mouse.up();
    });

    test('power-ups', async ({ page }) => {
      test.skip(viewport.name !== 'desktop', 'One viewport is enough for these.');
      const settings = testSettings({ powerUps: true, points: 5 });
      let plan: { seed: number; angle: number; velocity: number; step: number } | null = null;
      for (let seed = 1; seed < 300 && !plan; seed++) {
        const state = mirrorMatch(settings, seed);
        if (!state.round.balloon) continue;
        const pop = findThrow(state, (shot) => shot.collected !== null && shot.victim === null);
        const popped = pop?.shot.events.find((event) => event.type === 'balloon');
        if (pop && popped)
          plan = { seed, angle: pop.angle, velocity: pop.velocity, step: popped.step };
      }
      if (!plan) throw new Error('No city with a balloon to pop.');

      await openGame(page, settings, plan.seed);
      await startFromTitle(page);
      await run(page, 400);
      await shoot(page, `balloon-${viewport.name}`);
      await typeThrow(page, plan.angle, plan.velocity);
      await run(page, RELEASE_MS + stepsToMs(plan.step) + 60);
      await shoot(page, `balloon-pop-${viewport.name}`);

      // Player 2 throws one away, then player 1 arms the prize and throws.
      await runUntilPhase(page, 'aim');
      await typeThrow(page, 170, 200);
      await runUntilPhase(page, 'flight');
      await runUntilPhase(page, 'aim');
      await page.keyboard.press('u');
      await run(page, 200);
      await shoot(page, `power-armed-${viewport.name}`);
      await typeThrow(page, 60, 55);
      await run(page, RELEASE_MS + 1500);
      await shoot(page, `power-flight-${viewport.name}`);
    });

    test('dusk to night to dawn', async ({ page }) => {
      test.skip(viewport.name !== 'desktop', 'One viewport is enough for these.');
      await openGame(page, testSettings({ points: 9, weather: true }), 8);
      await startFromTitle(page);
      // Fumbles (velocity 1) end each round at once, so the clock moves on quickly.
      for (let round = 1; round <= 5; round++) {
        if (round === 3 || round === 5) {
          await run(page, 400);
          await shoot(page, `${round === 3 ? 'night' : 'dawn'}-${viewport.name}`);
        }
        await typeThrow(page, 45, 1);
        await runUntilPhase(page, 'replay');
        await page.keyboard.press('Space');
        await runUntilPhase(page, 'aim');
      }
    });

    test('classic preset with the CRT filter', async ({ page }) => {
      test.skip(viewport.name !== 'desktop', 'One viewport is enough for these.');
      const settings = testSettings({ crt: true, weather: false, format: 'total' });
      const plan = planFor('earth');
      await openGame(page, settings, plan.seed);
      await startFromTitle(page);
      await typeThrow(page, plan.miss.angle, plan.miss.velocity);
      await run(page, RELEASE_MS + stepsToMs(plan.miss.steps) * 0.6);
      await shoot(page, `classic-crt-${viewport.name}`);
    });

    const cities = viewport.name === 'desktop' ? STAGES : [];
    for (const stage of cities) {
      test(`the tour in ${stage.city}`, async ({ page }) => {
        await openGame(page, tourSettings, 41, { [TOUR_KEY]: tourAfter(STAGES.length) });
        await playTourStage(page, stage.id);
        await run(page, 2600);
        await shoot(page, `city-${stage.id}`);
        await typeThrow(
          page,
          55,
          stage.world === 'moon' ? 24 : stage.world === 'jupiter' ? 110 : 68,
        );
        await run(page, RELEASE_MS + 1100);
        await shoot(page, `city-${stage.id}-flight`);
      });
    }

    const worlds =
      viewport.name === 'desktop'
        ? (['earth', 'moon', 'mars', 'jupiter'] as const)
        : (['earth'] as const);
    for (const world of worlds) {
      test(`an exchange on ${world}`, async ({ page }) => {
        const plan = planFor(world);
        await openGame(page, testSettings({ world, points: 1 }), plan.seed);
        await startFromTitle(page);
        const tag = `${world}-${viewport.name}`;
        await run(page, 300);
        await shoot(page, `typed-${tag}`);

        await typeThrow(page, plan.miss.angle, plan.miss.velocity);
        await run(page, RELEASE_MS + stepsToMs(plan.miss.steps) * 0.6);
        await shoot(page, `flight-${tag}`);
        await run(page, stepsToMs(plan.miss.steps) * 0.4 + 90);
        await shoot(page, `building-hit-${tag}`);

        await runUntilPhase(page, 'aim');
        await typeThrow(page, plan.hit.angle, plan.hit.velocity);
        // Slow motion by now: fire, fur and smoke rather than the first white flash.
        await run(page, RELEASE_MS + stepsToMs(plan.hit.steps) + 650);
        await shoot(page, `gorilla-hit-${tag}`);
        await runUntilPhase(page, 'replay');
        // The replay joins long flights for their last 2.5 seconds.
        await run(page, (Math.min(stepsToMs(plan.hit.steps), 2500) / 0.35) * 0.85);
        await shoot(page, `replay-${tag}`);
        await runUntilPhase(page, 'celebrate');
        await run(page, 900);
        await shoot(page, `celebrate-${tag}`);
        await runUntilPhase(page, 'over');
        await run(page, 900);
        await shoot(page, `victory-${tag}`);
      });
    }
  });
}
