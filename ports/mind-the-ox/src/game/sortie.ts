import { createRng, type Rng } from '@shared/rng';
import { MAX_FUEL } from '../engine/constants';
import { deckLandable } from '../engine/deck';
import { SHIP_CLASSES, type ShipKind } from '../engine/fleet';
import {
  EDGE_WIDTH,
  LAUNCH_ROOM,
  TARGET_KINDS,
  buildMap,
  type BaseSite,
  type Gate,
  type MapSpec,
  type RaidSite,
  type ShipSite,
  type TargetSite,
  type WaterSpan,
} from '../engine/map';
import type { Objective } from '../engine/objectives';
import { RAIDER_CLASSES } from '../engine/raiders';
import { BOAT_REACH } from '../engine/torpedo';
import type { Rules } from '../engine/rules';
import type { CpuLevel, Loadout } from '../engine/world';
import { capitalised, THEMES, THEME_IDS, themed, type ThemeId } from '../themes';

/**
 * Custom Sortie: a naval mission built from a handful of choices and a
 * seed. The same choices and seed always build the same mission, so a
 * sortie can be shared as a short code in a link. Every mission built is
 * checked before it is offered: the home deck or runway can be reached,
 * the deck can be landed on in that sea, the distances are within a full
 * tank, and the objectives can actually be met (see `sortieProblems`).
 */
export type SortieBase = 'airfield' | 'carrier';
export type SortieMission =
  | 'land-strike'
  | 'anti-ship'
  | 'dogfight-land'
  | 'dogfight-carrier'
  | 'intercept'
  | 'convoy-escort'
  | 'defend-carrier'
  | 'recon'
  | 'night-landing';
export type EnemyOrigin = 'land' | 'sea' | 'both';
export type SortieHour = 'day' | 'dusk' | 'night';

export interface SortieOptions {
  base: SortieBase;
  mission: SortieMission;
  enemy: EnemyOrigin;
  seaState: Rules['seaState'];
  hour: SortieHour;
  level: CpuLevel;
  theme: ThemeId;
  seed: number;
}

export const SORTIE_MISSIONS: readonly { id: SortieMission; name: string; blurb: string }[] = [
  { id: 'land-strike', name: 'Land strike', blurb: 'Bomb their works on the coast' },
  { id: 'anti-ship', name: 'Anti-ship', blurb: 'Sink a battle squadron' },
  { id: 'dogfight-land', name: 'Dogfight, land', blurb: 'Their fighters, from an airfield' },
  { id: 'dogfight-carrier', name: 'Dogfight, carrier', blurb: 'Their fighters, off their deck' },
  { id: 'intercept', name: 'Intercept', blurb: 'Stop the bombers before our carrier' },
  { id: 'convoy-escort', name: 'Convoy escort', blurb: 'See the supply ships in' },
  { id: 'defend-carrier', name: 'Defend the carrier', blurb: 'Raids and torpedo boats' },
  { id: 'recon', name: 'Reconnaissance', blurb: 'Photograph the coast and come home' },
  { id: 'night-landing', name: 'Night landing', blurb: 'A strike, then the deck lights' },
];

/** Everything a game needs to fly a sortie, the map and its rules. */
export interface Sortie {
  /** The choices as the mission was built: some missions settle a choice themselves. */
  options: SortieOptions;
  map: MapSpec;
  objectives: readonly Objective[];
  rules: Partial<Pick<Rules, 'wind' | 'seaState' | 'antiAir'>>;
  enemies: readonly { base: number; level: CpuLevel; lives: number; hunts: boolean }[];
  round: number;
  loadout: Loadout;
  night: boolean;
  hour: 'dusk' | null;
  title: string;
  briefing: string;
}

const WIDTH = 3000;
const WALL = EDGE_WIDTH + 10;
/** Torpedo boats sent against our carrier come on at this pace, units a move: slow enough to meet. */
const ATTACK_BOAT_SPEED = 0.9;
/** Our plane guard keeps this far off the shore. */
const GUARD_OFFING = 90;
/** Their airfields, when they have two, stand this far apart along the coast. */
const FIELD_SPACING = 240;
/** Variations tried for one seed before giving up on it; in practice the first nearly always passes. */
const ATTEMPTS = 24;
/** The first variations are drawn as they come; the rest ease off, all the way by the last. */
const EASY_ATTEMPTS = 8;
/** A full tank must cover the way out and back with this much left to fight and come round in. */
const FUEL_RESERVE = 2500;
/**
 * For the torpedo boats' check: a pilot is off the deck and on the way
 * this many moves after the start, flies at this pace, and takes this long
 * to sink a boat once there.
 */
