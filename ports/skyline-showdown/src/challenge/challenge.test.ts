import { describe, expect, it } from 'vitest';
import { dailySkyline, DAILY, startDaily } from '../daily/daily';
import { createMatch, startNextRound, takeTurn, type TurnAim } from '../engine/match';
import { ENGINE_VERSION } from '../engine/version';
import { STAGES } from '../tour/stages';
import { PUZZLES } from '../tricks/packs';
import { judgeChallenge, rebuildChallenge, throwOutcome, type RebuiltChallenge } from './challenge';
import {
  cleanNickname,
  decodeChallenge,
  encodeChallenge,
  fromBase64Url,
  toBase64Url,
  type Challenge,
} from './link';

const miss: TurnAim = { angle: 170, velocity: 200 };

const quickChallenge = (overrides: Partial<Challenge> = {}): Challenge => ({
  version: ENGINE_VERSION,
  source: {
    kind: 'quick',
    roundSeed: 123_456_789,
    round: 3,
    world: 'random',
    powerUps: ['golden', 'tri', 'bouncer'],
    firstTurn: 1,
    held: ['tri', null],
  },
  wind: -7,
  throws: [
    { angle: 45.3, velocity: 61, usePowerUp: false },
    { angle: 38.25, velocity: 140, usePowerUp: true },
  ],
  nickname: null,
  ...overrides,
});

function rebuilt(challenge: Challenge): RebuiltChallenge {
  const result = rebuildChallenge(challenge);
  if (typeof result === 'string') throw new Error(`Could not rebuild: ${result}`);
  return result;
}

/** Plays into a Quick Match's second round, records it the way the game does, and returns both. */
function playedRound(seed: number, aims: TurnAim[]) {
  const state = createMatch({
    seed,
    world: 'random',
    points: 5,
    format: 'firstTo',
    powerUps: ['tri', 'golden'],
  });
  takeTurn(state, { angle: 45, velocity: 1 });
  startNextRound(state);
  const challenge: Challenge = {
    version: ENGINE_VERSION,
    source: {
      kind: 'quick',
      roundSeed: state.round.seed,
      round: state.round.number,
      world: 'random',
      powerUps: ['tri', 'golden'],
      firstTurn: state.turn,
      held: [...state.held],
    },
    wind: state.round.wind,
    throws: aims,
    nickname: null,
  };
  const results = aims.map((aim) => takeTurn(state, aim));
  return { results, challenge };
}

describe('challenge links', () => {
  it('come back exactly as they went, for every kind of source', () => {
    const sources: Challenge['source'][] = [
      quickChallenge().source,
      { kind: 'tour', stage: 7, roundSeed: 42, round: 2, firstTurn: 0 },
      { kind: 'trick', puzzle: 23 },
      { kind: 'daily', day: 142 },
    ];
    for (const source of sources) {
      const challenge = quickChallenge({ source, nickname: 'Ada' });
      expect(decodeChallenge(encodeChallenge(challenge))).toEqual(challenge);
    }
  });

  it('are short and safe to put in an address', () => {
    const link = encodeChallenge(quickChallenge());
    expect(link).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(link.length).toBeLessThan(40);
  });

  it('carry no name unless one was typed', () => {
    const anonymous = decodeChallenge(encodeChallenge(quickChallenge()));
    expect(anonymous).toMatchObject({ nickname: null });
    const named = encodeChallenge(quickChallenge({ nickname: 'Ada' }));
    expect(named.length).toBeGreaterThan(encodeChallenge(quickChallenge()).length);
  });

  it('notice any single character changed or dropped', () => {
    const link = encodeChallenge(quickChallenge({ nickname: 'Grace' }));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let index = 0; index < link.length; index++) {
      const swapped = alphabet[(alphabet.indexOf(link[index] as string) + 17) % 64];
      const changed = link.slice(0, index) + swapped + link.slice(index + 1);
      const decoded = decodeChallenge(changed);
      // The last character carries a few spare bits; changing only those changes nothing.
      if (decoded !== 'damaged') expect(decoded).toEqual(decodeChallenge(link));
    }
    expect(decodeChallenge(link.slice(0, -1))).toBe('damaged');
    expect(decodeChallenge(link.slice(0, 8))).toBe('damaged');
    expect(decodeChallenge(`${link}AAAA`)).toBe('damaged');
    expect(decodeChallenge('not a link!')).toBe('damaged');
    expect(decodeChallenge('')).toBe('missing');
    expect(decodeChallenge(null)).toBe('missing');
  });

  it('encode base64url the standard way', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    const text = toBase64Url(bytes);
    expect(text).toBe(Buffer.from(bytes).toString('base64url'));
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  it('keep a nickname printable and short', () => {
    expect(cleanNickname('  Ada‮ Lovelace\u0007 the Great  ')).toBe('Ada Lovelace the');
    expect(cleanNickname('​​')).toBeNull();
    expect(cleanNickname('🦍🦍')).toBe('🦍🦍');
  });
});

