import type { GamePass, PassManifest } from '@shared/pass';
import type manifest from '../../pass.manifest';
import type { DuelEvent } from '../engine/duel';
import type { RivalEvent, RivalSide } from '../engine/rival';
import type { CpuLevel } from '../engine/rival-cpu';
import type { RunEvent } from '../engine/run';
import { ROUTES, type RouteId } from '../engine/routes';

type Manifest = typeof manifest;
export type DonkeyPass =
  Manifest extends PassManifest<infer Badge, infer Cosmetic, infer Stat>
    ? GamePass<Badge, Cosmetic, Stat>
    : never;

/**
 * How Donkey Dash reports to the Arcade Pass. During play it only counts;
 * the counts reach the Pass when a run or a point ends (or the player
 * leaves), so the profile is written a handful of times per run, not on
 * every donkey. XP is awarded at the moments a player would say "I did
 * something": a run, a leg, a daily, a match.
 */
export interface RunSummary {
  mode: 'endless' | 'daily' | 'trip';
  metres: number;
  crashes: number;
  finished: boolean;
  livesLeft: number;
  /** The scored Daily Road, not a practice run. */
  scored: boolean;
  dailyNumber?: number;
  dailyStreak?: number;
  trip?: {
    route: RouteId;
    leg: number;
    stars: number;
    newStars: number;
    firstFinish: boolean;
    routeClean: boolean;
    allRoutes: boolean;
    allStars: boolean;
    totalStars: number;
  };
}

export interface DuelSummary {
  versus: boolean;
  winner: 'donkey' | 'driver' | 0 | 1;
  scores: { donkey: number; driver: number };
  /** Donkey vs Driver: the winning point was a crash, scored by the winner as the donkey. */
  wonAsDonkey: boolean;
  /** Classic Duel played start to finish in the CGA filter. */
  cgaThroughout: boolean;
  /** Points lost to the Donkey in a row, across matches. */
  donkeyStreak: number;
}

export interface RivalSummary {
  /** The CPU's level, or null for two players. */
  cpu: CpuLevel | null;
  winner: RivalSide;
}

/** XP for beating each CPU level, which also says how much it is worth beating. */
const RIVAL_WIN_XP: Record<CpuLevel, number> = { easy: 20, normal: 30, hard: 45, brutal: 60 };

export class PassReporter {
  private dodged = 0;
  private nearMisses = 0;
  private whiskers = 0;
  private carrots = 0;
  private onBeat = 0;
  private wobblers = 0;
  private bestCombo = 0;
  private merges = 0;
  private lateMerges = 0;
  private traps = 0;
  private aheadRows = 0;
  /** Rival Driver: rows passed riding Ahead this round, by each car. */
  private aheadThisRound: [number, number] = [0, 0];
  private lastCarrotAt = -Infinity;
  private heldDodgeAt = -Infinity;
  private threeLaneClean = false;
  /** The road is narrowing again after a clean three-lane stretch: its barrier settles the badge. */
  private leavingThreeLanes = false;

  constructor(private readonly pass: DonkeyPass) {}

  /** Watches the engine's events; `roadTime` is the drive's clock. */
  observe(event: RunEvent | DuelEvent, roadTime: number) {
    switch (event.type) {
      case 'pass':
        if (event.hazard.kind === 'barrier') {
          if ((event.nearMiss?.tier ?? 0) >= 2) this.lateMerges += 1;
          if (this.leavingThreeLanes && this.threeLaneClean) this.pass.unlock('three-lanes');
          this.leavingThreeLanes = false;
          break;
        }
        this.dodged += 1;
        if (event.hazard.role === 'wobbler') this.wobblers += 1;
        if (event.threatened && !event.neutral && roadTime - this.heldDodgeAt < 1.5) {
          this.pass.unlock('mud-bath');
        }
        break;
      case 'near-miss':
        this.nearMisses += 1;
        if (event.tier.tier >= 2) this.whiskers += 1;
        this.bestCombo = Math.max(this.bestCombo, event.combo);
        this.pass.unlock('close-shave');
        if (event.multiplier >= 5) this.pass.unlock('combo-five');
        break;
      case 'carrot':
        this.carrots += 1;
        this.lastCarrotAt = roadTime;
        break;
      case 'rhythm':
        this.onBeat += 1;
        break;
      case 'switch':
        if (event.held && event.dodging) this.heldDodgeAt = roadTime;
        if (event.merging) this.merges += 1;
        break;
      case 'lanes':
        if (event.lanes === 3) {
          this.threeLaneClean = true;
          this.leavingThreeLanes = false;
        } else {
          this.leavingThreeLanes = this.threeLaneClean;
        }
        break;
      case 'crash':
        this.threeLaneClean = false;
        this.leavingThreeLanes = false;
        if (roadTime - this.lastCarrotAt < 1.2) this.pass.unlock('worth-it');
        break;
    }
  }

  /**
   * Watches Rival Driver. Only what people do counts: everything the players
   * on this browser do, and nothing the CPU (on `cpu`'s side, if any) does.
   */
  observeRace(event: RivalEvent, cpu: RivalSide | null) {
    switch (event.type) {
      case 'round':
        this.aheadThisRound = [0, 0];
        break;
      case 'dodge':
        if (event.car === cpu) break;
        this.dodged += 1;
        if (event.ahead) {
          this.aheadRows += 1;
          this.aheadThisRound[event.car] += 1;
          if (this.aheadThisRound[event.car] >= 10) this.pass.unlock('front-runner');
        }
        break;
      case 'move':
        if (event.car === cpu) break;
        if (event.merging) this.merges += 1;
        if (event.cut) this.pass.unlock('slip-through');
        break;
      case 'crash':
        // The CPU caught out, or, with two players on one browser, either of them.
        if (event.trapped && (cpu === null || event.car === cpu)) {
          this.traps += 1;
          this.pass.unlock('gotcha');
          if (event.doorShut) this.pass.unlock('door-shut');
        }
        break;
      case 'escape':
        if (event.car !== cpu && event.count >= 3) this.pass.unlock('slippery');
        break;
    }
  }

