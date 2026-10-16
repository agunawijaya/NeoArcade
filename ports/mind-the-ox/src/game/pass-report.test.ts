import { createArcadePass } from '@shared/pass';
import { describe, expect, it } from 'vitest';
import manifest from '../../pass.manifest';
import { flatMap, testWorld } from '../engine/test-worlds';
import { CHAPTERS, TOTAL_STARS } from './campaign';
import { planMode, type ModeRequest } from './modes';
import { PassReporter, type MatchContext, type OxPass } from './pass-report';
import type { RoundRecord, SessionOutcome } from './session';
import { RoundTally } from './stats';

function reporter() {
  const arcade = createArcadePass({
    backend: null,
    now: () => new Date('2026-10-16T12:00:00Z'),
    watchOtherTabs: false,
  });
  const pass = arcade.forGame(manifest) as OxPass;
  return { pass, report: new PassReporter(pass) };
}

const PILOT = 7;
const plan = (request: ModeRequest) =>
  planMode(request, { seed: 3, flight: 'smooth', autoRoll: true, secretWeapons: false });

function round(winner: 0 | 1 | null, change: (tally: RoundTally) => void = () => {}): RoundRecord {
  const tally = new RoundTally([PILOT], new Set());
  change(tally);
  return { round: 0, winner, tally, score: [0, 0], bonus: 0 };
}

const CONTEXT: MatchContext = {
  newStars: 0,
  totalStars: 0,
  chaptersWon: 0,
  dailyCounted: false,
  dailyStreak: 0,
  classicBest: 0,
  seaStars: 0,
  seaMissionsWon: 0,
};

