import type { GamePass, PassManifest } from '@shared/pass';
import type manifest from '../../pass.manifest';
import type { DuelEvent } from '../engine/duel';
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

export class PassReporter {
  private dodged = 0;
  private nearMisses = 0;
  private whiskers = 0;
  private carrots = 0;
  private onBeat = 0;
  private wobblers = 0;
  private bestCombo = 0;
  private lastCarrotAt = -Infinity;
  private heldDodgeAt = -Infinity;
  private threeLaneClean = false;

  constructor(private readonly pass: DonkeyPass) {}

  /** Watches the engine's events; `roadTime` is the drive's clock. */
  observe(event: RunEvent | DuelEvent, roadTime: number) {
    switch (event.type) {
      case 'pass':
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
        break;
      case 'lanes':
        if (event.lanes === 3) this.threeLaneClean = true;
        else if (this.threeLaneClean) this.pass.unlock('three-lanes');
        break;
      case 'crash':
        this.threeLaneClean = false;
        if (roadTime - this.lastCarrotAt < 1.2) this.pass.unlock('worth-it');
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
