import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { STEPS_PER_SECOND } from '../src/engine/constants';
import { gorillaCentre, throwingHand } from '../src/engine/gorillas';
import type { WorldId } from '../src/engine/worlds';
import {
  findThrow,
  mirrorMatch,
  mirrorThrow,
  onScreen,
  openGame,
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

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('title and settings', async ({ page }) => {
      await openGame(page, testSettings(), 3);
      await run(page, 3000);
      await shoot(page, `title-${viewport.name}`);
      await page.getByRole('button', { name: 'Match settings' }).click({ force: true });
      await run(page, 600);
      await shoot(page, `settings-${viewport.name}`);
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
        await run(page, (stepsToMs(plan.hit.steps) / 0.35) * 0.85);
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
