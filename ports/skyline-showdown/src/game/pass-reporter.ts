import type { Streak } from '@shared/daily';
import type { GamePass } from '@shared/pass';
import type manifest from '../../pass.manifest';
import type { ChallengeVerdict } from '../challenge/challenge';
import type { DailyResult } from '../daily/daily';
import type { CpuLevel } from '../engine/ai';
import { gorillaCentre, otherPlayer, type PlayerIndex } from '../engine/gorillas';
import type { Round, TurnResult } from '../engine/match';
import { MAX_STARS, totalStars, type StageRecorded } from '../tour/progress';
import { RIVAL_IDS, RIVALS, type RivalId } from '../tour/rivals';
import type { Stage } from '../tour/stages';
import { PUZZLES } from '../tricks/packs';
import { totalTrickStars, type PuzzleRecorded } from '../tricks/progress';
import type { Puzzle } from '../tricks/puzzle';
import { METRES_PER_UNIT } from './so-close';

type Manifest = typeof manifest;
type BadgeId = Manifest['badges'][number]['id'];
export type CosmeticId = Manifest['cosmetics'][number]['id'];
type StatKey = Manifest['stats'][number]['key'];
export type SkylinePass = GamePass<BadgeId, CosmeticId, StatKey>;

/**
 * Tells the Arcade Pass what happened. The numbers (see ARCHITECTURE.md):
 * 10 XP for playing a match to the end, 30 for winning a Quick Match, 40
 * for winning a tour stage (60 for a boss), 15 for every new star and 100
 * the first time a rival goes down. A scored Daily Skyline pays 20, and
 * 30 more for a hit; a puzzle 20 the first time it is solved and 10 for
 * every new star; a challenge won 25, once per link. The Pass's daily cap
 * keeps farming pointless; badges pay their own XP.
 *
 * Only player 1 owns the Pass on this browser: a friend playing player 2
 * on the same keyboard is a guest.
 */
export const XP = {
  matchPlayed: 10,
  quickMatchWon: 30,
  stageWon: 40,
  bossWon: 60,
  newStar: 15,
  rivalFirstDefeat: 100,
  dailyPlayed: 20,
  dailyHit: 30,
  puzzleSolved: 20,
  trickStar: 10,
  challengeWon: 25,
} as const;

/** Days in a row that earn On a Roll. */
const ROLL_DAYS = 7;

/** A hit from this far away earns Long Distance. */
const LONG_DISTANCE_METRES = 32;
/** A target standing this much higher earns Uphill Battle. */
const UPHILL_METRES = 5;
const DRONE_DELIVERIES = 3;

export interface ThrowReport {
  result: TurnResult;
  /** The round as it was for this throw. */
  round: Round;
  /** This was the thrower's first throw of the round. */
  firstThrow: boolean;
}

export interface MatchReport {
  won: boolean;
  mode: 'quick' | 'tour';
  /** The CPU opponent, if there was one. */
  cpu: { level: CpuLevel; rival: RivalId | null } | null;
  /** Rivals already beaten on the tour before this match. */
  rivalsBeaten: readonly RivalId[];
}

export class PassReporter {
  private roundsInARow = 0;
  private droneFeeds = 0;
  private scored = 0;
  private conceded = 0;
  private worstDeficit = 0;

  constructor(
    private readonly pass: SkylinePass,
    readonly owner: PlayerIndex,
  ) {}

  /** The drone ate one of the owner's bananas this match. */
  get fedTheDrone(): boolean {
    return this.droneFeeds > 0;
  }