describe('PassReporter', () => {
  it('pays for every round and unlocks Into the Sun for a won one', () => {
    const { pass, report } = reporter();
    const classic = plan({ kind: 'classic' });
    report.roundEnded(round(1), classic, [{ side: 0, pilot: undefined }]);
    expect(pass.hasBadge('into-the-sun')).toBe(false);
    expect(report.earned).toBe(10);
    report.roundEnded(round(0), classic, [{ side: 0, pilot: undefined }]);
    expect(pass.hasBadge('into-the-sun')).toBe(true);
    expect(pass.hasBadge('like-1984')).toBe(true);
    expect(pass.statOf('rounds')).toBe(2);
    expect(pass.statOf('roundsWon')).toBe(1);
  });

  it('turns a pilot’s moments into badges: the splat, fumes, the stall at home, a loop', () => {
    const { pass, report } = reporter();
    const record = round(1, (tally) => {
      tally.absorb(testWorld(flatMap()), [
        { type: 'splat', plane: PILOT, kind: 'bird' },
        { type: 'landed', plane: PILOT, fuel: 0.012 },
        { type: 'crash', plane: PILOT, side: 0, x: 0, y: 0, atHome: true, stalled: true },
      ]);
    });
    report.roundEnded(record, plan({ kind: 'classic' }), [
      { side: 0, pilot: record.tally.pilot(PILOT) },
    ]);
    for (const badge of ['splat', 'running-on-fumes', 'grounded', 'wheels-down'] as const)
      expect(pass.hasBadge(badge), badge).toBe(true);
    expect(pass.hasBadge('loop-the-loop')).toBe(false);
  });

  it('counts depots, kills and craters towards their badges, and an ox is a Moo', () => {
    const { pass, report } = reporter();
    const record = round(null, (tally) => {
      tally.sides[0].depots = 3;
      tally.sides[0].planesDowned = 2;
      tally.sides[0].craters = 5;
      tally.sides[0].oxen = 1;
    });
    report.roundEnded(record, plan({ kind: 'classic' }), [{ side: 0, pilot: undefined }]);
    expect(pass.progressOf('depot-buster')).toBe(3);
    expect(pass.progressOf('sharpshooter')).toBe(2);
    expect(pass.progressOf('crater-maker')).toBe(5);
    expect(pass.hasBadge('moo')).toBe(true);
  });

  it('marks a chapter won without harming an ox, and the last chapter and full marks', () => {
    const { pass, report } = reporter();
    const chapter = plan({ kind: 'campaign', chapter: 'ox-pasture' });
    const outcome: SessionOutcome = {
      plan: chapter,
      rounds: [round(0)],
      scores: [900, 0],
      roundsWon: [1, 0],
    };
    report.matchOver(outcome, {
      ...CONTEXT,
      newStars: 3,
      totalStars: TOTAL_STARS,
      chaptersWon: CHAPTERS.length,
    });
    expect(pass.hasBadge('mind-the-ox')).toBe(true);
    expect(pass.hasBadge('last-chapter')).toBe(true);
    expect(pass.hasBadge('full-marks')).toBe(true);
    expect(pass.statOf('stars')).toBe(TOTAL_STARS);
    expect(report.earned).toBe(80);
  });

  it('pays the first Brutal win as an Ace, and keeps the daily streak', () => {
    const { pass, report } = reporter();
    const dogfight = plan({ kind: 'dogfight', opponents: 1, level: 'brutal' });
    report.matchOver(
      { plan: dogfight, rounds: [round(0)], scores: [0, 0], roundsWon: [1, 0] },
      CONTEXT,
    );
    expect(pass.hasBadge('ace')).toBe(true);
    expect(report.earned).toBe(100);
    const daily = plan({
      kind: 'daily',
      day: { key: '2026-10-16', number: 2, seed: 9 },
      practice: false,
    });
    report.matchOver(
      { plan: daily, rounds: [round(1)], scores: [0, 0], roundsWon: [0, 0] },
      { ...CONTEXT, dailyCounted: true, dailyStreak: 7 },
    );
    expect(pass.hasBadge('daily-sortie')).toBe(true);
    expect(pass.hasBadge('daily-streak')).toBe(true);
    expect(pass.statOf('bestStreak')).toBe(7);
  });

  it('turns the moments at sea into badges: the trap, the bolter, wet feet, a torpedo hit', () => {
    const { pass, report } = reporter();
    const mission = plan({ kind: 'at-sea', chapter: 'night-recovery' });
    const record = round(1, (tally) => {
      tally.absorb(testWorld(flatMap()), [
        { type: 'bolter', plane: PILOT, ship: 1 },
        { type: 'trap', plane: PILOT, ship: 1, wire: 2 },
        { type: 'ditched', plane: PILOT, side: 0, x: 0, y: 0, rescuedBy: 3 },
        { type: 'torpedo-hit', ship: 4, x: 0, y: 0, by: 0, distance: 320 },
        { type: 'ship-sinking', ship: 5, kind: 'carrier', side: 1, by: 0, x: 0 },
      ]);
    });
    report.roundEnded(record, mission, [{ side: 0, pilot: record.tally.pilot(PILOT) }]);
    for (const badge of [
      'trap',
      'bolter',
      'wet-feet',
      'fish-in-the-water',
      'night-owl-at-sea',
      'carrier-killer',
    ] as const)
      expect(pass.hasBadge(badge), badge).toBe(true);
    expect(pass.statOf('traps')).toBe(1);
    expect(pass.statOf('shipsSunk')).toBe(1);
  });

  it('marks an intercept won clean, The Raid, and every mission at sea', () => {
    const { pass, report } = reporter();
    const intercept = plan({ kind: 'at-sea', chapter: 'intercept' });
    report.roundEnded(round(0), intercept, [{ side: 0, pilot: undefined }]);
    expect(pass.hasBadge('not-on-my-deck')).toBe(true);
    const raid = plan({ kind: 'at-sea', chapter: 'the-raid' });
    report.matchOver(
      { plan: raid, rounds: [round(0)], scores: [0, 0], roundsWon: [1, 0] },
      { ...CONTEXT, newStars: 1, seaStars: 24, seaMissionsWon: 8 },
    );
    expect(pass.hasBadge('tondern')).toBe(true);
    expect(pass.hasBadge('fleet-admiral')).toBe(true);
    expect(pass.statOf('seaStars')).toBe(24);
  });
});