const LAUNCH_MOVES = 110;
const PLANE_PACE = 7;
const SINK_A_BOAT_MOVES = 80;
/** A photograph gate keeps this far outside the reach of their ships' guns. */
const GATE_CLEARANCE = 40;
/** Further ahead than this, moves, a boat that cannot yet reach its quarry never will. */
const LONGEST_LOOK = 6000;
const LEVEL_ROUND: Readonly<Record<CpuLevel, number>> = { easy: 0, normal: 1, hard: 2, brutal: 3 };
const LEVEL_FIGHTERS: Readonly<Record<CpuLevel, number>> = {
  easy: 1,
  normal: 2,
  hard: 2,
  brutal: 3,
};
const LEVEL_SHIPS: Readonly<Record<CpuLevel, number>> = { easy: 1, normal: 2, hard: 3, brutal: 3 };
const LEVEL_RAIDS: Readonly<Record<CpuLevel, number>> = { easy: 2, normal: 3, hard: 3, brutal: 4 };
/** Planes each enemy fighter's seat has to lose, outside a dogfight. */
const LEVEL_SPARES: Readonly<Record<CpuLevel, number>> = { easy: 2, normal: 3, hard: 4, brutal: 6 };
const LEVEL_ATTACK_BOATS: Readonly<Record<CpuLevel, number>> = {
  easy: 1,
  normal: 2,
  hard: 2,
  brutal: 3,
};

/** Some missions settle a choice for themselves: a carrier dogfight needs the enemy at sea. */
export function settleOptions(options: SortieOptions): SortieOptions {
  const settled = { ...options };
  if (settled.mission === 'dogfight-land') settled.enemy = 'land';
  if (settled.mission === 'dogfight-carrier') settled.enemy = 'sea';
  if (settled.mission === 'night-landing') settled.hour = 'night';
  return settled;
}

/**
 * Builds the sortie for these choices: the first variation of the seed that
 * passes every check. Each variation after the first few is a little
 * kinder than the one before (the enemy's boats slower and further off,
 * the raids later), so that a fair one is always found.
 */
export function buildSortie(options: SortieOptions): Sortie {
  const settled = settleOptions(options);
  let last: Sortie | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const easing = Math.max(0, attempt - EASY_ATTEMPTS) / (ATTEMPTS - 1 - EASY_ATTEMPTS);
    const rng = createRng(`mind-the-ox:sortie:${settled.seed}:${attempt}`);
    const sortie = draft(settled, rng, easing);
    if (sortieProblems(sortie).length === 0) return sortie;
    last = sortie;
  }
  throw new Error(
    `No fair sortie for seed ${settled.seed}: ${last ? sortieProblems(last).join('; ') : ''}.`,
  );
}

/** The coast, our side and theirs: where the land ends and the water begins. */
interface Coast {
  /** Their coast runs from the left wall to here. */
  theirShore: number;
  /** Our coast, if we fly from an airfield, from here to the right wall. */
  ourShore: number | null;
  sea: WaterSpan;
}

/**
 * One variation of a sortie, laid out with their coast on the left and
 * ours (or the open sea) on the right, and mirrored for half the seeds.
 */
