import { join } from 'node:path';
import { test, type Page } from '@playwright/test';

/**
 * The pictures in media/ (and the Hall's), at 1440 × 900 and one at phone
 * size: each a moment of a seeded flight set up by the scene lab
 * (`?lab=scene&scene=…`), which has the scripted test pilot fly there and
 * hands the flight over paused, so every run takes the same picture.
 *
 *   npx playwright test -c ports/flight-312 --project=screens media
 */
const MEDIA = join(import.meta.dirname, '../media');

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(MEDIA, `${name}.jpg`), type: 'jpeg', quality: 86 });
}

const SCENES: [scene: string, file: string][] = [
  ['takeoff', 'takeoff'],
  ['approach', 'approach'],
  ['breakout', 'breakout'],
  ['night', 'night'],
  ['dusk', 'dusk'],
  ['touchdown', 'touchdown'],
  ['cruise', 'cruise'],
  ['pedestal', 'pedestal'],
  ['overhead', 'overhead'],
  ['engineer', 'engineer'],
  ['chart', 'chart'],
  ['report', 'report'],
  ['1982', 'rules-1982'],
  ['glass', 'glass'],
  ['glass-night', 'glass-night'],
  ['glass-pedestal', 'glass-pedestal'],
  ['lesson', 'lesson'],
  ['debrief', 'debrief'],
  ['replay-chase', 'replay-chase'],
  ['replay-tower', 'replay-tower'],
  ['replay-runway', 'replay-runway'],
];

/** A week of Daily Approaches flown, so the calendar and the streak have something to show. */
const DAILY_WEEK = Object.fromEntries(
  [3, 2, 3, 1, 2, 3, 2, 3].map((stars, index) => [
    `2026-10-${17 + index}`,
    {
      landed: true,
      points: 520 + stars * 140,
      stars,
      starsText: '★'.repeat(stars) + '☆'.repeat(3 - stars),
      sinkFpm: 260 - stars * 60,
      field: 'BOS',
      level: 'pilot',
      deck: index % 2 ? 'glass' : 'classic',
    },
  ]),
);

/** Halfway through the school, to show the stars won. */
const SCHOOL_HALFWAY = {
  'cockpit-tour': 3,
  'takeoff-roll': 3,
  'rotation-climb': 2,
  'turns-heading': 3,
  'vor-radial': 2,
  'dme-position': 3,
};

test.use({ viewport: { width: 1440, height: 900 } });

for (const [scene, file] of SCENES) {
  test(`the ${scene} scene`, async ({ page }) => {
    await page.goto(`./?lab=scene&scene=${scene}`);
    await page.waitForSelector('body[data-ready="scene"]', { timeout: 600_000 });
    await shot(page, file);
  });
}

test('the title and the briefing', async ({ page }) => {
  await page.goto('./');
  await page.waitForSelector('body[data-ready="title-screen"]');
  await shot(page, 'title');
  await page.getByRole('button', { name: /^Flight 312 / }).click();
  await page.waitForSelector('body[data-ready="briefing"]');
  await shot(page, 'briefing');
});

test('the flight school and the Daily Approach', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T08:30:00Z'));
  await page.addInitScript(
    ([daily, school]) => {
      localStorage.setItem('neoarcade:flight-312:daily', JSON.stringify(daily));
      localStorage.setItem('neoarcade:flight-312:school', JSON.stringify(school));
    },
    [DAILY_WEEK, SCHOOL_HALFWAY] as const,
  );
  await page.goto('./');
  await page.waitForSelector('body[data-ready="title-screen"]');
  await page.getByRole('button', { name: /^Flight school/ }).click();
  await page.waitForSelector('body[data-ready="school"]');
  await shot(page, 'school');
  await page.getByRole('button', { name: '← Back' }).click();
  await page.getByRole('button', { name: /^Daily Approach/ }).click();
  await page.waitForSelector('body[data-ready="daily"]', { timeout: 120_000 });
  await shot(page, 'daily');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the approach in the compact panel', async ({ page }) => {
    await page.goto('./?lab=scene&scene=approach');
    await page.waitForSelector('body[data-ready="scene"]', { timeout: 600_000 });
    await shot(page, 'phone-approach');
  });

  test('the glass deck and a lesson', async ({ page }) => {
    await page.goto('./?lab=scene&scene=glass');
    await page.waitForSelector('body[data-ready="scene"]', { timeout: 600_000 });
    await shot(page, 'phone-glass');
    await page.goto('./?lab=scene&scene=lesson');
    await page.waitForSelector('body[data-ready="scene"]', { timeout: 600_000 });
    await shot(page, 'phone-lesson');
  });
});
