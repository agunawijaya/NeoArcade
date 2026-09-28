import { STARTING_LIVES } from './constants';
import type { PhraseKind } from './planner';
import type { RunConfig } from './run';

/**
 * Road Trip: five routes of three legs. Each route brings in one new kind of
 * trouble and ends in a stubborn herd. Stars open the next route.
 */
export type RouteId = 'farm' | 'mountain' | 'desert' | 'night' | 'snow';

export const ROUTE_IDS: readonly RouteId[] = ['farm', 'mountain', 'desert', 'night', 'snow'];

export interface Leg {
  name: string;
  lengthBeats: number;
  speed: { start: number; max: number };
  introduce: Partial<Record<PhraseKind, number>>;
  boss: boolean;
  /** Near-miss points for the third star. */
  nearMissTarget: number;
}

export interface Route {
  id: RouteId;
  name: string;
  /** One line on the route card. */
  blurb: string;
  /** What this route teaches, shown on its card. */
  newHazard: string;
  /** Stars needed, across all routes, to drive it. */
  unlockStars: number;
  bpm: number;
  slack: number;
  wobbleCommitSeconds: number;
  legs: readonly [Leg, Leg, Leg];
}

const BASICS = { single: 0, carrots: 12, pair: 20 } as const;

export const ROUTES: Record<RouteId, Route> = {
  farm: {
    id: 'farm',
    name: 'Farm Lanes',
    blurb: 'Golden fields, hay bales and a donkey behind every hedge.',
    newHazard: 'Donkeys, pairs and carrots',
    unlockStars: 0,
    bpm: 100,
    slack: 0.3,
    wobbleCommitSeconds: 0.6,
    legs: [
      {
        name: 'Morning Chores',
        lengthBeats: 96,
        speed: { start: 11, max: 13.5 },
        introduce: { single: 0, carrots: 12 },
        boss: false,
        nearMissTarget: 800,
      },
      {
        name: 'Hay Day',
        lengthBeats: 112,
        speed: { start: 12, max: 14.5 },
        introduce: { single: 0, carrots: 8, pair: 16 },
        boss: false,
        nearMissTarget: 1200,
      },
      {
        name: 'The Stubborn Herd',
        lengthBeats: 128,
        speed: { start: 12.5, max: 15 },
        introduce: { single: 0, carrots: 8, pair: 12 },
        boss: true,
        nearMissTarget: 1500,
      },
    ],
  },
  mountain: {
    id: 'mountain',
    name: 'Mountain Pass',
    blurb: 'Switchbacks in the mist, where the road turns to mud.',
    newHazard: 'Mud slows your lane switch',
    unlockStars: 4,
    bpm: 96,
    slack: 0.28,
    wobbleCommitSeconds: 0.58,
    legs: [
      {
        name: 'Switchbacks',
        lengthBeats: 112,
        speed: { start: 13, max: 16 },
        introduce: { ...BASICS, mud: 16 },
        boss: false,
        nearMissTarget: 1100,
      },
      {
        name: 'Misty Ridge',
        lengthBeats: 120,
        speed: { start: 14, max: 17 },
        introduce: { ...BASICS, mud: 10, herd: 56 },
        boss: false,
        nearMissTarget: 1300,
      },
      {
        name: 'Goat Track Herd',
        lengthBeats: 136,
        speed: { start: 14.5, max: 17.5 },
        introduce: { ...BASICS, mud: 8, herd: 40 },
        boss: true,
        nearMissTarget: 1600,
      },
    ],
  },
  desert: {
    id: 'desert',
    name: 'Desert Highway',
    blurb: 'Heat shimmer, open sky, and the road opening to three lanes.',
    newHazard: 'Three lanes: one press cycles them',
    unlockStars: 10,
    bpm: 120,
    slack: 0.26,
    wobbleCommitSeconds: 0.56,
    legs: [
      {
        name: 'Heat Haze',
        lengthBeats: 128,
        speed: { start: 15, max: 18 },
        introduce: { ...BASICS, 'three-lanes': 20 },
        boss: false,
        nearMissTarget: 1500,
      },
      {
        name: 'Mirage Mile',
        lengthBeats: 144,
        speed: { start: 15, max: 18.5 },
        introduce: { ...BASICS, 'three-lanes': 12, mud: 40, herd: 70 },
        boss: false,
        nearMissTarget: 1800,
      },
      {
        name: 'The Caravan',
        lengthBeats: 152,
        speed: { start: 15.5, max: 19 },
        introduce: { ...BASICS, 'three-lanes': 10, mud: 30, herd: 50 },
        boss: true,
        nearMissTarget: 2000,
      },
    ],
  },
  night: {
    id: 'night',
    name: 'Foggy Night',
    blurb: 'Headlights, fireflies, and donkeys who cannot make up their minds.',
    newHazard: 'Hesitant donkeys wobble, then commit',
    unlockStars: 17,
    bpm: 90,
    slack: 0.26,
    wobbleCommitSeconds: 0.56,
    legs: [
      {
        name: 'Fog Lights',
        lengthBeats: 112,
        speed: { start: 14, max: 17 },
        introduce: { ...BASICS, wobbler: 14 },
        boss: false,
        nearMissTarget: 1300,
      },
      {
        name: 'Firefly Hollow',
        lengthBeats: 128,
        speed: { start: 15, max: 18 },
        introduce: { ...BASICS, wobbler: 8, mud: 36, herd: 64 },
        boss: false,
        nearMissTarget: 1500,
      },
      {
        name: 'The Night Herd',
        lengthBeats: 140,
        speed: { start: 15.5, max: 18.5 },
        introduce: { ...BASICS, wobbler: 8, mud: 24, herd: 48, 'three-lanes': 80 },
        boss: true,
        nearMissTarget: 1800,
      },
    ],
  },
  snow: {
    id: 'snow',
    name: 'Snow Road',
    blurb: 'Falling snow, a long climb, and everything the road has learned.',
    newHazard: 'All of it, faster',
    unlockStars: 25,
    bpm: 120,
    slack: 0.22,
    wobbleCommitSeconds: 0.52,
    legs: [
      {
        name: 'First Snow',
        lengthBeats: 144,
        speed: { start: 15, max: 18.5 },
        introduce: { ...BASICS, mud: 20, wobbler: 44, 'three-lanes': 70, herd: 100 },
        boss: false,
        nearMissTarget: 1700,
      },
      {
        name: 'Whiteout',
        lengthBeats: 160,
        speed: { start: 17, max: 21 },
        introduce: { ...BASICS, mud: 16, wobbler: 28, 'three-lanes': 44, herd: 60 },
        boss: false,
        nearMissTarget: 1900,
      },
      {
        name: 'The Summit Herd',
        lengthBeats: 176,
        speed: { start: 16.5, max: 21 },
        introduce: { ...BASICS, mud: 12, wobbler: 24, 'three-lanes': 36, herd: 52 },
        boss: true,
        nearMissTarget: 2300,
      },
    ],
  },
};