function draft(options: SortieOptions, rng: Rng, easing: number): Sortie {
  const dogfight = options.mission === 'dogfight-land' || options.mission === 'dogfight-carrier';
  const fighters = LEVEL_FIGHTERS[options.level] + (dogfight ? 1 : 0);
  // One fighter to an airfield; with no carrier of theirs to take the rest, a second airfield.
  const fieldCount =
    options.enemy === 'sea' ? 0 : options.enemy === 'land' ? Math.min(2, fighters) : 1;
  const coast = layCoast(options, rng, fieldCount);
  const fleet: ShipSite[] = [];
  const bases: BaseSite[] = [];
  const targets: TargetSite[] = [];
  const raids: RaidSite[] = [];
  const gates: Gate[] = [];
  const { sea } = coast;
  const needsOurCarrier =
    options.base === 'carrier' ||
    options.mission === 'intercept' ||
    options.mission === 'defend-carrier';

  // Our carrier, steaming west into the westerly, and its plane guard.
  if (needsOurCarrier) {
    // Our fleet keeps to our half of the sea, theirs to theirs (see `ownWater`).
    const right = Math.min(WIDTH - EDGE_WIDTH - LAUNCH_ROOM, sea.right - 90);
    const left = Math.min(right - 200, ownWater(sea).ours);
    const x = Math.min(right, Math.max(left, rng.int(1900, 2250)));
    fleet.push({
      kind: 'carrier',
      side: 0,
      x,
      direction: -1,
      patrol: { left: Math.max(left, x - rng.int(280, 420)), right },
      protect: options.mission === 'intercept' || options.mission === 'defend-carrier',
    });
    // Its plane guard a little astern, kept clear of the shore.
    const guard = Math.min(x + 180, sea.right - GUARD_OFFING);
    fleet.push({
      kind: 'destroyer',
      side: 0,
      x: guard,
      direction: -1,
      patrol: {
        left: Math.max(sea.left + GUARD_OFFING, x - 300),
        right: Math.max(guard, Math.min(sea.right - GUARD_OFFING, x + 300)),
      },
    });
  }
  bases.push(
    options.base === 'carrier'
      ? { side: 0, x: fleet[0]?.x ?? 0, facing: -1, carrier: 0 }
      : { side: 0, x: (coast.ourShore ?? WIDTH - 400) + rng.int(170, 230), facing: -1 },
  );

  // Their airfields ashore, their carrier at sea, or both.
  const firstField = WALL + rng.int(150, 200);
  const fields = Array.from(
    { length: fieldCount },
    (_, index) => firstField + index * FIELD_SPACING,
  );
  for (const x of fields) bases.push({ side: 1, x, facing: 1 });
  const theirField = fields.length > 0 ? (fields[fields.length - 1] as number) : null;
  let theirDeck: number | null = null;
  if (options.enemy !== 'land') {
    const theirs = ownWater(sea).theirs;
    const left = Math.max(sea.left + 80, EDGE_WIDTH + LAUNCH_ROOM);
    const x = Math.min(theirs - 100, Math.max(left, sea.left + rng.int(260, 420)));
    theirDeck = bases.length;
    fleet.push({
      kind: 'carrier',
      side: 1,
      x,
      direction: 1,
      patrol: { left: Math.min(x, Math.max(left, x - 220)), right: Math.max(x, theirs - 60) },
    });
    bases.push({ side: 1, x, facing: 1, carrier: fleet.length - 1 });
    fleet.push({
      kind: 'destroyer',
      side: 1,
      x: x + 120,
      direction: 1,
      patrol: { left: Math.max(sea.left + 50, x - 150), right: theirs },
    });
  }
  const ourCarrier = needsOurCarrier ? 0 : -1;

  switch (options.mission) {
    case 'land-strike':
      targets.push(...shoreTargets(rng, theirField, coast.theirShore, rng.int(5, 8)));
      break;
    case 'anti-ship':
      fleet.push(...squadron(rng, options.level, sea));
      break;
    case 'intercept':
      raids.push(...raidWaves(rng, options, ourCarrier, theirDeck === null ? null : fleet, easing));
      break;
    case 'convoy-escort':
      fleet.push(...convoy(rng, sea), ...torpedoBoats(rng, options.level, sea, 120 * (1 - easing)));
      break;
    case 'defend-carrier':
      raids.push(...raidWaves(rng, { ...options, level: 'easy' }, ourCarrier, null, easing));
      fleet.push(...attackBoats(rng, options.level, sea, fleet[0]?.x ?? sea.right, easing));
      break;
    case 'recon':
      gates.push(...photoGates(rng, coast));
      break;
    case 'night-landing':
      targets.push(...shoreTargets(rng, theirField, coast.theirShore, 2));
      break;
    case 'dogfight-land':
    case 'dogfight-carrier':
      break;
  }

  // A fighter on each airfield and the rest on their carrier's deck, one behind another.
  const fieldBases = bases.flatMap((base, index) =>
    base.side === 1 && base.carrier === undefined ? [index] : [],
  );
  const seats = Array.from(
    { length: theirDeck === null ? fieldBases.length : fighters },
    (_, index) =>
      index < fieldBases.length ? (fieldBases[index] as number) : (theirDeck as number),
  );
  // In a dogfight, and as a raid's escorts, they come looking for the player.
  const hunts = dogfight || options.mission === 'intercept' || options.mission === 'defend-carrier';
  const enemies = seats.map((base) => ({
    base,
    level: options.level,
    hunts,
    // They have planes to lose: in a dogfight as many in all however many fly; otherwise a
    // squadron's spares by the difficulty, so a pilot who brings down enough clears the sky.
    lives: dogfight ? Math.ceil((fighters * 2) / seats.length) : LEVEL_SPARES[options.level],
  }));

  const spec: MapSpec = {
    name: `Sortie ${options.seed}`,
    seed: options.seed,
    layout: 'sea',
    ground: groundKnots(rng, coast),
    sea: { spans: [sea] },
    bases,
    targets,
    oxen: coast.theirShore - WALL > 260 ? [WALL + 40] : [],
    fleet,
    raids,
    gates,
  };
  const mirrored = rng.chance(0.5);
  const wind = rng.float(0.2, 0.5);
  return {
    options,
    map: mirrored ? mirror(spec) : spec,
    objectives: objectivesFor(options.mission),
    rules: {
      wind: mirrored ? -wind : wind,
      seaState: options.seaState,
      antiAir:
        options.mission === 'land-strike' &&
        (options.level === 'hard' || options.level === 'brutal'),
    },
    enemies,
    round: LEVEL_ROUND[options.level],
    loadout: options.mission === 'anti-ship' ? 'torpedo' : 'bombs',
    night: options.hour === 'night',
    hour: options.hour === 'dusk' ? 'dusk' : null,
    title: SORTIE_MISSIONS.find((mission) => mission.id === options.mission)?.name ?? 'Sortie',
    briefing: capitalised(themed(BRIEFINGS[options.mission], THEMES[options.theme])),
  };
}

