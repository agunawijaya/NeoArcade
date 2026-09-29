import { describe, expect, it } from 'vitest';
import type { PlayerIndex } from './gorillas';
import {
  createMatch,
  createRound,
  matchFromRound,
  previewTurn,
  startNextRound,
  takeTurn,
  type MatchOptions,
  type MatchState,
} from './match';
import { simulateShot, type ShotRecord } from './shot';

const options = (overrides: Partial<MatchOptions> = {}): MatchOptions => ({
  // A city where both gorillas can be hit without long searching.
  seed: 6,
  world: 'earth',
  points: 3,
  format: 'firstTo',
  powerUps: [],
  ...overrides,
});

/** Finds a throw for whoever's turn it is that would hit `victim` if it had no shield. */
function throwHitting(state: MatchState, victim: PlayerIndex) {
  const { round } = state;
  for (let angle = 15; angle <= 85; angle += 0.5) {
    for (let velocity = 10; velocity <= 200; velocity++) {
      const shot = simulateShot(
        {
          terrain: round.terrain,
          gorillas: round.gorillas,
          wind: round.wind,
          gravity: round.world.gravity,
          balloon: round.balloon,
          shields: [false, false],
        },
        { thrower: state.turn, angle, velocity, powerUp: null },
      );
      if (shot.victim === victim) return { angle, velocity };
    }
  }
  throw new Error('No throw hits in this city.');
}

// Thrown backwards, hard: it leaves the screen behind the thrower.
const miss = { angle: 170, velocity: 200 };
const selfHit = { angle: 45, velocity: 1 };

describe('createMatch', () => {
  it('builds the same first round from the same seed', () => {
    const first = createMatch(options());
    const second = createMatch(options());
    expect(first.round.terrain).toEqual(second.round.terrain);
    expect(first.round.wind).toBe(second.round.wind);
    expect(createMatch(options({ seed: 2 })).round.terrain).not.toEqual(first.round.terrain);
  });

  it('starts with player 1 and no score', () => {
    const state = createMatch(options());
    expect(state.turn).toBe(0);
    expect(state.scores).toEqual([0, 0]);
    expect(state.status).toBe('playing');
  });

  it('can pick a random world each round', () => {
    const worlds = new Set<string>();
    const state = createMatch(options({ world: 'random', points: 30 }));
    for (let round = 0; round < 12; round++) {
      worlds.add(state.round.world.id);
      takeTurn(state, selfHit);
      startNextRound(state);
    }
    expect(worlds.size).toBeGreaterThan(1);
  });

  it('has no wind on the Moon', () => {
    for (let seed = 1; seed < 20; seed++) {
      expect(createMatch(options({ seed, world: 'moon' })).round.wind).toBe(0);
    }
  });
});

describe('turns and scoring', () => {
  it('alternates throws on a miss', () => {
    const state = createMatch(options());
    takeTurn(state, miss);
    expect(state.turn).toBe(1);
    takeTurn(state, miss);
    expect(state.turn).toBe(0);
  });

  it('gives the thrower the point for hitting the opponent', () => {
    const state = createMatch(options());
    const result = takeTurn(state, throwHitting(state, 1));
    expect(result.scorer).toBe(0);
    expect(state.scores).toEqual([1, 0]);
    expect(state.status).toBe('roundOver');
  });

  it('gives the opponent the point when a gorilla hits itself', () => {
    const state = createMatch(options());
    const result = takeTurn(state, selfHit);
    expect(result.shot.victim).toBe(0);
    expect(result.scorer).toBe(1);
    expect(state.scores).toEqual([0, 1]);
  });

  it('keeps alternating across rounds, like the original', () => {
    const state = createMatch(options());
    takeTurn(state, selfHit);
    startNextRound(state);
    expect(state.turn).toBe(1);
    expect(state.round.number).toBe(2);
  });

  it('builds a fresh city for the next round', () => {
    const state = createMatch(options());
    const firstCity = state.round.terrain.buildings;
    takeTurn(state, selfHit);
    startNextRound(state);
    expect(state.round.terrain.buildings).not.toEqual(firstCity);
    expect(state.round.terrain.craters).toEqual([]);
  });

  it('refuses throws after the round ends', () => {
    const state = createMatch(options());
    takeTurn(state, selfHit);
    expect(() => takeTurn(state, miss)).toThrow();
    expect(() => startNextRound(createMatch(options()))).toThrow();
  });

  it('ends a first-to match as soon as someone reaches the target', () => {
    const state = createMatch(options({ points: 2 }));
    takeTurn(state, selfHit); // player 1 hits itself: 0–1
    startNextRound(state);
    takeTurn(state, selfHit); // player 2 hits itself: 1–1
    expect(state.status).toBe('roundOver');
    startNextRound(state);
    takeTurn(state, selfHit); // player 1 again: 1–2
    expect(state.status).toBe('matchOver');
    expect(state.winner).toBe(1);
  });

  it('plays a total-points match to the last round and allows a draw', () => {
    const state = createMatch(options({ points: 2, format: 'total' }));
    takeTurn(state, selfHit); // player 1 hits itself: player 2 scores
    startNextRound(state);
    takeTurn(state, selfHit); // player 2 hits itself: player 1 scores
    expect(state.status).toBe('matchOver');
    expect(state.scores).toEqual([1, 1]);
    expect(state.winner).toBeNull();
  });
});