describe('rebuilding a challenge', () => {
  it('throws the challenger’s very shot on the very city they had', () => {
    const aims: TurnAim[] = [
      { angle: 52.3, velocity: 70 },
      { angle: 40, velocity: 66 },
      { angle: 61.7, velocity: 58, usePowerUp: true },
    ];
    const { results, challenge } = playedRound(9, aims);
    const again = rebuilt(decodeChallenge(encodeChallenge(challenge)) as Challenge);
    const last = results.at(-1);
    expect(again.theirs.record.tracks).toEqual(last?.shot.tracks);
    expect(again.theirs.record.events).toEqual(last?.shot.events);
    expect(again.thrower).toBe(last?.shot.input.thrower);
  });

  it('refuses a round that does not rebuild as described', () => {
    const { challenge } = playedRound(9, [{ angle: 52.3, velocity: 70 }]);
    expect(rebuildChallenge({ ...challenge, wind: challenge.wind + 1 })).toBe('damaged');
    expect(rebuildChallenge({ ...challenge, throws: [] })).toBe('damaged');
    const selfHitFirst = { ...challenge, throws: [{ angle: 45, velocity: 1 }, miss] };
    expect(rebuildChallenge(selfHitFirst)).toBe('damaged');
    expect(rebuildChallenge({ ...challenge, source: { kind: 'trick', puzzle: 99 } })).toBe(
      'damaged',
    );
  });

  it('plays a link from an engine with the same rules, and explains the rest', () => {
    const { challenge } = playedRound(9, [{ angle: 52.3, velocity: 70 }]);
    expect(rebuildChallenge({ ...challenge, version: ENGINE_VERSION + 1 })).toBe('newer');
    expect(rebuildChallenge({ ...challenge, version: 0 })).toBe('olderRules');
  });

  it('rebuilds World Tour stages, Trick Shot puzzles and dailies too', () => {
    const tour = createMatch({
      seed: 5,
      world: STAGES[1]?.world ?? 'earth',
      points: 2,
      format: 'firstTo',
      powerUps: [],
      twists: STAGES[1]?.twists,
    });
    const tourChallenge: Challenge = {
      version: ENGINE_VERSION,
      source: { kind: 'tour', stage: 1, roundSeed: tour.round.seed, round: 1, firstTurn: 0 },
      wind: tour.round.wind,
      throws: [miss, { angle: 50, velocity: 60 }],
      nickname: null,
    };
    expect(rebuilt(tourChallenge).state.round.hazards.drone).not.toBeNull();

    const puzzle = PUZZLES[4];
    const trick = rebuilt({
      version: ENGINE_VERSION,
      source: { kind: 'trick', puzzle: 4 },
      wind: puzzle?.wind ?? 0,
      throws: [{ ...(puzzle?.solution ?? miss), usePowerUp: true }],
      nickname: null,
    });
    expect(trick.theirs.hit).toBe(true);

    const daily = dailySkyline(DAILY.forKey('2026-10-01'));
    const dailyChallenge = rebuilt({
      version: ENGINE_VERSION,
      source: { kind: 'daily', day: daily.day.number },
      wind: startDaily(daily).round.wind,
      throws: [miss, miss, { angle: 45, velocity: 60 }],
      nickname: null,
    });
    expect(dailyChallenge.state.round.throws).toBe(2);
    expect(dailyChallenge.thrower).toBe(0);
  });
});

describe('judging a challenge', () => {
  const puzzleIndex = PUZZLES.findIndex((puzzle) => puzzle.id === 'long-bomb');
  const puzzle = PUZZLES[puzzleIndex];
  const challenge = (aim: TurnAim) =>
    rebuilt({
      version: ENGINE_VERSION,
      source: { kind: 'trick', puzzle: puzzleIndex },
      wind: 0,
      throws: [aim],
      nickname: null,
    });

  it('asks you to match a hit, and calls the same throw a copycat', () => {
    const solution = { ...(puzzle?.solution ?? miss), usePowerUp: true };
    const theirs = challenge(solution);
    const same = judgeChallenge(theirs.theirs, throwOutcome(theirs, solution));
    expect(same).toEqual({ outcome: 'matched', copycat: true });
    const wide = judgeChallenge(theirs.theirs, throwOutcome(theirs, { angle: 45, velocity: 40 }));
    expect(wide).toEqual({ outcome: 'lost', copycat: false });
  });

  it('asks you to land closer than a miss, or to hit', () => {
    const solution = puzzle?.solution ?? miss;
    const theirs = challenge({ angle: solution.angle, velocity: solution.velocity - 6 });
    expect(theirs.theirs.hit).toBe(false);
    const closer = throwOutcome(theirs, { angle: solution.angle, velocity: solution.velocity - 3 });
    const further = throwOutcome(theirs, {
      angle: solution.angle,
      velocity: solution.velocity - 12,
    });
    const hit = throwOutcome(theirs, solution);
    expect(judgeChallenge(theirs.theirs, closer).outcome).toBe('beaten');
    expect(judgeChallenge(theirs.theirs, further).outcome).toBe('lost');
    expect(judgeChallenge(theirs.theirs, hit).outcome).toBe('beaten');
  });
});