function layCoast(options: SortieOptions, rng: Rng, fields: number): Coast {
  const extraFields = Math.max(0, fields - 1) * FIELD_SPACING;
  const theirShore =
    extraFields +
    (options.mission === 'land-strike' ||
    options.mission === 'recon' ||
    options.mission === 'night-landing'
      ? rng.int(820, 1000)
      : rng.int(560, 760));
  const ourShore = options.base === 'airfield' ? rng.int(2280, 2420) : null;
  return {
    theirShore,
    ourShore,
    sea: {
      left: theirShore,
      right: ourShore ?? WIDTH - WALL - rng.int(20, 60),
      kind: 'sea',
      shores: [rng.chance(0.6) ? 'beach' : 'cliff', ourShore === null ? 'cliff' : 'beach'],
    },
  };
}

/** Rolling land on both coasts; the sea floods whatever lies between. */
function groundKnots(rng: Rng, coast: Coast): [number, number][] {
  const knots: [number, number][] = [[0, rng.int(56, 70)]];
  for (let x = 250; x < coast.theirShore - 60; x += rng.int(140, 220))
    knots.push([x, rng.int(46, 72)]);
  knots.push([coast.theirShore - 40, 46]);
  if (coast.ourShore !== null) {
    knots.push([coast.ourShore + 40, 46]);
    for (let x = coast.ourShore + 200; x < WIDTH - 200; x += rng.int(140, 220))
      knots.push([x, rng.int(46, 66)]);
  }
  knots.push([WIDTH, rng.int(56, 70)]);
  return knots;
}

/** Targets on their coast, between their airfield and the shore, spaced apart. */
function shoreTargets(rng: Rng, field: number | null, shore: number, count: number): TargetSite[] {
  const from = (field ?? WALL) + 130;
  const to = shore - 70;
  const spacing = Math.max(46, (to - from) / count);
  const sites: TargetSite[] = [];
  for (let index = 0; index < count && from + index * spacing <= to; index++) {
    const kind = index % 3 === 1 ? 'depot' : (rng.pick(TARGET_KINDS) as TargetSite['kind']);
    sites.push({ kind, side: 1, x: Math.round(from + index * spacing + rng.float(0, 8)) });
  }
  return sites;
}