describe('power-ups in a match', () => {
  it('spends a held power-up when asked and not otherwise', () => {
    const state = createMatch(options());
    state.held[0] = 'calm';
    takeTurn(state, { ...miss, usePowerUp: false });
    expect(state.held[0]).toBe('calm');
    takeTurn(state, miss);
    const result = takeTurn(state, { ...miss, usePowerUp: true });
    expect(result.usedPowerUp).toBe('calm');
    expect(result.shot.wind).toBe(0);
    expect(state.held[0]).toBeNull();
  });

  it('raises a shield that saves the gorilla from one hit', () => {
    const state = createMatch(options());
    state.held[0] = 'shield';
    takeTurn(state, { ...miss, usePowerUp: true });
    expect(state.round.shields).toEqual([true, false]);
    const result = takeTurn(state, throwHitting(state, 0));
    expect(result.shot.victim).toBeNull();
    expect(result.scorer).toBeNull();
    expect(state.round.shields).toEqual([false, false]);
  });

  it('gives a popped balloon’s crate to the thrower', () => {
    const state = createMatch(options({ powerUps: ['golden'] }));
    const hit = throwHitting(state, 1);
    const path = simulateShot(
      {
        terrain: state.round.terrain,
        gorillas: state.round.gorillas,
        wind: state.round.wind,
        gravity: state.round.world.gravity,
        balloon: null,
        shields: [false, false],
      },
      { thrower: 0, ...hit, powerUp: null },
    );
    const passing = path.tracks[0]?.points[8];
    state.round.balloon = { x: passing?.x ?? 0, y: passing?.y ?? 0, drift: 0, kind: 'golden' };
    takeTurn(state, hit);
    expect(state.held[0]).toBe('golden');
  });

  it('sends balloons only when power-ups are on', () => {
    let balloons = 0;
    for (let seed = 1; seed < 60; seed++) {
      if (createMatch(options({ seed })).round.balloon) balloons++;
    }
    expect(balloons).toBe(0);
    for (let seed = 1; seed < 60; seed++) {
      if (createMatch(options({ seed, powerUps: ['tri', 'golden'] })).round.balloon) balloons++;
    }
    expect(balloons).toBeGreaterThan(5);
  });
});

describe('previewTurn', () => {
  it('predicts the very throw takeTurn makes', () => {
    const state = createMatch(options());
    const hit = throwHitting(state, 1);
    const preview = previewTurn(state, hit);
    const result = takeTurn(state, hit);
    expect(preview.victim).toBe(1);
    expect(preview.tracks).toEqual(result.shot.tracks);
    expect(preview.events).toEqual(result.shot.events);
  });

  it('leaves the match exactly as it was', () => {
    const state = createMatch(options({ powerUps: ['tri'] }));
    state.held[0] = 'tri';
    const before = structuredClone({ ...state, rng: null, round: { ...state.round, rng: null } });
    previewTurn(state, { ...throwHitting(state, 1), usePowerUp: true });
    const after = structuredClone({ ...state, rng: null, round: { ...state.round, rng: null } });
    expect(after).toEqual(before);
  });

  it('includes an armed power-up', () => {
    const state = createMatch(options());
    state.held[0] = 'tri';
    const aim = throwHitting(state, 1);
    const kinds = (shot: ShotRecord) => shot.events.map((event) => event.type);
    expect(kinds(previewTurn(state, aim))).not.toContain('split');
    expect(kinds(previewTurn(state, { ...aim, usePowerUp: true }))).toContain('split');
  });
});

describe('solo rounds and rebuilt rounds', () => {
  it('keeps the turn with the thrower when the other gorilla is a still target', () => {
    const state = createMatch(options({ solo: true }));
    takeTurn(state, miss);
    takeTurn(state, miss);
    expect(state.turn).toBe(0);
    expect(state.round.throws).toBe(2);
  });

  it('ends the match undecided when the throws run out', () => {
    const state = createMatch(options({ solo: true, throwLimit: 3, points: 1 }));
    takeTurn(state, miss);
    takeTurn(state, miss);
    expect(state.status).toBe('playing');
    takeTurn(state, miss);
    expect(state.status).toBe('matchOver');
    expect(state.winner).toBeNull();
  });

  it('rebuilds a round from its seed alone', () => {
    const state = createMatch(options({ twists: ['drone', 'gusts'] }));
    takeTurn(state, selfHit);
    startNextRound(state);
    const rebuilt = createRound(2, state.round.seed, state.options);
    expect(rebuilt.terrain).toEqual(state.round.terrain);
    expect(rebuilt.wind).toBe(state.round.wind);
    expect(rebuilt.gorillas).toEqual(state.round.gorillas);
    expect(rebuilt.hazards).toEqual(state.round.hazards);
  });

  it('picks a match up from a round, a turn and the power-ups held', () => {
    const first = createMatch(options());
    const round = createRound(1, first.round.seed, first.options);
    const resumed = matchFromRound(first.options, round, 1, [null, 'golden']);
    expect(resumed.turn).toBe(1);
    expect(resumed.held).toEqual([null, 'golden']);
    const aim = { ...throwHitting(resumed, 0), usePowerUp: true };
    expect(takeTurn(resumed, aim).usedPowerUp).toBe('golden');
  });
});