  /** Sends what has been counted so far to the Pass. */
  commit() {
    if (this.dodged > 0) this.pass.progress('hee-haw-hundred', { add: this.dodged });
    if (this.carrots > 0) this.pass.progress('carrot-cake', { add: this.carrots });
    if (this.whiskers > 0) this.pass.progress('whisker-master', { add: this.whiskers });
    if (this.onBeat > 0) this.pass.progress('on-the-beat', { add: this.onBeat });
    if (this.wobblers > 0) this.pass.progress('mind-made-up', { add: this.wobblers });
    if (this.merges > 0) this.pass.progress('lane-changer', { add: this.merges });
    if (this.lateMerges > 0) this.pass.progress('merge-master', { add: this.lateMerges });
    if (this.merges > 0) this.pass.stat('merges', { add: this.merges });
    if (this.traps > 0) this.pass.stat('traps', { add: this.traps });
    if (this.aheadRows > 0) this.pass.stat('aheadRows', { add: this.aheadRows });
    if (this.dodged > 0) this.pass.stat('dodged', { add: this.dodged });
    if (this.nearMisses > 0) this.pass.stat('nearMisses', { add: this.nearMisses });
    if (this.carrots > 0) this.pass.stat('carrots', { add: this.carrots });
    if (this.bestCombo > 0) this.pass.stat('bestCombo', { max: this.bestCombo });
    this.dodged = 0;
    this.nearMisses = 0;
    this.whiskers = 0;
    this.carrots = 0;
    this.onBeat = 0;
    this.wobblers = 0;
    this.bestCombo = 0;
    this.merges = 0;
    this.lateMerges = 0;
    this.traps = 0;
    this.aheadRows = 0;
  }

  finishRun(summary: RunSummary) {
    this.commit();
    const { pass } = this;
    pass.stat('runs', { add: 1 });
    if (summary.finished && summary.livesLeft === 1) pass.unlock('photo-finish');

    if (summary.mode === 'endless') {
      pass.stat('bestEndless', { max: summary.metres });
      if (summary.metres >= 3000) pass.unlock('long-haul');
      const bonus = Math.min(40, Math.floor(summary.metres / 1000) * 10);
      pass.award(10 + bonus, `Endless: ${summary.metres.toLocaleString('en')} m`);
    } else if (summary.mode === 'daily') {
      if (!summary.scored) {
        pass.award(10, 'Daily Road practice');
        return;
      }
      pass.unlock('early-bird');
      if (summary.finished && summary.crashes === 0) pass.unlock('clean-daily');
      if ((summary.dailyStreak ?? 0) >= 7) pass.unlock('daily-driver');
      pass.stat('bestStreak', { max: summary.dailyStreak ?? 0 });
      pass.award(summary.finished ? 40 : 30, `Daily Road #${summary.dailyNumber ?? 0}`);
    } else if (summary.trip) {
      const { trip } = summary;
      const route = ROUTES[trip.route];
      const leg = route.legs[trip.leg];
      pass.stat('stars', trip.totalStars);
      if (!summary.finished) {
        pass.award(10, `${route.name} · ${leg?.name ?? ''}`);
        return;
      }
      pass.unlock('first-leg');
      if (trip.leg === 2) pass.unlock('herd-immunity');
      if (trip.routeClean) pass.unlock('zero-harmed');
      if (trip.allRoutes) pass.unlock('road-tripper');
      if (trip.allStars) pass.unlock('all-stars');
      const firstBoss = trip.leg === 2 && trip.firstFinish;
      pass.award(
        40 + 10 * trip.newStars + (firstBoss ? 100 : 0),
        `${route.name} · ${leg?.name ?? ''}`,
      );
    }
  }

  finishRival(summary: RivalSummary) {
    this.commit();
    const { pass } = this;
    pass.stat('runs', { add: 1 });
    const { cpu, winner } = summary;
    if (cpu === null) {
      pass.stat('rivalWins', { add: 1 });
      pass.award(20, 'Played Rival Driver');
      return;
    }
    if (winner === 0) {
      pass.stat('rivalWins', { add: 1 });
      if (cpu === 'hard' || cpu === 'brutal') pass.unlock('rival-ready');
      pass.award(RIVAL_WIN_XP[cpu], `Beat the ${cpu} CPU in Rival Driver`);
      return;
    }
    if (cpu === 'easy') pass.unlock('road-rage');
    pass.award(10, 'Played Rival Driver');
  }

  /** A Classic Duel point to the Driver: the first ever is a badge. */
  driverPoint() {
    this.pass.unlock('donkey-loses');
  }

  finishDuel(summary: DuelSummary) {
    this.commit();
    const { pass } = this;
    pass.stat('runs', { add: 1 });
    if (summary.donkeyStreak >= 10) pass.unlock('stubborn');
    if (summary.versus) {
      if (summary.wonAsDonkey) pass.unlock('donkey-supreme');
      pass.award(15, 'Played Donkey vs Driver');
      return;
    }
    if (summary.cgaThroughout) pass.unlock('retro-rig');
    const won = summary.winner === 'driver';
    if (won && summary.scores.donkey === 0) pass.unlock('flawless-duel');
    pass.award(
      won ? 35 : 10,
      `${won ? 'Won' : 'Played'} Classic Duel ${summary.scores.driver}–${summary.scores.donkey}`,
    );
  }
}
