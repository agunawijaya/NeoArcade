import { createArcadePass } from '@shared/pass';
import { describe, expect, it } from 'vitest';
import manifest from '../../pass.manifest';
import { makeDonkey } from '../engine/hazards';
import { NEAR_MISS_TIERS } from '../engine/scoring';
import { PassReporter, type DonkeyPass, type RunSummary } from './pass-report';

function reporter() {
  const arcade = createArcadePass({
    backend: null,
    now: () => new Date('2026-10-01T12:00:00Z'),
    watchOtherTabs: false,
  });
  const pass = arcade.forGame(manifest) as DonkeyPass;
  return { pass, report: new PassReporter(pass) };
}

const donkey = (role: 'single' | 'wobbler' = 'single') => makeDonkey(1, 10, 0, role);
const whisker = NEAR_MISS_TIERS[1]!;

describe('PassReporter', () => {
  it('counts during play and writes to the Pass only when asked', () => {
    const { pass, report } = reporter();
    for (let index = 0; index < 3; index++) {
      report.observe(
        { type: 'pass', hazard: donkey(), threatened: false, nearMiss: null, neutral: false },
        1,
      );
    }
    expect(pass.progressOf('hee-haw-hundred')).toBe(0);
    report.commit();
    expect(pass.progressOf('hee-haw-hundred')).toBe(3);
    expect(pass.statOf('dodged')).toBe(3);
    report.commit();
    expect(pass.progressOf('hee-haw-hundred')).toBe(3);
  });

  it('unlocks Close Shave on the first near miss, and the ×5 streak badge', () => {
    const { pass, report } = reporter();
    report.observe(
      { type: 'near-miss', tier: whisker, combo: 1, multiplier: 1, points: 100, hazard: donkey() },
      1,
    );
    expect(pass.hasBadge('close-shave')).toBe(true);
    expect(pass.hasBadge('combo-five')).toBe(false);
    report.observe(
      { type: 'near-miss', tier: whisker, combo: 8, multiplier: 5, points: 500, hazard: donkey() },
      2,
    );
    expect(pass.hasBadge('combo-five')).toBe(true);
    report.commit();
    expect(pass.progressOf('whisker-master')).toBe(2);
    expect(pass.statOf('bestCombo')).toBe(8);
  });

  it('catches the secrets: a crash right after a carrot, a finish on the last life', () => {
    const { pass, report } = reporter();
    report.observe({ type: 'carrot', hazard: donkey() }, 10);
    report.observe({ type: 'crash', hazard: donkey() }, 10.5);
    expect(pass.hasBadge('worth-it')).toBe(true);
    report.finishRun({
      mode: 'endless',
      metres: 3200,
      crashes: 3,
      finished: false,
      livesLeft: 0,
      scored: false,
    });
    expect(pass.hasBadge('long-haul')).toBe(true);
    expect(pass.hasBadge('photo-finish')).toBe(false);
    report.finishRun({
      mode: 'daily',
      metres: 2600,
      crashes: 2,
      finished: true,
      livesLeft: 1,
      scored: true,
      dailyNumber: 4,
      dailyStreak: 7,
    });
    expect(pass.hasBadge('photo-finish')).toBe(true);
    expect(pass.hasBadge('daily-driver')).toBe(true);
    expect(pass.hasBadge('clean-daily')).toBe(false);
  });

  it('awards Road Trip legs, the first boss, clean routes and the whole trip', () => {
    const { pass, report } = reporter();
    const leg: RunSummary = {
      mode: 'trip',
      metres: 900,
      crashes: 0,
      finished: true,
      livesLeft: 3,
      scored: false,
      trip: {
        route: 'farm',
        leg: 2,
        stars: 3,
        newStars: 3,
        firstFinish: true,
        routeClean: true,
        allRoutes: false,
        allStars: false,
        totalStars: 9,
      },
    };
    const before = pass.level;
    report.finishRun(leg);
    for (const badge of ['first-leg', 'herd-immunity', 'zero-harmed'] as const)
      expect(pass.hasBadge(badge)).toBe(true);
    expect(pass.hasBadge('road-tripper')).toBe(false);
    expect(pass.statOf('stars')).toBe(9);
    expect(pass.level).toBeGreaterThanOrEqual(before);
  });

  it('settles duels: Donkey Loses!, a flawless win, Stubborn, Retro Rig, Donkey Supreme', () => {
    const { pass, report } = reporter();
    report.driverPoint();
    expect(pass.hasBadge('donkey-loses')).toBe(true);
    report.finishDuel({
      versus: false,
      winner: 'driver',
      scores: { donkey: 0, driver: 5 },
      wonAsDonkey: false,
      cgaThroughout: true,
      donkeyStreak: 10,
    });
    for (const badge of ['flawless-duel', 'retro-rig', 'stubborn'] as const)
      expect(pass.hasBadge(badge)).toBe(true);
    report.finishDuel({
      versus: true,
      winner: 1,
      scores: { donkey: 0, driver: 0 },
      wonAsDonkey: true,
      cgaThroughout: false,
      donkeyStreak: 0,
    });
    expect(pass.hasBadge('donkey-supreme')).toBe(true);
    expect(pass.statOf('runs')).toBe(2);
  });

  it('rewards the surge in Rival Driver: Slip Through, Door Shut, Front Runner', () => {
    const { pass, report } = reporter();
    const dodge = (car: 0 | 1, ahead: boolean) =>
      report.observeRace({ type: 'dodge', car, hazard: donkey(), meter: 1, ahead }, 1);
    const cut = { type: 'move', from: 0, to: 1, merging: false, cut: true } as const;
    // What the CPU does counts for nothing.
    report.observeRace({ ...cut, car: 1 }, 1);
    for (let row = 0; row < 12; row++) dodge(1, true);
    expect(pass.hasBadge('slip-through')).toBe(false);
    expect(pass.hasBadge('front-runner')).toBe(false);
    report.observeRace({ ...cut, car: 0 }, 1);
    expect(pass.hasBadge('slip-through')).toBe(true);
    // Ten rows Ahead, but not in one round.
    for (let row = 0; row < 6; row++) dodge(0, true);
    report.observeRace({ type: 'round', round: 2 }, 1);
    for (let row = 0; row < 9; row++) dodge(0, row !== 4);
    expect(pass.hasBadge('front-runner')).toBe(false);
    dodge(0, true);
    dodge(0, true);
    expect(pass.hasBadge('front-runner')).toBe(true);
    report.observeRace(
      { type: 'crash', car: 1, hazard: donkey(), trapped: true, doorShut: true, ahead: 0 },
      1,
    );
    expect(pass.hasBadge('door-shut')).toBe(true);
    report.commit();
    expect(pass.statOf('aheadRows')).toBe(16);
  });
});