export const TOTAL_STARS = ROUTE_IDS.length * 3 * 3;

export function legRun(
  routeId: RouteId,
  legIndex: number,
  seed: number,
  rhythm: boolean,
): RunConfig {
  const route = ROUTES[routeId];
  const leg = route.legs[legIndex];
  if (!leg) throw new RangeError(`${route.name} has no leg ${legIndex + 1}.`);
  return {
    plan: {
      seed,
      bpm: route.bpm,
      speed: { ...leg.speed, rampBeats: leg.lengthBeats / 2 },
      introduce: leg.introduce,
      rest: { start: 3, end: 1.5 },
      slack: route.slack,
      wobbleCommitSeconds: route.wobbleCommitSeconds,
      lengthBeats: leg.lengthBeats,
      boss: leg.boss,
      leadInBeats: 6,
    },
    lives: STARTING_LIVES,
    rhythm,
    nearMissTarget: leg.nearMissTarget,
  };
}

/** Each leg has its own fixed road, so a retry meets the same donkeys. */
export function legSeed(routeId: RouteId, legIndex: number): number {
  return ROUTE_IDS.indexOf(routeId) * 1009 + legIndex * 97 + 1981;
}

export function isRouteOpen(route: Route, stars: number): boolean {
  return stars >= route.unlockStars;
}