/** A battle squadron for an anti-ship strike: a capital ship and its screen. */
function squadron(rng: Rng, level: CpuLevel, sea: WaterSpan): ShipSite[] {
  const middle = Math.round((sea.left + sea.right) / 2 - rng.int(100, 300));
  const flagship: ShipKind = level === 'easy' ? 'cruiser' : 'battleship';
  const ships: ShipSite[] = [patroller(flagship, middle, 1, 260, sea)];
  for (let index = 0; index < LEVEL_SHIPS[level]; index++) {
    const kind: ShipKind = index === 2 ? 'cruiser' : 'destroyer';
    const offset = (index % 2 === 0 ? -1 : 1) * rng.int(170, 260);
    ships.push(patroller(kind, middle + offset, index % 2 === 0 ? 1 : -1, 300, sea));
  }
  return ships;
}

/** A ship steaming back and forth about x, kept clear of both shores. */
function patroller(
  kind: ShipKind,
  x: number,
  direction: 1 | -1,
  reach: number,
  sea: WaterSpan,
): ShipSite {
  const half = SHIP_CLASSES[kind].length / 2 + 40;
  const left = Math.max(sea.left + half, x - reach);
  const right = Math.min(sea.right - half, x + reach);
  return {
    kind,
    side: 1,
    x: Math.min(right, Math.max(left, x)),
    direction,
    patrol: { left, right },
  };
}

/** Three supply ships for the harbour in the west, sailing from the east. */
function convoy(rng: Rng, sea: WaterSpan): ShipSite[] {
  const start = sea.right - rng.int(380, 460);
  return [0, 1, 2].map((index) => ({
    kind: 'supply' as const,
    side: 0 as const,
    x: start + index * 120,
    direction: -1 as const,
    speed: 0.6,
    bound: sea.left + 300 + index * 100,
    convoy: true,
  }));
}

/**
 * Torpedo boats lying in wait off their coast, first heading away from
 * what they will attack; they patrol as far east as `reach` past where
 * they start.
 */
function torpedoBoats(rng: Rng, level: CpuLevel, sea: WaterSpan, reach: number): ShipSite[] {
  return Array.from({ length: LEVEL_SHIPS[level] + 1 }, (_, index) => {
    const x = sea.left + rng.int(140, 320);
    return {
      kind: 'torpedo-boat' as const,
      side: 1 as const,
      x,
      direction: -1 as const,
      patrol: { left: Math.max(sea.left + 60, x - 160), right: x + reach + index * 40 },
    };
  });
}

/**
 * Torpedo boats coming for our carrier from their side of the sea, slowly
 * enough to be met on the way and one behind another: they patrol up to
 * just short of it.
 */
function attackBoats(
  rng: Rng,
  level: CpuLevel,
  sea: WaterSpan,
  carrier: number,
  easing: number,
): ShipSite[] {
  // At the kindest, one boat fewer.
  const count = Math.max(1, LEVEL_ATTACK_BOATS[level] - (easing === 1 ? 1 : 0));
  const first = sea.left + rng.int(110, 160) - Math.round(easing * 60);
  return Array.from({ length: count }, (_, index) => {
    const x = first + (count - 1 - index) * 90;
    return {
      kind: 'torpedo-boat' as const,
      side: 1 as const,
      x,
      direction: 1 as const,
      speed: ATTACK_BOAT_SPEED * (1 - easing * 0.6),
      patrol: { left: Math.max(sea.left + 60, x - 100), right: carrier - 140 },
    };
  });
}

/**
 * Their ships keep west of this, ours east of the other, so the two
 * fleets do not steam through one another before the fight begins.
 */
function ownWater(sea: WaterSpan): { theirs: number; ours: number } {
  const middle = (sea.left + sea.right) / 2;
  return { theirs: middle - 260, ours: middle + 260 };
}

/**
 * Raids on our carrier: waves of bombers, an airship among them now and
 * then, from their coast or from their carrier's side of the sea.
 */
