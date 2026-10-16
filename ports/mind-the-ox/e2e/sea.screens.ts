import { test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { SEA_CHAPTERS } from '../src/game/at-sea';
import type { Settings } from '../src/settings';
import type { ThemeId } from '../src/themes';
import { advance, openGame } from './helpers';

/**
 * Carrier Ops in pictures: the At Sea missions flown by the scripted
 * pilot in each theme and view, light and dark, and the At Sea and Custom
 * Sortie screens. The shots for the README and the docs go to media/;
 * with SEA_OUT=art the whole matrix goes to dev/art/sea/ for the
 * art-direction passes instead, at every size asked for, with the sea's
 * menus (SEA_MENUS=only for nothing else).
 *
 *   npx playwright test -c ports/mind-the-ox --project=screens sea.screens
 *   SEA_OUT=art SEA_SIZES=1440x900,844x390 SEA_THEMES=airshow npx playwright test …
 */
const ART = process.env.SEA_OUT === 'art';
const FOLDER = fileURLToPath(new URL(ART ? '../dev/art/sea/' : '../media/', import.meta.url));
const list = (name: string, fallback: string) =>
  (process.env[name] ?? fallback).split(',').filter(Boolean);

/** Every mission open, the first few with stars. */
const PART_WAY = {
  chapters: Object.fromEntries(
    SEA_CHAPTERS.map((chapter, index) => [
      chapter.id,
      {
        stars: [index < 7, index < 3, index < 1] as [boolean, boolean, boolean],
        bestScore: 1500,
      },
    ]),
  ),
};

/** Where in each mission the picture is taken, seconds after take-off. */
const MOMENTS: Readonly<Record<string, number>> = {
  'deck-trials': 3,
  'coastal-strike': 24,
  'convoy-escort': 40,
  'shipping-strike': 18,
  'the-raid': 30,
  intercept: 70,
  'night-recovery': 30,
  'carrier-duel': 26,
};

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${FOLDER}${name}.jpg`, type: 'jpeg', quality: 86 });
}

async function flyMission(
  page: Page,
  mission: string,
  settings: Partial<Settings>,
  light: string,
  seconds = MOMENTS[mission] ?? 20,
) {
  await openGame(page, {
    settings,
    progress: PART_WAY,
    bot: true,
    light: light === 'night' ? 'dark' : 'light',
  });
  await page.click('[data-mode="at-sea"]');
  await advance(page, 200);
  await page.click(`[data-chapter="${mission}"]`);
  await advance(page, 200);
  await page.click('[data-action="take-off"]:visible');
  await advance(page, seconds * 1000);
}

const SIZES = list('SEA_SIZES', '1280x720').map(
  (size) => size.split('x').map(Number) as [number, number],
);

/** The menus Carrier Ops adds, as each opens from the title. */
const MENUS: readonly [string, (page: Page) => Promise<void>][] = [
  [
    'at-sea',
    async (page) => {
      await page.click('[data-mode="at-sea"]');
    },
  ],
  [
    'sortie',
    async (page) => {
      await page.click('[data-mode="sortie"]');
    },
  ],
  [
    'settings',
    async (page) => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await advance(page, 200);
      await page.getByText('Carrier landing assist').scrollIntoViewIfNeeded();
    },
  ],
];

if (ART) {
  for (const [width, height] of SIZES)
    for (const light of list('SEA_LIGHTS', 'day,night'))
      for (const [menu, open] of MENUS)
        test(`menu · ${menu} · ${light} · ${width}×${height}`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          await openGame(page, { progress: PART_WAY, light: light === 'night' ? 'dark' : 'light' });
          await open(page);
          await advance(page, 300);
          await shoot(page, `menu-${menu}-${light}-${width}x${height}`);
        });
  const missions = process.env.SEA_MENUS === 'only' ? [] : list('SEA_THEMES', 'great-war');
  for (const [width, height] of SIZES)
    for (const theme of missions)
      for (const mission of list('SEA_MISSIONS', SEA_CHAPTERS.map((chapter) => chapter.id).join()))
        for (const camera of list('SEA_VIEWS', 'side,diorama'))
          for (const light of list('SEA_LIGHTS', 'day,night'))
            test(`${theme} · ${mission} · ${camera} · ${light} · ${width}×${height}`, async ({
              page,
            }) => {
              await page.setViewportSize({ width, height });
              await flyMission(
                page,
                mission,
                { theme: theme as ThemeId, camera: camera as Settings['camera'] },
                light,
              );
              await shoot(page, `${theme}-${mission}-${camera}-${light}-${width}x${height}`);
            });
} else {
  test.describe('media at sea', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('the At Sea missions', async ({ page }) => {
      await openGame(page, { progress: PART_WAY });
      await page.click('[data-mode="at-sea"]');
      await advance(page, 200);
      await page.click('[data-chapter="the-raid"]');
      await advance(page, 300);
      await shoot(page, 'at-sea');
    });

    test('Custom Sortie', async ({ page }) => {
      // Tall enough for the whole form, which scrolls on a 720-high screen.
      await page.setViewportSize({ width: 1280, height: 1000 });
      await openGame(page, { light: 'dark' });
      await page.click('[data-mode="sortie"]');
      await advance(page, 300);
      await shoot(page, 'sortie');
    });

    const PICTURES: readonly [string, string, Partial<Settings>, string, number][] = [
      ['sea-deck-trials', 'deck-trials', { theme: 'great-war', camera: 'side' }, 'day', 3],
      [
        'sea-shipping-strike',
        'shipping-strike',
        { theme: 'great-war', camera: 'diorama' },
        'day',
        18,
      ],
      ['sea-night-recovery', 'night-recovery', { theme: 'great-war', camera: 'side' }, 'night', 3],
      ['sea-cyan-magenta', 'shipping-strike', { theme: 'cyan-magenta', camera: 'side' }, 'day', 18],
      ['sea-airshow', 'shipping-strike', { theme: 'airshow', camera: 'diorama' }, 'day', 18],
      ['sea-intercept', 'intercept', { theme: 'great-war', camera: 'diorama' }, 'night', 70],
    ];
    for (const [name, mission, settings, light, seconds] of PICTURES)
      test(name, async ({ page }) => {
        await flyMission(page, mission, settings, light, seconds);
        await shoot(page, name);
      });
  });
}
