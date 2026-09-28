import { describe, expect, it } from 'vitest';
import { createAutopilot } from './autopilot';
import { CLASSIC_SPEED, STEP_SECONDS, WINNING_CLIMB } from './constants';
import { gapOf } from './drive';
import {
  classicDuel,
  createDuel,
  donkeyPlayer,
  stepDuel,
  versusDuel,
  VERSUS_COMMIT_SECONDS,
  VERSUS_SPEED,
  type DuelEvent,
  type DuelState,
  type WaveKind,
} from './duel';
import { revealGap } from './sight';

function play(
  duel: DuelState,
  steps: number,
  inputs: (duel: DuelState, step: number) => { driver: boolean; donkey?: boolean },
) {
  const events: DuelEvent[] = [];
  for (let step = 0; step < steps && duel.phase.kind !== 'over'; step++) {
    events.push(...stepDuel(duel, inputs(duel, step)));
  }
  return events;
}

const pilot = (reactionSeconds = 0.1) => {
  const autopilot = createAutopilot({ reactionSeconds, pressGap: 0.1 });
  return (duel: DuelState) => ({
    driver: duel.phase.kind === 'drive' && autopilot.decide(duel.drive),
  });
};

describe('Classic Duel', () => {
  it('scores a crash for the Donkey and sends the car back to the start', () => {
    const duel = createDuel(classicDuel(1));
    const events = play(duel, 60 * 60, () => ({ driver: false }));
    const firstPoint = events.find((event) => event.type === 'point');
    expect(firstPoint).toEqual({ type: 'point', side: 'donkey', player: null });
    const round = events.find((event) => event.type === 'round');
    expect(round).toBeDefined();
    expect(duel.scores.donkey).toBeGreaterThan(0);
    expect(duel.scores.driver).toBe(0);
  });

  it('climbs once per donkey and gives the Driver a point after eleven dodges', () => {
    const duel = createDuel(classicDuel(2));
    const events = play(duel, 60 * 40, pilot());
    const firstPoint = events.findIndex((event) => event.type === 'point');
    // The first wave starts with the duel itself; the other ten are events.
    const laterWaves = events.slice(0, firstPoint).filter((event) => event.type === 'wave');
    expect(1 + laterWaves.length).toBe(WINNING_CLIMB - 1);
    expect(events[firstPoint]).toMatchObject({ side: 'driver' });
    expect(duel.scores.driver).toBeGreaterThanOrEqual(1);
  });

  it('ends at the points to win', () => {
    const duel = createDuel(classicDuel(3, 2));
    const events = play(duel, 60 * 200, () => ({ driver: false }));
    expect(duel.phase.kind).toBe('over');
    expect(duel.winner).toBe('donkey');
    expect(events.at(-1)).toEqual({ type: 'match-over', winner: 'donkey' });
  });

  it('with hazards on, mixes in every kind of wave, and each can be dodged', () => {
    const seen = new Set<WaveKind>();
    for (let seed = 1; seed <= 6; seed++) {
      const duel = createDuel(classicDuel(seed, 3, true));
      const events = play(duel, 60 * 200, pilot(0.1));
      for (const event of events) if (event.type === 'wave') seen.add(event.wave.kind);
      expect(duel.scores.donkey).toBe(0);
    }
    expect(seen).toEqual(new Set(['plain', 'wobbler', 'pair', 'mud', 'three-lanes', 'carrot']));
  });

  it('runs at the original speed', () => {
    expect(createDuel(classicDuel(1)).drive.speed).toBe(CLASSIC_SPEED);
  });
});

describe('Donkey vs Driver', () => {
  it('lets the donkey player steer until the commit line, and not after', () => {
    const duel = createDuel(versusDuel(4));
    const rival = duel.wave?.donkeys[0];
    if (!rival) throw new Error('No donkey in the first wave.');
    const before = rival.lane;
    stepDuel(duel, { driver: false, donkey: true });
    expect(rival.lane).toBe(1 - before);
    while (!rival.committed) stepDuel(duel, { driver: false });
    const committedLane = rival.lane;
    stepDuel(duel, { driver: false, donkey: true });
    expect(rival.lane).toBe(committedLane);
  });

  it('always commits a fair window before the car, even at the top of the road', () => {
    for (let climb = 1; climb < WINNING_CLIMB; climb++) {
      const commitGap = VERSUS_SPEED * VERSUS_COMMIT_SECONDS;
      // The donkey is in view before it commits, so feints can be seen.
      expect(revealGap(climb)).toBeGreaterThanOrEqual(commitGap);
      expect(commitGap / VERSUS_SPEED).toBeGreaterThanOrEqual(0.45 - 1e-9);
    }
  });

  it('commits the donkey at the commit gap', () => {
    const duel = createDuel(versusDuel(5));
    const rival = duel.wave?.donkeys[0];
    if (!rival) throw new Error('No donkey in the first wave.');
    let gapAtCommit = Infinity;
    for (let step = 0; step < 600 && !rival.committed; step++) {
      stepDuel(duel, { driver: false });
      if (rival.committed) gapAtCommit = gapOf(duel.drive, rival);
    }
    const commitGap = VERSUS_SPEED * VERSUS_COMMIT_SECONDS;
    expect(gapAtCommit).toBeLessThanOrEqual(commitGap);
    expect(gapAtCommit).toBeGreaterThan(commitGap - VERSUS_SPEED * STEP_SECONDS);
  });

  it('swaps roles every point and scores each player', () => {
    const duel = createDuel(versusDuel(6, 3));
    expect(duel.driver).toBe(0);
    // The donkey player always drops the donkey into the car's lane.
    const events = play(duel, 60 * 120, (d) => {
      const rival = d.wave?.donkeys.find((donkey) => !donkey.committed);
      return { driver: false, donkey: rival !== undefined && rival.lane !== d.drive.car.lane };
    });
    const points = events.filter((event) => event.type === 'point');
    expect(points.map((point) => point.type === 'point' && point.player)).toEqual([1, 0, 1, 0, 1]);
    expect(duel.playerScores).toEqual([2, 3]);
    expect(duel.winner).toBe(1);
    expect(donkeyPlayer(duel)).toBe(1 - duel.driver);
  });
});
