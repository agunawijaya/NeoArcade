import { describe, expect, it } from 'vitest';
import { SUN_MOVES, THE_END_MOVES, TICKS_PER_MOVE } from './constants';
import { createMatch, matchScore, stepMatch, type MatchSetup } from './match';
import { CLASSIC_RULES, roundTuning } from './rules';
import { flatMap, HUMAN } from './test-worlds';
import type { Plane } from './world';

const MOVE = TICKS_PER_MOVE;

function setup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  const map = flatMap({
    targets: [
      { kind: 'hangar', side: 1, x: 800 },
      { kind: 'tank', side: 0, x: 300 },
    ],
  });
  return {
    rules: CLASSIC_RULES,
    mapFor: () => map,
    seats: [HUMAN],
    seed: 3,
    rounds: Infinity,
    versus: false,
    ...overrides,
  };
}

function destroyEnemyTargets(match: ReturnType<typeof createMatch>) {
  for (const target of match.world.targets) if (target.side === 1) target.standing = false;
}

describe('round escalation', () => {
  it('adds one to every speed and a hit to every target each round, and targets fire back from round two', () => {
    expect(roundTuning(0)).toMatchObject({
      minSpeed: 4,
      maxSpeed: 8,
      bulletSpeed: 10,
      targetToughness: 10,
      targetRange: 0,
    });
    expect(roundTuning(1)).toMatchObject({
      minSpeed: 5,
      maxSpeed: 9,
      bulletSpeed: 11,
      targetToughness: 20,
      targetRange: 75,
    });
    expect(roundTuning(1).targetFiresEveryMove).toBe(false);
    expect(roundTuning(2).targetFiresEveryMove).toBe(true);
    expect(roundTuning(6).targetRange).toBe(150);
    expect(roundTuning(9).targetRange).toBe(150);
  });
});

describe('winning a round', () => {
  it('sends the winner into the sun, pays a bonus for every plane left, then starts a faster round', () => {
    const match = createMatch(setup());
    stepMatch(match);
    destroyEnemyTargets(match);
    stepMatch(match);
    expect(match.phase).toBe('sun');
    expect((match.world.planes[0] as Plane).state).toBe('victory');
    // Five planes left: 25 + 50 + 75 + 100 + 125.
    expect(match.bonus).toBe(375);
    for (let tick = 0; tick < SUN_MOVES * MOVE; tick++) stepMatch(match);
    expect(match.phase).toBe('playing');
    expect(match.round).toBe(1);
    expect(match.world.tuning.minSpeed).toBe(5);
    expect(matchScore(match, 0)).toBe(375);
  });

  it('counts only the planes still in the hangar towards the bonus', () => {
    const match = createMatch(setup());
    (match.world.planes[0] as Plane).crashes = 3;
    destroyEnemyTargets(match);
    stepMatch(match);
    expect(match.bonus).toBe(25 + 50);
  });

  it('pays a pilot with planes without end (as the title demo has) a full squadron of bonus', () => {
    const match = createMatch(
      setup({ seats: [{ ...HUMAN, maxCrashes: Number.POSITIVE_INFINITY }] }),
    );
    destroyEnemyTargets(match);
    stepMatch(match);
    expect(match.phase).toBe('sun');
    expect(match.bonus).toBe(375);
  });

  it('on the last plane, only wins if that plane is still flying', () => {
    const match = createMatch(setup());
    const plane = match.world.planes[0] as Plane;
    plane.crashes = 4;
    plane.state = 'crashed';
    plane.stateTimer = 999;
    destroyEnemyTargets(match);
    stepMatch(match);
    expect(match.phase).toBe('the-end');
  });

  it('ends after the last round of a fixed-length match', () => {
    const match = createMatch(setup({ rounds: 1 }));
    destroyEnemyTargets(match);
    stepMatch(match);
    for (let tick = 0; tick < SUN_MOVES * MOVE; tick++) stepMatch(match);
    expect(match.phase).toBe('over');
    expect(matchScore(match, 0)).toBe(375);
  });
});

describe('losing', () => {
  it('shows THE END when the last plane is gone, then stops', () => {
    const match = createMatch(setup());
    const plane = match.world.planes[0] as Plane;
    plane.crashes = 4;
    plane.state = 'crashed';
    plane.stateTimer = 1;
    stepMatch(match);
    stepMatch(match);
    expect(plane.state).toBe('out');
    expect(match.phase).toBe('the-end');
    for (let tick = 0; tick < THE_END_MOVES * MOVE; tick++) stepMatch(match);
    expect(match.phase).toBe('over');
  });
});

describe('versus', () => {
  it('ends the round when a side loses its last target, and the higher score takes it', () => {
    const match = createMatch(
      setup({
        versus: true,
        seats: [HUMAN, { ...HUMAN, side: 1, base: 1 }],
        rules: { ...CLASSIC_RULES, lossPenalties: false },
      }),
    );
    match.world.score = [100, 300];
    destroyEnemyTargets(match);
    stepMatch(match);
    expect(match.phase).toBe('sun');
    expect(match.lastWinner).toBe(1);
  });
});