function raidWaves(
  rng: Rng,
  options: SortieOptions,
  target: number,
  fleet: readonly ShipSite[] | null,
  easing: number,
): RaidSite[] {
  if (target < 0) return [];
  const theirCarrier = fleet?.find((ship) => ship.side === 1 && ship.kind === 'carrier');
  const from = theirCarrier ? theirCarrier.x - 120 : WALL + 80;
  let at = rng.int(220, 320) + Math.round(easing * 240);
  return Array.from({ length: LEVEL_RAIDS[options.level] }, (_, wave) => {
    const zeppelin = wave % 2 === 1 && rng.chance(0.7);
    const raid: RaidSite = {
      kind: zeppelin ? 'zeppelin' : 'bomber',
      side: 1,
      at,
      x: from,
      altitude: zeppelin ? rng.int(150, 175) : rng.int(115, 160),
      count: zeppelin ? 1 : rng.int(2, options.level === 'easy' ? 2 : 4),
      target,
    };
    at += rng.int(520, 720);
    return raid;
  });
}

/**
 * Photographs of their coast: gates low over the shore defences, taken one
 * after another, the last over the beach; all over the land, clear of where
 * their ships steam.
 */
function photoGates(rng: Rng, coast: Coast): Gate[] {
  const xs = [
    coast.theirShore - rng.int(260, 320),
    coast.theirShore - rng.int(130, 180),
    coast.theirShore - rng.int(10, 40),
  ];
  return xs.map((x) => {
    const bottom = rng.int(84, 100);
    return { x, bottom, top: bottom + rng.int(30, 40) };
  });
}

function objectivesFor(mission: SortieMission): readonly Objective[] {
  switch (mission) {
    case 'land-strike':
      return ['shore'];
    case 'anti-ship':
      return ['ships'];
    case 'dogfight-land':
    case 'dogfight-carrier':
      return ['planes'];
    case 'intercept':
      return ['raiders'];
    case 'convoy-escort':
      return ['escort'];
    case 'defend-carrier':
      return ['raiders', 'boats'];
    case 'recon':
      return ['gates', 'land-aboard'];
    case 'night-landing':
      return ['shore', 'land-aboard'];
  }
}

/** The whole layout turned round, east for west: so their coast is on the right for half the seeds. */
function mirror(spec: MapSpec): MapSpec {
  const flip = (x: number) => WIDTH - x;
  const flipSpan = (span: { left: number; right: number }) => ({
    left: flip(span.right),
    right: flip(span.left),
  });
  return {
    ...spec,
    ground: spec.ground.map(([x, height]) => [flip(x), height] as const),
    sea: spec.sea && {
      spans: spec.sea.spans.map((span) => ({
        ...span,
        ...flipSpan(span),
        shores: [span.shores[1], span.shores[0]] as const,
      })),
    },
    bases: spec.bases.map((base) => ({
      ...base,
      x: flip(base.x),
      facing: base.facing === 1 ? -1 : 1,
    })),
    targets: spec.targets.map((target) => ({ ...target, x: flip(target.x) })),
    oxen: spec.oxen.map(flip),
    fleet: (spec.fleet ?? []).map((ship) => ({
      ...ship,
      x: flip(ship.x),
      direction: ship.direction === 1 ? -1 : 1,
      patrol: ship.patrol && flipSpan(ship.patrol),
      bound: ship.bound === undefined ? undefined : flip(ship.bound),
    })),
    raids: (spec.raids ?? []).map((raid) => ({ ...raid, x: flip(raid.x) })),
    gates: (spec.gates ?? []).map((gate) => ({ ...gate, x: flip(gate.x) })),
  };
}

/**
 * What would make a sortie unfair or impossible, in words; none for a good
 * one. The map itself is checked as every hand-drawn map is (buildMap).
 */
