import type { GamePass, PassManifest } from '@shared/pass';
import type manifest from '../../pass.manifest';
import type { Side } from '../engine/map';
import { SEA_CHAPTERS } from './at-sea';
import { CHAPTERS, TOTAL_STARS } from './campaign';
import type { ModePlan } from './modes';
import type { RoundRecord, SessionOutcome } from './session';
import type { PilotTally } from './stats';

type Manifest = typeof manifest;
export type OxPass =
  Manifest extends PassManifest<infer Badge, infer Cosmetic, infer Stat>
    ? GamePass<Badge, Cosmetic, Stat>
    : never;

/** A landing this close to an empty tank is "running on fumes". */
const FUMES = 0.02;

/** What the rest of the game knows about a finished match that the session does not. */
export interface MatchContext {
  /** Campaign or At Sea: stars earned this time that were not earned before, and the totals now. */
  newStars: number;
  totalStars: number;
  chaptersWon: number;
  seaStars: number;
  seaMissionsWon: number;
  /** Daily Sortie: whether this was the day's first, counted sortie, and the streak after it. */
  dailyCounted: boolean;
  dailyStreak: number;
  classicBest: number;
}

/**
 * How Mind the Ox reports to the Arcade Pass. Nothing is sent during a
 * round: the round's tally reaches the Pass when the round ends, so the
 * profile is written a few times a game, not on every bullet. XP is paid
 * at the moments a player would say "I did something": a round, a
 * chapter, a dogfight, a daily, a match.
 */
export class PassReporter {
  /** XP actually granted since the last reset, for the results card. */
  earned = 0;

  constructor(private readonly pass: OxPass) {}

  private award(xp: number, reason: string) {
    this.earned += this.pass.award(xp, reason).granted;
  }

  /** The Secret Hangar, found on the title screen. */
  hangarFound() {
    this.pass.unlock('option-x');
  }

  /**
   * A round is over, won or lost. `players` are the sides people flew for,
   * with each person's own tally.
   */
  roundEnded(
    record: RoundRecord,
    plan: ModePlan,
    players: readonly { side: Side; pilot: PilotTally | undefined }[],
  ) {
    const pass = this.pass;
    pass.stat('rounds', { add: 1 });
    this.award(10, `Flew a round of ${plan.label}`);
    const sides = new Set(players.map((player) => player.side));
    for (const side of sides) {
      const tally = record.tally.sides[side];
      pass.stat('planesDowned', { add: tally.planesDowned });
      pass.stat('targets', { add: tally.targets });
      pass.stat('depots', { add: tally.depots });
      pass.stat('oxen', { add: tally.oxen });
      if (tally.planesDowned > 0) pass.progress('sharpshooter', { add: tally.planesDowned });
      if (tally.depots > 0) pass.progress('depot-buster', { add: tally.depots });
      if (tally.craters > 0) pass.progress('crater-maker', { add: tally.craters });
      if (tally.oxen > 0) pass.unlock('moo');
      pass.stat('shipsSunk', { add: tally.shipsSunk });
      if (tally.torpedoHits > 0) pass.unlock('fish-in-the-water');
      if (tally.carriersSunk > 0) pass.unlock('carrier-killer');
    }
    for (const { pilot } of players) {
      if (!pilot) continue;
      pass.stat('landings', { add: pilot.landings });
      pass.stat('traps', { add: pilot.traps });
      if (pilot.traps > 0) pass.unlock('trap');
      if (pilot.traps > 0 && plan.night) pass.unlock('night-owl-at-sea');
      if (pilot.bolters > 0) pass.unlock('bolter');
      if (pilot.rescues > 0) pass.unlock('wet-feet');
      if (pilot.splats > 0) pass.unlock('splat');
      if (pilot.landings > 0) pass.unlock('wheels-down');
      if (pilot.lowestLandingFuel !== null && pilot.lowestLandingFuel < FUMES)
        pass.unlock('running-on-fumes');
      if (pilot.stalledIntoHome) pass.unlock('grounded');
      if (pilot.loops > 0) pass.unlock('loop-the-loop');
      if (pilot.flocksScattered > 0) pass.unlock('scattershot');
    }

    const won = record.winner !== null && sides.has(record.winner);
    if (!won) return;
    pass.stat('roundsWon', { add: 1 });
    pass.unlock('into-the-sun');
    const request = plan.request;
    // An intercept won without a single bomb on our ships, in At Sea or a sortie.
    const intercept =
      (request.kind === 'at-sea' && request.chapter === 'intercept') ||
      plan.sortie?.options.mission === 'intercept';
    if (intercept && record.tally.raiderBombs === 0) pass.unlock('not-on-my-deck');
    if (request.kind === 'classic') {
      pass.unlock('like-1984');
      this.award(30, `Won round ${record.round + 1} of Classic 1984`);
    }
    if (request.kind === 'two-player' && request.style === 'coop') {
      pass.unlock('wingman');
      this.award(30, 'Won a co-op round');
    }
  }

  /** The match is over: the chapter, the dogfight, the daily or the versus match it was. */
  matchOver(outcome: SessionOutcome, context: MatchContext) {
    const pass = this.pass;
    const { plan } = outcome;
    const round = outcome.rounds[0];
    const won = round?.winner === 0;
    const request = plan.request;
    switch (request.kind) {
      case 'campaign': {
        if (!won || !round) return;
        const chapter = plan.chapter;
        this.award(50 + context.newStars * 10, `Won ${plan.label}`);
        if (round.tally.sides[0].oxen === 0) pass.unlock('mind-the-ox');
        const pilot = [...round.tally.pilots.values()][0];
        if (chapter?.id === 'lantern-raid' && pilot?.litTicks === 0) pass.unlock('lantern-dodger');
        pass.stat('stars', context.totalStars);
        if (context.chaptersWon >= CHAPTERS.length) pass.unlock('last-chapter');
        if (context.totalStars >= TOTAL_STARS) pass.unlock('full-marks');
        return;
      }
      case 'at-sea': {
        if (!won || !round) return;
        this.award(50 + context.newStars * 10, `Completed ${plan.label}`);
        if (request.chapter === 'the-raid') pass.unlock('tondern');
        pass.stat('seaStars', context.seaStars);
        if (context.seaMissionsWon >= SEA_CHAPTERS.length) pass.unlock('fleet-admiral');
        return;
      }
      case 'sortie':
        if (!won) return;
        this.award(request.options.level === 'brutal' ? 60 : 40, `Completed ${plan.label}`);
        return;
      case 'dogfight':
        if (!won) return;
        if (request.level === 'brutal') {
          const first = pass.unlock('ace');
          this.award(first ? 100 : 60, 'Beat a Brutal pilot in a dogfight');
        } else this.award(request.level === 'hard' ? 45 : 30, 'Won a dogfight');
        return;
      case 'daily':
        pass.unlock('daily-sortie');
        if (!context.dailyCounted) return;
        this.award(30, `Flew Daily Sortie #${request.day.number}`);
        pass.progress('daily-streak', context.dailyStreak);
        pass.stat('bestStreak', { max: context.dailyStreak });
        return;
      case 'two-player':
        if (request.style !== 'versus' || outcome.roundsWon[0] === outcome.roundsWon[1]) return;
        pass.unlock('head-to-head');
        this.award(30, 'Won a versus match');
        return;
      case 'classic':
        pass.stat('classicBest', { max: context.classicBest });
        return;
    }
  }
}