  throwMade({ result, round, firstThrow }: ThrowReport) {
    const { shot, scorer } = result;
    const thrower = shot.input.thrower;
    if (scorer !== null) this.countPoint(scorer);
    if (thrower !== this.owner) return;

    const { pass } = this;
    pass.stat('throws', { add: 1 });
    const events = shot.events;
    const sunHits = events.filter((event) => event.type === 'sun').length;
    if (sunHits > 0) {
      pass.stat('sunHits', { add: sunHits });
      pass.progress('sunburn', { add: sunHits });
    }
    const craters = events.filter((event) => event.type === 'explosion').length;
    if (craters > 0) {
      pass.stat('craters', { add: craters });
      pass.progress('demolition', { add: craters });
    }
    if (events.some((event) => event.type === 'drone')) {
      this.droneFeeds++;
      if (this.droneFeeds >= DRONE_DELIVERIES) pass.unlock('drone-delivery');
    }

    if (shot.victim === thrower) {
      pass.unlock('oops');
      if (events.some((event) => event.type === 'gorilla' && event.cause === 'fumble')) {
        pass.unlock('butterfingers');
      }
      return;
    }
    if (scorer !== thrower) return;
    this.hitLanded(result, round, firstThrow);
  }

  private hitLanded(result: TurnResult, round: Round, firstThrow: boolean) {
    const { pass } = this;
    const { shot, usedPowerUp } = result;
    const events = shot.events;
    const own = gorillaCentre(round.gorillas[this.owner]);
    const target = gorillaCentre(round.gorillas[otherPlayer(this.owner)]);
    const metres = Math.hypot(target.x - own.x, target.y - own.y) * METRES_PER_UNIT;

    pass.stat('hits', { add: 1 });
    pass.stat('longestHit', { max: Math.round(metres * 10) / 10 });
    if (metres >= LONG_DISTANCE_METRES) pass.unlock('long-distance');
    if ((own.y - target.y) * METRES_PER_UNIT >= UPHILL_METRES) pass.unlock('uphill-battle');
    if (firstThrow) pass.unlock('sharpshooter');
    if (firstThrow && round.world.id === 'moon') pass.unlock('moonshot');
    if (usedPowerUp === 'tri') pass.unlock('tri-hard');
    if (usedPowerUp === 'calm') pass.unlock('calm-before-the-storm');
    if (events.some((event) => event.type === 'bounce')) pass.unlock('bank-shot');
    if (events.some((event) => event.type === 'sun')) pass.unlock('total-eclipse');
  }

  private countPoint(scorer: PlayerIndex) {
    if (scorer === this.owner) {
      this.scored++;
      this.roundsInARow++;
      this.pass.stat('roundsWon', { add: 1 });
      this.pass.unlock('first-banana');
      if (this.roundsInARow >= 3) this.pass.unlock('hat-trick');
    } else {
      this.conceded++;
      this.roundsInARow = 0;
    }
    this.worstDeficit = Math.max(this.worstDeficit, this.conceded - this.scored);
  }

  /** Returns the XP the Pass granted for the match itself. */
  matchOver(report: MatchReport): number {
    const { pass } = this;
    pass.stat('matchesPlayed', { add: 1 });
    let granted = pass.award(XP.matchPlayed, 'Played a match to the end').granted;
    if (!report.won) return granted;
    pass.stat('matchesWon', { add: 1 });
    if (this.worstDeficit >= 2) pass.unlock('comeback-kid');
    if (report.mode !== 'quick') return granted;

    const rival = report.cpu?.rival ? RIVALS[report.cpu.rival] : null;
    granted += pass.award(
      XP.quickMatchWon,
      rival ? `Beat ${rival.name} in a Quick Match` : 'Won a Quick Match',
    ).granted;
    if (report.cpu?.level === 'brutal' && !rival) pass.unlock('brutal-honesty');
    if (rival && report.rivalsBeaten.includes(rival.id)) pass.unlock('old-friends');
    return granted;
  }