export function sortieProblems(sortie: Sortie): string[] {
  const problems: string[] = [];
  let map: ReturnType<typeof buildMap>;
  try {
    map = buildMap(sortie.map);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const home = map.bases[0];
  if (!home || home.side !== 0) return ['there is nowhere to take off from'];
  const homeX = home.x;
  if (
    home.carrier !== undefined &&
    !deckLandable({ seaState: sortie.options.seaState, landingAssist: false })
  )
    problems.push('the deck rises and falls too fast to land on in this sea');

  // There and back on a full tank, with fuel to spare for the fight.
  const reach = [
    ...map.targets.filter((target) => target.side === 1).map((target) => target.x),
    ...map.fleet.filter((ship) => ship.side === 1).map((ship) => ship.patrol?.left ?? ship.x),
    ...map.fleet.filter((ship) => ship.side === 1).map((ship) => ship.patrol?.right ?? ship.x),
    ...map.gates.map((gate) => gate.x),
    ...map.raids.map((raid) => raid.x),
  ];
  const farthest = Math.max(0, ...reach.map((x) => Math.abs(x - homeX)));
  if (farthest * 2 + FUEL_RESERVE > MAX_FUEL) problems.push('the targets are beyond a full tank');

  for (const objective of sortie.objectives) {
    const ashore = map.targets.some((target) => target.side === 1);
    const afloat = map.fleet.some((ship) => ship.side === 1);
    if (objective === 'targets' && !ashore && !afloat) problems.push('there is nothing to destroy');
    if (objective === 'shore' && !ashore) problems.push('there is nothing ashore to destroy');
    if (objective === 'ships' && !afloat) problems.push('there are no ships to sink');
    if (objective === 'boats' && !map.fleet.some((ship) => ship.kind === 'torpedo-boat'))
      problems.push('there are no boats to sink');
    if (objective === 'gates' && map.gates.length === 0) problems.push('there are no gates');
    if (objective === 'raiders' && map.raids.length === 0) problems.push('no raid is coming');
    if (objective === 'planes' && sortie.enemies.length === 0) problems.push('nobody to fight');
    if (
      objective === 'escort' &&
      !map.fleet.some((ship) => ship.convoy && ship.bound !== undefined)
    )
      problems.push('there is nobody to escort');
  }

  // The first raid gives our pilot time to take off and climb to meet it.
  for (const raid of map.raids) {
    const target = map.fleet[raid.target];
    if (!target) continue;
    const arrives = raid.at + Math.abs(target.x - raid.x) / RAIDER_CLASSES[raid.kind].speed;
    const ready = 90 + (raid.altitude - 50) / 2;
    if (arrives - raid.at < 240 || arrives < ready + 240)
      problems.push('a raid arrives too soon to meet');
  }

  // Torpedo boats far enough from what they hunt that a pilot can get to them, one after
  // another, before the first of them could fire.
  const quarries = map.fleet.filter((ship) => ship.side === 0);
  const boats = map.fleet
    .filter((ship) => ship.kind === 'torpedo-boat' && ship.side === 1)
    .map((boat) => ({
      fires: Math.min(...quarries.map((quarry) => earliestShot(boat, quarry))),
      reached: LAUNCH_MOVES + Math.abs(boat.x - homeX) / PLANE_PACE,
    }))
    .sort((a, b) => a.fires - b.fires);
  boats.forEach((boat, index) => {
    if (boat.fires < boat.reached + (index + 1) * SINK_A_BOAT_MOVES)
      problems.push('a torpedo boat could fire before a pilot could get to it');
  });
  // No photograph to be taken under their ships' guns.
  for (const gate of map.gates)
    for (const ship of map.fleet.filter((candidate) => candidate.side === 1)) {
      const guns = SHIP_CLASSES[ship.kind].guns;
      if (!guns) continue;
      const patrol = ship.patrol ?? { left: ship.x, right: ship.x };
      const away = Math.max(patrol.left - gate.x, gate.x - patrol.right, 0);
      if (away < guns.range + GATE_CLEARANCE) problems.push('a gate lies under their ships’ guns');
    }
  for (const ship of map.fleet.filter((candidate) => candidate.bound !== undefined)) {
    const moves =
      Math.abs((ship.bound ?? ship.x) - ship.x) / (ship.speed ?? SHIP_CLASSES[ship.kind].speed);
    if (moves > 3600) problems.push('the convoy would take too long to arrive');
  }
  return problems;
}

/**
 * The soonest, in moves, a torpedo boat could have a ship of ours within
 * its reach: each steaming at full speed wherever its orders let it go (a
 * patrol keeps a ship between its ends, a convoy goes on to its harbour),
 * at the worst for us.
 */
function earliestShot(boat: ShipSite, quarry: ShipSite): number {
  const reachable = (ship: ShipSite, moves: number): { left: number; right: number } => {
    const run = (ship.speed ?? SHIP_CLASSES[ship.kind].speed) * moves;
    if (ship.bound !== undefined) {
      const along = Math.min(Math.abs(ship.bound - ship.x), run);
      const x = ship.x + Math.sign(ship.bound - ship.x) * along;
      return { left: Math.min(ship.x, x), right: Math.max(ship.x, x) };
    }
    const patrol = ship.patrol ?? { left: ship.x, right: ship.x };
    return {
      left: Math.max(Math.min(patrol.left, ship.x), ship.x - run),
      right: Math.min(Math.max(patrol.right, ship.x), ship.x + run),
    };
  };
  for (let moves = 0; moves <= LONGEST_LOOK; moves += 10) {
    const hunter = reachable(boat, moves);
    const hunted = reachable(quarry, moves);
    const gap = Math.max(hunted.left - hunter.right, hunter.left - hunted.right, 0);
    if (gap <= BOAT_REACH) return moves;
  }
  return Number.POSITIVE_INFINITY;
}

/** Briefings in the theme's words: {enemy}, {carrier}, {bomber} and the rest are filled in. */
const BRIEFINGS: Readonly<Record<SortieMission, string>> = {
  'land-strike':
    '{enemy} have works along their coast, a {depot} or two among them. Destroy every one.',
  'anti-ship':
    '{enemy} have a squadron at sea: a {battleship} and its escorts. Sink the lot. A {torpedo} does the most damage: drop it low, level and slow.',
  'dogfight-land':
    'Their fighters are up from the airfield on the coast. Bring every one of them down.',
  'dogfight-carrier':
    'Their {carrier} is launching fighters. Bring them all down, or sink the {carrier} so no more can come.',
  intercept:
    '{bomber}s are on their way to our {carrier}, wave after wave. Stop every one before it is over the deck. If the {carrier} goes down, so does the mission.',
  'convoy-escort':
    'Three of our {supply}s are making for the harbour in the west, and {boat}s are waiting for them. See every {supply} in.',
  'defend-carrier':
    'Raids and {boat}s are coming for our {carrier}. Stop the raids, sink the {boat}s, and keep the {carrier} afloat.',
  recon:
    'We need pictures of their coast. Fly through each marked gate, low enough for the camera, in order, then bring the plates home and land.',
  'night-landing':
    'Two targets on their coast tonight. Hit them, then find your way home and land by the deck lights.',
};

/** A sortie as a short code for a link: its choices, one letter each, and the seed. */
export function sortieCode(options: SortieOptions): string {
  const letters = [
    options.base === 'carrier' ? 'c' : 'a',
    String.fromCharCode(
      97 + SORTIE_MISSIONS.findIndex((mission) => mission.id === options.mission),
    ),
    options.enemy[0],
    String(options.seaState),
    options.hour === 'day' ? 'd' : options.hour === 'dusk' ? 'k' : 'n',
    options.level[0],
    String(THEME_IDS.indexOf(options.theme)),
  ].join('');
  return `${letters}-${options.seed.toString(36)}`;
}

const LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard', 'brutal'];

/** The choices a code stands for, or null for one that is not a sortie code. */
export function parseSortieCode(code: string): SortieOptions | null {
  const match = /^([ac])([a-i])([lsb])([0-2])([dkn])([enhb])([0-2])-([0-9a-z]{1,8})$/.exec(
    code.trim(),
  );
  if (!match) return null;
  const [, base, mission, enemy, sea, hour, level, theme, seed] = match as unknown as string[];
  const seedValue = Number.parseInt(seed ?? '', 36);
  const missionChoice = SORTIE_MISSIONS[(mission ?? 'a').charCodeAt(0) - 97];
  const themeChoice = THEME_IDS[Number(theme)];
  const levelChoice = LEVELS.find((candidate) => candidate[0] === level);
  if (!missionChoice || !themeChoice || !levelChoice || !Number.isFinite(seedValue)) return null;
  return {
    base: base === 'c' ? 'carrier' : 'airfield',
    mission: missionChoice.id,
    enemy: enemy === 'l' ? 'land' : enemy === 's' ? 'sea' : 'both',
    seaState: Number(sea) as Rules['seaState'],
    hour: hour === 'd' ? 'day' : hour === 'k' ? 'dusk' : 'night',
    level: levelChoice,
    theme: themeChoice,
    seed: seedValue >>> 0,
  };
}
