import { addDays } from '@shared/daily';
import { DAILY, DAILY_LAUNCH, dailySkyline, startDaily } from '../daily/daily';
import type { Point } from '../engine/geometry';
import { gorillaCentre, otherPlayer, type PlayerIndex } from '../engine/gorillas';
import {
  createRound,
  matchFromRound,
  previewTurn,
  takeTurn,
  type MatchOptions,
  type MatchState,
  type TurnAim,
} from '../engine/match';
import type { ShotRecord } from '../engine/shot';
import { compatibilityOf } from '../engine/version';
import { STAGES } from '../tour/stages';
import { judgeThrow } from '../tricks/judge';
import { PUZZLES } from '../tricks/packs';
import { buildPuzzle, type BuiltPuzzle } from '../tricks/puzzle';
import type { Challenge, ChallengeSource } from './link';

/**
 * Turning a challenge back into a game: the round rebuilt and its earlier
 * throws thrown again, then the challenger's shot and yours judged side by
 * side. Both shots start from the same moment, so the city, the wind and
 * the drone are exactly as the challenger found them.
 */
export type ChallengeProblem =
  /** The link does not describe a round this game can rebuild. */
  | 'damaged'
  /** Made by an older engine whose bananas flew differently. */
  | 'olderRules'
  /** Made by a newer engine than this page. */
  | 'newer';

export interface RebuiltChallenge {
  challenge: Challenge;
  /** The match at the moment of the challenger's shot; never changed, only previewed. */
  state: MatchState;
  thrower: PlayerIndex;
  /** A Trick Shot puzzle's targets and rules, when the challenge comes from one. */
  puzzle: BuiltPuzzle | null;
  /** Where the throw is aimed: the target gorilla, or the puzzle's last target. */
  target: Point;
  theirs: ShotOutcome;
}

export interface ShotOutcome {
  aim: TurnAim;
  record: ShotRecord;
  /** The target was hit (for a puzzle: it was solved). */
  hit: boolean;
  /** Where the banana that came down nearest the target came down. */
  landing: Point;
  /** From that landing to the target, squared: compared exactly in every browser. */
  distanceSquared: number;
}

export type ChallengeOutcome = 'matched' | 'beaten' | 'lost';

export interface ChallengeVerdict {
  outcome: ChallengeOutcome;
  /** Your banana came down right where theirs did. */
  copycat: boolean;
}

/** Closer than this to the challenger's landing is the same landing: about ten centimetres. */
const COPYCAT_UNITS = 1.5;

export function rebuildChallenge(challenge: Challenge): RebuiltChallenge | ChallengeProblem {
  const compatibility = compatibilityOf(challenge.version);
  if (compatibility === 'olderRules' || compatibility === 'newer') return compatibility;

  const start = challengeStart(challenge.source);
  if (!start) return 'damaged';
  const { state, puzzle } = start;
  if (state.round.wind !== challenge.wind) return 'damaged';
  const history = challenge.throws.slice(0, -1);
  const shot = challenge.throws.at(-1);
  if (!shot || (puzzle && history.length > 0)) return 'damaged';
  for (const aim of history) {
    takeTurn(state, aim);
    // Only the last throw of a round can end it.
    if (state.status !== 'playing') return 'damaged';
  }

  const thrower = state.turn;
  const target = puzzle
    ? (puzzle.targets.at(-1)?.centre ?? { x: 0, y: 0 })
    : gorillaCentre(state.round.gorillas[otherPlayer(thrower)]);
  const rebuilt = { challenge, state, thrower, puzzle, target };
  return { ...rebuilt, theirs: throwOutcome(rebuilt, shot) };
}

type Moment = Pick<RebuiltChallenge, 'state' | 'thrower' | 'puzzle' | 'target'>;

/** A throw from the challenge's moment, without changing it. */
export function throwOutcome(challenge: Moment, aim: TurnAim): ShotOutcome {
  return shotOutcome(challenge, previewTurn(challenge.state, aim), aim);
}

/** How a shot already thrown from the challenge's moment went. */
export function shotOutcome(challenge: Moment, record: ShotRecord, aim: TurnAim): ShotOutcome {
  const hit = challenge.puzzle
    ? judgeThrow(challenge.puzzle, record).solved
    : record.victim === otherPlayer(challenge.thrower);
  const { landing, distanceSquared } = nearestLanding(record, challenge.target);
  return { aim, record, hit, landing, distanceSquared };
}

export function judgeChallenge(theirs: ShotOutcome, yours: ShotOutcome): ChallengeVerdict {
  const dx = yours.landing.x - theirs.landing.x;
  const dy = yours.landing.y - theirs.landing.y;
  const copycat = dx * dx + dy * dy <= COPYCAT_UNITS * COPYCAT_UNITS;
  let outcome: ChallengeOutcome;
  if (theirs.hit) outcome = yours.hit ? 'matched' : 'lost';
  else if (yours.hit || yours.distanceSquared < theirs.distanceSquared) outcome = 'beaten';
  else outcome = yours.distanceSquared === theirs.distanceSquared ? 'matched' : 'lost';
  return { outcome, copycat };
}

/** The match as it stood when the challenge's round began, before any of its throws. */
export function challengeStart(
  source: ChallengeSource,
): { state: MatchState; puzzle: BuiltPuzzle | null } | null {
  switch (source.kind) {
    case 'quick': {
      const options: MatchOptions = {
        seed: source.roundSeed,
        world: source.world,
        points: 1,
        format: 'firstTo',
        powerUps: source.powerUps,
      };
      const round = createRound(source.round, source.roundSeed, options);
      return { state: matchFromRound(options, round, source.firstTurn, source.held), puzzle: null };
    }
    case 'tour': {
      const stage = STAGES[source.stage];
      if (!stage) return null;
      const options: MatchOptions = {
        seed: source.roundSeed,
        world: stage.world,
        points: 1,
        format: 'firstTo',
        powerUps: [],
        twists: stage.twists,
      };
      const round = createRound(source.round, source.roundSeed, options);
      return {
        state: matchFromRound(options, round, source.firstTurn, [null, null]),
        puzzle: null,
      };
    }
    case 'trick': {
      const puzzle = PUZZLES[source.puzzle];
      if (!puzzle) return null;
      const built = buildPuzzle(puzzle);
      return { state: built.start(), puzzle: built };
    }
    case 'daily': {
      if (source.day < 1) return null;
      const daily = dailySkyline(DAILY.forKey(addDays(DAILY_LAUNCH, source.day - 1)));
      return { state: startDaily(daily), puzzle: null };
    }
  }
}

function nearestLanding(
  record: ShotRecord,
  target: Point,
): { landing: Point; distanceSquared: number } {
  // A Tri-Banana's first banana ends in mid-air, where it splits: that is no landing.
  const split = new Set(
    record.events.filter((event) => event.type === 'split').map((event) => event.banana),
  );
  let best = { landing: target, distanceSquared: Infinity };
  for (const track of record.tracks) {
    const end = track.points.at(-1);
    if (!end || split.has(track.id)) continue;
    const dx = end.x - target.x;
    const dy = end.y - target.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < best.distanceSquared) best = { landing: end, distanceSquared };
  }
  return best;
}