  /** Returns the XP the Pass granted for the stage: the win, new stars and a first defeat. */
  stageRecorded(stage: Stage, recorded: StageRecorded): number {
    const { pass } = this;
    const { save, result } = recorded;
    const rival = RIVALS[stage.rival];
    pass.stat('stars', totalStars(save));
    pass.stat('rivalsBeaten', save.rivalsBeaten.length);
    if (!result.goals.win) return 0;

    let granted = pass.award(
      stage.boss ? XP.bossWon : XP.stageWon,
      `Beat ${rival.name} in ${stage.city}`,
    ).granted;
    if (recorded.newStars > 0) {
      granted += pass.award(
        XP.newStar * recorded.newStars,
        `${recorded.newStars === 1 ? 'A new star' : `${recorded.newStars} new stars`} in ${stage.city}`,
      ).granted;
    }
    if (recorded.rivalFirstDefeat) {
      granted += pass.award(XP.rivalFirstDefeat, `First win over ${rival.name}`).granted;
    }

    if (stage.id === 'jakarta') pass.unlock('singing-in-the-rain');
    if (stage.id === 'tokyo' && !this.fedTheDrone) pass.unlock('drone-whisperer');
    if (stage.id === 'new-york') pass.unlock('globetrotter');
    if (stage.id === 'new-york' && result.goals.flawless) pass.unlock('landlord-evicted');
    if (stage.id === 'olympus') pass.unlock('red-planet');
    if (stage.id === 'the-eye') pass.unlock('eye-of-the-storm');
    if (stage.boss && result.goals.flawless) pass.unlock('untouchable');
    if (RIVAL_IDS.every((id) => save.rivalsBeaten.includes(id))) pass.unlock('rival-collector');
    if (totalStars(save) >= MAX_STARS) pass.unlock('three-star-general');
    return granted;
  }
}

/** Anything changed in the wardrobe earns Dressed to Impress. */
export function reportWardrobeChange(pass: SkylinePass) {
  pass.unlock('dressed-up');
}

/** A scored Daily Skyline is over. Returns the XP granted. */
export function reportDaily(
  pass: SkylinePass,
  number: number,
  result: DailyResult,
  streak: Streak,
): number {
  pass.stat('dailiesPlayed', { add: 1 });
  pass.stat('bestStreak', { max: streak.best });
  pass.unlock('early-bird');
  if (streak.current >= ROLL_DAYS) pass.unlock('on-a-roll');
  let granted = pass.award(XP.dailyPlayed, `Played Daily Skyline #${number}`).granted;
  if (result.outcome !== 'hit') return granted;
  granted += pass.award(XP.dailyHit, `Hit Daily Skyline #${number} in ${result.throws}`).granted;
  if (result.throws === 1) pass.unlock('hole-in-one');
  return granted;
}

/** A Trick Shot puzzle was solved. Returns the XP granted. */
export function reportSolve(pass: SkylinePass, puzzle: Puzzle, recorded: PuzzleRecorded): number {
  const { save } = recorded;
  pass.stat(
    'puzzlesSolved',
    PUZZLES.filter((candidate) => save.puzzles[candidate.id]?.solved).length,
  );
  pass.stat('trickStars', totalTrickStars(save));
  let granted = 0;
  if (recorded.firstSolve) {
    granted += pass.award(XP.puzzleSolved, `Solved ${puzzle.name}`).granted;
  }
  if (recorded.newStars > 0) {
    const stars = recorded.newStars === 1 ? 'A new star' : `${recorded.newStars} new stars`;
    granted += pass.award(XP.trickStar * recorded.newStars, `${stars} on ${puzzle.name}`).granted;
  }
  if (recorded.allSolved) pass.unlock('puzzle-master');
  if (recorded.allThreeStars) pass.unlock('show-off');
  return granted;
}

/** A challenge was played; `firstWin` is false for another win on the same link. */
export function reportChallenge(
  pass: SkylinePass,
  verdict: ChallengeVerdict,
  firstWin: boolean,
): number {
  if (verdict.copycat) pass.unlock('copycat');
  if (verdict.outcome === 'lost' || !firstWin) return 0;
  pass.stat('challengesWon', { add: 1 });
  pass.unlock('matched');
  return pass.award(XP.challengeWon, 'Won a challenge').granted;
}
