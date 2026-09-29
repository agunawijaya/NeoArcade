import { expect, test, type Page } from '@playwright/test';
import { challengeStart, rebuildChallenge } from '../src/challenge/challenge';
import { decodeChallenge, encodeChallenge, type Challenge } from '../src/challenge/link';
import { DAILY, DAILY_LAUNCH, dailySkyline, shareLine, startDaily } from '../src/daily/daily';
import { previewTurn } from '../src/engine/match';
import { ENGINE_VERSION } from '../src/engine/version';
import { PUZZLES } from '../src/tricks/packs';
import {
  findThrow,
  mirrorMatch,
  openGame,
  run,
  runUntil,
  runUntilPhase,
  startFromTitle,
  testSettings,
  typeThrow,
} from './helpers';

/**
 * Trick Shot, the Daily Skyline and challenge links in the browser, played
 * with typed throws worked out in Node from the same engine.
 */
function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

const puzzle = (id: string) => {
  const found = PUZZLES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No puzzle ${id}.`);
  return found;
};

async function openPuzzle(page: Page, id: string) {
  await page.getByRole('button', { name: /Trick Shot/ }).click({ force: true });
  await page.locator(`[data-puzzle="${id}"]`).click({ force: true });
  await page.getByRole('button', { name: 'Play', exact: true }).click({ force: true });
  await runUntilPhase(page, 'aim');
}

/** The daily the page shows on the test clock (before the launch, so Daily #1). */
const daily = dailySkyline(DAILY.forKey(DAILY_LAUNCH));

function dailyHit(): { angle: number; velocity: number } {
  const state = startDaily(daily);
  for (const angle of [45, 50, 40, 55, 35, 60, 30, 65]) {
    for (let velocity = 5; velocity <= 200; velocity++) {
      if (previewTurn(state, { angle, velocity }).victim === 1) return { angle, velocity };
    }
  }
  throw new Error('No first-throw hit in the launch daily.');
}

test.describe('Trick Shot', () => {
  test('solves the first puzzle with style after a miss and an instant retry', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await openGame(page, testSettings(), 1);
    await openPuzzle(page, 'first-toss');
    await expect(page.locator('.trick-panel')).toContainText('Bonk the dummy on the head');

    await typeThrow(page, 45, 30);
    await runUntilPhase(page, 'missed');
    await page.keyboard.press('KeyR');
    await runUntilPhase(page, 'aim');
    await expect(page.locator('.hud__throws')).toHaveText('Attempt 2');

    const { angle, velocity } = puzzle('first-toss').solution;
    await typeThrow(page, angle, velocity);
    await runUntilPhase(page, 'waiting');
    const card = page.getByRole('dialog', { name: 'Solved, with style!' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('img', { name: '3 of 3 stars' })).toBeVisible();

    await card.getByRole('button', { name: 'Packs' }).click({ force: true });
    await expect(page.locator('[data-puzzle="first-toss"]')).toHaveAccessibleName(/3 of 3 stars/);
    expect(errors).toEqual([]);
  });
});

test.describe('Daily Skyline', () => {
  test('one scored attempt, a share line, and the result kept', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchForErrors(page);
    const hit = dailyHit();
    await openGame(page, testSettings(), 1);
    await expect(page.getByRole('button', { name: /Daily Skyline/ })).toContainText('#1 is open');
    await page.getByRole('button', { name: /Daily Skyline/ }).click({ force: true });
    await page.getByRole('button', { name: 'Play today’s daily' }).click({ force: true });
    await runUntilPhase(page, 'aim');
    await expect(page.locator('.hud__throws')).toHaveText('Throws 0 / 10');

    await typeThrow(page, hit.angle, hit.velocity);
    await runUntil(
      page,
      () => !document.querySelector<HTMLElement>('.overlay--daily-results')?.hidden,
      '',
      60_000,
    );
    const results = page.getByRole('dialog', { name: 'Hole in one!' });
    await expect(results).toBeVisible();
    const wind = startDaily(daily).round.wind;
    const expected = shareLine(daily, wind, { outcome: 'hit', throws: 1, aims: [] });
    await expect(results.locator('.share-box__text')).toHaveText(expected);
    await expect(results.locator('.share-box__text')).not.toContainText(String(hit.velocity));

    await results.getByRole('button', { name: 'Daily' }).click({ force: true });
    await expect(page.getByRole('button', { name: 'See results' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play today’s daily' })).toHaveCount(0);
    await expect(page.locator('.daily__streak')).toContainText('1 day');
    expect(errors).toEqual([]);
  });

  test('an attempt left half-way is picked up, never restarted', async ({ page }) => {
    test.setTimeout(180_000);
    await openGame(page, testSettings(), 1);
    await page.getByRole('button', { name: /Daily Skyline/ }).click({ force: true });
    await page.getByRole('button', { name: 'Play today’s daily' }).click({ force: true });
    await runUntilPhase(page, 'aim');
    await typeThrow(page, 170, 200);
    await runUntilPhase(page, 'flight');
    await runUntilPhase(page, 'aim');
    await page.keyboard.press('Escape');
    await run(page, 50);
    const pause = page.getByRole('dialog', { name: 'Paused' });
    await expect(pause.getByRole('button', { name: /Restart/ })).toBeHidden();
    await page.reload();
    await runUntil(page, (screen) => document.body.dataset.screen === screen, 'title');
    await page.getByRole('button', { name: /Daily Skyline/ }).click({ force: true });
    await expect(page.locator('.daily__status')).toContainText('1 of 10 bananas thrown');
    await page.getByRole('button', { name: 'Continue' }).click({ force: true });
    await runUntilPhase(page, 'aim');
    await expect(page.locator('.hud__throws')).toHaveText('Throws 1 / 10');
  });
});

test.describe('challenge links', () => {
  const longBomb = PUZZLES.findIndex((candidate) => candidate.id === 'long-bomb');
  const solution = puzzle('long-bomb').solution;
  const link = (overrides: Partial<Challenge> = {}) =>
    encodeChallenge({
      version: ENGINE_VERSION,
      source: { kind: 'trick', puzzle: longBomb },
      wind: 0,
      throws: [{ ...solution, usePowerUp: true }],
      nickname: 'Ada',
      ...overrides,
    });

  test('replays the challenger’s shot, then judges yours', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await openGame(page, testSettings(), 1);
    await page.goto(`./#c=${link()}`);
    await page.reload();
    const intro = page.getByRole('dialog', { name: 'Ada challenges you!' });
    await expect(intro).toContainText('Trick Shot · Long Bomb');
    await intro.getByRole('button', { name: 'Watch their shot' }).click({ force: true });
    await runUntilPhase(page, 'watch');
    await expect(page.locator('.hud__replay')).toContainText('Ada’s shot');
    await runUntilPhase(page, 'aim');

    await typeThrow(page, solution.angle, solution.velocity);
    await runUntilPhase(page, 'waiting');
    const result = page.getByRole('dialog', { name: 'Matched!' });
    await expect(result).toContainText('Copycat!');

    await result.getByRole('button', { name: 'Send a reply' }).click({ force: true });
    const maker = page.getByRole('dialog', { name: /Challenge a friend/ });
    await expect(maker.locator('.share-box__text')).toContainText('I challenge you');
    await maker.getByRole('textbox').fill('Grace');
    const message = (await maker.locator('.share-box__text').textContent()) ?? '';
    expect(message).toContain('Grace challenges you');
    const code = /#c=([A-Za-z0-9_-]+)/.exec(message)?.[1] ?? null;
    const reply = decodeChallenge(code);
    expect(reply).toMatchObject({ nickname: 'Grace', source: { kind: 'trick', puzzle: longBomb } });
    expect(typeof rebuildChallenge(reply as Challenge)).toBe('object');
    expect(errors).toEqual([]);
  });

  test('explains a damaged link, and one from an older engine', async ({ page }) => {
    await openGame(page, testSettings(), 1);
    await page.goto(`./#c=${link().slice(0, -3)}`);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'This link has lost its way' })).toBeVisible();
    await page.goto(`./#c=${link({ version: 0 })}`);
    await page.reload();
    await expect(
      page.getByRole('dialog', { name: 'A challenge from an older Skyline' }),
    ).toBeVisible();
  });

  test('a Quick Match hit can be sent from its replay', async ({ page }) => {
    test.setTimeout(240_000);
    const settings = testSettings({ points: 2, world: 'earth' });
    const seed = 6;
    const state = mirrorMatch(settings, seed);
    const hit = findThrow(state, (shot) => shot.victim === 1);
    if (!hit) throw new Error('No hit in this city.');
    await openGame(page, settings, seed);
    await startFromTitle(page);
    await typeThrow(page, hit.angle, hit.velocity);
    await runUntilPhase(page, 'replay');
    await page.getByRole('button', { name: 'Challenge a friend' }).click({ force: true });
    const maker = page.getByRole('dialog', { name: /Challenge a friend/ });
    const message = (await maker.locator('.share-box__text').textContent()) ?? '';
    const code = /#c=([A-Za-z0-9_-]+)/.exec(message)?.[1] ?? null;
    const challenge = decodeChallenge(code) as Challenge;
    expect(challenge.nickname).toBeNull();
    expect(challenge.source).toMatchObject({ kind: 'quick', round: 1, world: 'earth' });
    const rebuilt = rebuildChallenge(challenge);
    expect(typeof rebuilt === 'object' && rebuilt.theirs.hit).toBe(true);
    expect(challengeStart(challenge.source)?.state.round.wind).toBe(challenge.wind);
  });
});
