import type { ChallengeSource } from '../challenge/link';
import type { DailySkyline } from '../daily/daily';
import { DEFAULT_STYLE, type CpuLevel, type PlayStyle } from '../engine/ai';
import type { PlayerIndex } from '../engine/gorillas';
import type { MatchOptions, MatchState, RoundStart } from '../engine/match';
import type { Weather } from '../render/atmosphere';
import { lookFor, PLAYER_ACCENTS, type GorillaLook } from '../render/gorilla';
import { classicKit, KITS, type CityKit } from '../render/kits';
import { timeOfDayForRound, type TimeOfDay } from '../render/palette';
import {
  cleanName,
  DEFAULT_NAMES,
  isCpu,
  matchOptionsFrom,
  type AimingMode,
  type Settings,
} from '../settings';
import { RIVALS, type Rival, type RivalId } from '../tour/rivals';
import { STAGES, type Stage } from '../tour/stages';
import type { Outfit } from '../wardrobe/items';

/**
 * Everything a match needs to know before its first throw: the rules, who
 * plays each side (a person, a CPU, or a World Tour rival with a style of
 * its own), how they look, and what city they fight over. Quick Match and
 * the tour both come down to one of these.
 */
export interface Contender {
  name: string;
  /** How a CPU plays; null for a person. */
  cpu: { level: CpuLevel; style: PlayStyle } | null;
  look: GorillaLook;
  /** A World Tour rival has lines to say. */
  rival: Rival | null;
}

export interface Scenery {
  kit: CityKit;
  /** Random weather (on or off), or a tour city's own. */
  weather: boolean | Weather;
  timeOfDay(round: number): TimeOfDay;
}

export interface MatchSetup {
  match: MatchOptions;
  players: [Contender, Contender];
  aiming: AimingMode;
  aimAssist: boolean;
  scenery: Scenery;
  /** The World Tour stage being played; null in a Quick Match. */
  tourStage: Stage | null;
  /** The Daily Skyline being played, the match it starts from, and whether this attempt counts. */
  daily: { skyline: DailySkyline; start: MatchState; scored: boolean } | null;
  /** How a round of this match goes into a challenge link; null where none are offered. */
  linkSource: ((start: RoundStart) => ChallengeSource) | null;
}

/** A person's name on the tour: "You" unless they have chosen one. */
export function tourName(settings: Settings): string {
  const name = cleanName(settings.names[0], 0);
  return name === DEFAULT_NAMES[0] ? 'You' : name;
}

export function rivalContender(rival: Rival, level: CpuLevel = rival.level): Contender {
  return {
    name: rival.name,
    cpu: { level, style: rival.style },
    look: lookFor(rival.outfit, rival.colour),
    rival,
  };
}

/**
 * A Quick Match from the settings screen. A rival can be picked as the
 * opponent once they have been beaten on the tour; anyone else plays as a
 * plain CPU at the chosen difficulty.
 */
export function quickMatchSetup(
  settings: Settings,
  seed: number,
  outfits: readonly [Outfit, Outfit],
  rivalsBeaten: readonly RivalId[],
): MatchSetup {
  const match = matchOptionsFrom(settings, seed);
  const players = ([0, 1] as const).map((player) =>
    plainContender(settings, player, outfits[player]),
  ) as [Contender, Contender];
  const rivalId = settings.rival;
  if (settings.players === 'humanVsCpu' && rivalId && rivalsBeaten.includes(rivalId)) {
    players[1] = rivalContender(RIVALS[rivalId]);
  }
  return {
    match,
    players,
    aiming: settings.aiming,
    aimAssist: settings.aimAssist,
    scenery: {
      kit: classicKit(settings.world === 'random' ? 'earth' : settings.world),
      weather: settings.weather,
      timeOfDay: (round) => timeOfDayForRound(round, settings.weather),
    },
    tourStage: null,
    daily: null,
    linkSource: (start) => ({
      kind: 'quick',
      roundSeed: start.seed,
      round: start.number,
      world: match.world,
      powerUps: [...match.powerUps],
      firstTurn: start.turn,
      held: start.held,
    }),
  };
}

function plainContender(settings: Settings, player: PlayerIndex, outfit: Outfit): Contender {
  const cpu = isCpu(settings, player);
  const chosen = settings.names[player];
  return {
    name: cpu && chosen === DEFAULT_NAMES[player] ? 'CPU' : cleanName(chosen, player),
    cpu: cpu ? { level: settings.cpuLevel, style: DEFAULT_STYLE } : null,
    look: lookFor(outfit, PLAYER_ACCENTS[player]),
    rival: null,
  };
}

/** A World Tour stage: you on the left, the stage's rival on the right, in their city. */
export function tourSetup(
  stage: Stage,
  settings: Settings,
  seed: number,
  outfit: Outfit,
): MatchSetup {
  const rival = RIVALS[stage.rival];
  return {
    match: {
      seed,
      world: stage.world,
      points: stage.points,
      format: 'firstTo',
      // No balloons on the tour: every stage is about its twist.
      powerUps: [],
      twists: stage.twists,
    },
    players: [
      {
        name: tourName(settings),
        cpu: null,
        look: lookFor(outfit, PLAYER_ACCENTS[0]),
        rival: null,
      },
      rivalContender(rival, stage.rivalLevel ?? rival.level),
    ],
    aiming: settings.aiming,
    aimAssist: settings.aimAssist,
    scenery: {
      kit: KITS[stage.kit],
      weather: { ...stage.weather, lightning: stage.weather.rain },
      timeOfDay: () => stage.timeOfDay,
    },
    tourStage: stage,
    daily: null,
    linkSource: (start) => ({
      kind: 'tour',
      stage: STAGES.indexOf(stage),
      roundSeed: start.seed,
      round: start.number,
      firstTurn: start.turn,
    }),
  };
}

/** The gorilla a Daily Skyline is thrown at. It never throws back. */
export const TARGET_ACCENT = '#ff5d5d';

/**
 * A Daily Skyline: you on the left, the still target on the right, in the
 * day's world. Aim assist is off for everyone, so every result on the
 * share line means the same thing; only practice runs make challenge links,
 * so the scored attempt is never given away.
 */
export function dailySetup(
  skyline: DailySkyline,
  start: MatchState,
  scored: boolean,
  settings: Settings,
  outfits: readonly [Outfit, Outfit],
): MatchSetup {
  return {
    match: skyline.options,
    players: [
      {
        name: tourName(settings),
        cpu: null,
        look: lookFor(outfits[0], PLAYER_ACCENTS[0]),
        rival: null,
      },
      { name: 'Target', cpu: null, look: lookFor(outfits[1], TARGET_ACCENT), rival: null },
    ],
    aiming: settings.aiming,
    aimAssist: false,
    scenery: {
      kit: classicKit(skyline.world),
      weather: settings.weather,
      timeOfDay: () => (skyline.day.number % 3) * 0.9,
    },
    tourStage: null,
    daily: { skyline, start, scored },
    linkSource: scored ? null : () => ({ kind: 'daily', day: skyline.day.number }),
  };
}
