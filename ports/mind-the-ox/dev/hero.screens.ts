import { test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Staged moments rendered as stills for art direction: a dogfight, a
 * bombing run with its crater, the flight into the sun, the campaign's
 * fog, night raid, convoy and ox herd, and at sea a launch at dawn, a
 * torpedo run and a night trap, in both views, by day and by night, in
 * every theme. The Great War's dogfight, bombing, sun, launch, torpedo and
 * trap at 1440 × 900 are the approved hero frames in media/hero/;
 * everything else goes to dev/art/ for review.
 *
 *   npx playwright test -c ports/mind-the-ox/dev
 *   HERO_THEMES=airshow HERO_SCENES=bombing HERO_SIZES=844x390 npx playwright test -c ports/mind-the-ox/dev
 */
const list = (name: string, fallback: string) => (process.env[name] ?? fallback).split(',');
const SCENES = list('HERO_SCENES', 'dogfight,bombing,sun');
const VIEWS = list('HERO_VIEWS', 'side,diorama');
const LIGHTS = list('HERO_LIGHTS', 'day,night');
const THEMES = list('HERO_THEMES', 'great-war');
const SIZES = list('HERO_SIZES', '1440x900').map(
  (size) => size.split('x').map(Number) as [number, number],
);
const HERO = fileURLToPath(new URL('../media/hero/', import.meta.url));
const ART = fileURLToPath(new URL('./art/', import.meta.url));

for (const [width, height] of SIZES) {
  for (const theme of THEMES) {
    for (const scene of SCENES) {
      for (const view of VIEWS) {
        for (const light of LIGHTS) {
          test(`${theme} · ${scene} · ${view} · ${light} · ${width}×${height}`, async ({
            page,
          }) => {
            await page.setViewportSize({ width, height });
            await page.goto(
              `/ports/mind-the-ox/dev/hero.html?scene=${scene}&view=${view}&light=${light}&theme=${theme}`,
            );
            await page.waitForSelector('body[data-ready]', { timeout: 60_000 });
            const hero =
              theme === 'great-war' &&
              width === 1440 &&
              ['dogfight', 'bombing', 'sun', 'launch', 'torpedo', 'trap'].includes(scene);
            const path = hero
              ? `${HERO}${scene}-${view}-${light}.jpg`
              : `${ART}${theme}-${scene}-${view}-${light}-${width}x${height}.jpg`;
            await page.screenshot({ path, type: 'jpeg', quality: 86 });
          });
        }
      }
    }
  }
}
