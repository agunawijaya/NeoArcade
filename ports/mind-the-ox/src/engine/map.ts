import { createRng, type Rng } from '@shared/rng';
import { CEILING, CLASSIC_WORLD_WIDTH, OWN_TARGETS, TARGETS_PER_WORLD } from './constants';
import { SHIP_CLASSES, type ShipKind } from './fleet';

export type Side = 0 | 1;

/** The four kinds of ground target; themes give them their own names and looks. */
/** The airship shed is only ever placed by hand: 1984's battlefields never had one. */
export type TargetKind = 'hangar' | 'factory' | 'depot' | 'tank' | 'shed';

/** The kinds a generated battlefield is built from. */
export const TARGET_KINDS: readonly TargetKind[] = ['hangar', 'factory', 'depot', 'tank'];

/** The box each kind stands in, in world units; the depot is the one that scores double. */
export const TARGET_SIZE: Readonly<Record<TargetKind, { width: number; height: number }>> = {
  hangar: { width: 18, height: 11 },
  factory: { width: 16, height: 13 },
  depot: { width: 14, height: 10 },
  tank: { width: 14, height: 7 },
  shed: { width: 34, height: 15 },
};

/**
 * Who flies from where, and what there is to bomb. Classic is 1984's
 * battle; Co-op gives the second friendly airfield to a second player;
 * Versus splits the world in two halves of ten targets each; Dogfight
 * keeps the airfields and the wildlife and takes the targets away. Sea is
 * Carrier Ops': open water and ships, with as many targets as the sortie
 * needs.
 */
export type MapLayout = 'classic' | 'coop' | 'versus' | 'dogfight' | 'sea';

export interface Span {
  left: number;
  right: number;
}

export interface BaseSite {
  side: Side;
  /** Where the plane is parked; the runway runs from here in the facing direction. */
  x: number;
  facing: 1 | -1;
  /** A carrier's deck instead of a runway: the ship's index in the map's fleet. */
  carrier?: number;
}

export interface TargetSite {
  kind: TargetKind;
  side: Side;
  /** The centre of the target's footprint. */
  x: number;
  /** A convoy lorry: it drives towards this x and gets away if it arrives. */
  drivesTo?: number;
}

export interface FlockSite {
  x: number;
  y: number;
  direction: 1 | -1;
}

/** Where water meets land: a beach eases down to it, a cliff drops straight in. */
export type Shore = 'beach' | 'cliff';

export interface WaterSpan extends Span {
  /** Open sea, or a sheltered harbour. */
  kind: 'sea' | 'harbour';
  shores: readonly [left: Shore, right: Shore];
}

/** The water in a world: one flat surface for the engine; the waves are for the eye. */
export interface Sea {
  level: number;
  spans: WaterSpan[];
}

/** The height of the sea in every Carrier Ops world: low enough to leave room above a ship's masts. */
export const SEA_LEVEL = 34;

export interface ShipSite {
  kind: ShipKind;
  side: Side;
  x: number;
  direction: 1 | -1;
  /** Units a move; the class's cruising speed if left out. */
  speed?: number;
  /** Steams back and forth between these, turning round at each end. */
  patrol?: Span;
  /** Steams for this x and gets away there, as a convoy's lorries do. */
  bound?: number;
  /** Losing it loses the round: our carrier, when the sortie is to defend it. */
  protect?: boolean;
  /** One of a convoy we escort: most of it must get in to where it is bound. */
  convoy?: boolean;
}

export type RaiderKind = 'bomber' | 'zeppelin';

/** A wave of bombers (or one airship) sent against a ship. */
export interface RaidSite {
  kind: RaiderKind;
  side: Side;
  /** Moves after the round begins. */
  at: number;
  /** Where it comes in from, and the height it flies at. */
  x: number;
  altitude: number;
  count: number;
  /** The ship it is sent against, by its index in the fleet. */
  target: number;
}

/**
 * A gate to fly through, between two heights: a reconnaissance photograph
 * that only comes out from low enough, a pylon of an air race. A mission
 * with gates has them passed in order.
 */
export interface Gate {
  x: number;
  bottom: number;
  top: number;
}

/** A stretch of low cloud lying on the land, up to `top`: nobody sees into it. */
export interface FogBank extends Span {
  top: number;
}

/** Everything that makes one battlefield, before any shot is fired. */
export interface WorldMap {
  name: string;
  seed: number;
  width: number;
  layout: MapLayout;
  /** Ground height for each whole unit across the world. */
  heights: number[];
  /** Every runway; each side's first is its home. */
  bases: BaseSite[];
  targets: TargetSite[];
  oxen: number[];
  flocks: FlockSite[];
  fog: FogBank[];
  /** Open water, if the world has any. */
  sea: Sea | null;
  fleet: ShipSite[];
  raids: RaidSite[];
  gates: Gate[];
}

/** The runway stretches this far from the parking spot, ahead of the plane. */
export const RUNWAY_LENGTH = 80;
/** And this far behind it. */
export const RUNWAY_BACK = 14;
/** Both ends of the world rise into mountains taller than the ceiling. */
export const EDGE_WIDTH = 170;
/**
 * A carrier turns at the ends of its patrol; that far from the mountains
 * there must still be this much room, for a plane launched as it comes to
 * the end to climb away.
 */
export const LAUNCH_ROOM = 520;
/** No ground between the mountains may come closer than this to the ceiling. */
export const HEADROOM = 70;
const LOWEST_GROUND = 22;
const PASTURE_HALF_WIDTH = 12;

/** How many targets each layout has, and how many of them are the first side's; a sortie at sea sets its own. */
const TARGET_COUNTS: Readonly<Partial<Record<MapLayout, { total: number; own: number }>>> = {
  classic: { total: TARGETS_PER_WORLD, own: OWN_TARGETS },
  coop: { total: TARGETS_PER_WORLD, own: OWN_TARGETS },
  versus: { total: TARGETS_PER_WORLD, own: TARGETS_PER_WORLD / 2 },
  dogfight: { total: 0, own: 0 },
};

/** Runway ends, left and right, for a base. */
export function runwaySpan(base: BaseSite): Span {
  const back = base.x - base.facing * RUNWAY_BACK;
  const front = base.x + base.facing * RUNWAY_LENGTH;
  return { left: Math.min(back, front), right: Math.max(back, front) };
}

export function targetSpan(target: TargetSite): Span {
  const half = TARGET_SIZE[target.kind].width / 2;
  return { left: target.x - half, right: target.x + half };
}

export function pastureSpan(ox: number): Span {
  return { left: ox - PASTURE_HALF_WIDTH, right: ox + PASTURE_HALF_WIDTH };
}

export function isWaterAt(map: WorldMap, x: number): boolean {
  return map.sea?.spans.some((span) => x >= span.left && x <= span.right) ?? false;
}

export function inFog(map: WorldMap, x: number, y: number): boolean {
  return map.fog.some((bank) => x >= bank.left && x <= bank.right && y <= bank.top);
}

export interface MapOptions {
  seed: number;
  /** At least the 1984 width; narrower worlds cannot fit its layout. */
  width?: number;
  name?: string;
  layout?: MapLayout;
}

/**
 * A new battlefield from a seed. The classic layout is 1984's: the
 * player's home a little left of the middle with three of its own targets
 * behind it, three enemy airfields, seventeen enemy targets spread over the
 * rest, two oxen grazing just beyond home and four flocks along the
 * ceiling. The ground itself is new every time. Seeds that would make an
 * unfair map are skipped deterministically, so the same seed always gives
 * the same map.
 */
export function generateMap({
  seed,
  width = CLASSIC_WORLD_WIDTH,
  name,
  layout = 'classic',
}: MapOptions): WorldMap {
  let problems: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const map = layOut(seed, attempt, width, name ?? `Sector ${seed % 10000}`, layout);
    problems = mapProblems(map);
    if (problems.length === 0) return map;
  }
  throw new Error(`No fair map came out of seed ${seed}: ${problems.join('; ')}.`);
}

function layOut(
  seed: number,
  attempt: number,
  width: number,
  name: string,
  layout: MapLayout,
): WorldMap {
  const rng = createRng(
    `mind-the-ox:map:${seed}:${attempt}${layout === 'classic' ? '' : `:${layout}`}`,
  );
  const heights = rollingGround(rng, width);
  const at = (fraction: number) => Math.round(width * fraction);
  const flocks = (): FlockSite[] =>
    [0.123, 0.457, 0.543, 0.877].map((fraction, index) => ({
      x: at(fraction),
      y: CEILING - rng.int(6, 16),
      direction: index < 2 ? 1 : -1,
    }));

  if (layout === 'versus') {
    const bases: BaseSite[] = [
      { side: 0, x: at(0.3), facing: 1 },
      { side: 1, x: at(0.7), facing: -1 },
    ];
    const oxen = [at(0.5) - 36, at(0.5) + 36];
    const targets = placeVersusTargets(rng, width, bases, oxen);
    return settle({
      name,
      seed,
      width,
      layout,
      heights: [...heights],
      bases,
      targets,
      oxen,
      flocks: flocks(),
      fog: [],
      sea: null,
      fleet: [],
      raids: [],
      gates: [],
    });
  }

  const scale = width / CLASSIC_WORLD_WIDTH;
  const bases: BaseSite[] = [
    { side: 0, x: at(0.423), facing: 1 },
    { side: layout === 'coop' ? 0 : 1, x: at(0.573), facing: -1 },
    { side: 1, x: at(0.196), facing: 1 },
    { side: 1, x: at(0.819), facing: -1 },
  ];
  const home = bases[0] as BaseSite;
  const firstOx = home.x + Math.max(140, Math.round(150 * scale));
  const oxen = [firstOx, Math.max(firstOx + 70, home.x + Math.round(338 * scale))];
  const targets = layout === 'dogfight' ? [] : placeClassicTargets(rng, width, bases, oxen);
  return settle({
    name,
    seed,
    width,
    layout,
    heights: [...heights],
    bases,
    targets,
    oxen,
    flocks: flocks(),
    fog: [],
    sea: null,
    fleet: [],
    raids: [],
    gates: [],
  });
}

/** A battlefield drawn by hand: the shape of the land, every airfield, target and ox placed. */
export interface MapSpec {
  name: string;
  /** Seeds the fine detail laid over the hand-shaped land. */
  seed: number;
  width?: number;
  layout?: MapLayout;
  /** The lie of the land as [x, height] knots, eased into one another. */
  ground: readonly (readonly [number, number])[];
  bases: readonly BaseSite[];
  targets: readonly TargetSite[];
  oxen: readonly number[];
  /** Defaults to 1984's four flocks. */
  flocks?: readonly FlockSite[];
  fog?: readonly FogBank[];
  /** Water, flooded to the sea level (`SEA_LEVEL` unless given). */
  sea?: { level?: number; spans: readonly WaterSpan[] };
  fleet?: readonly ShipSite[];
  raids?: readonly RaidSite[];
  gates?: readonly Gate[];
}

/**
 * Builds a hand-designed map: the knots give the land its shape, a little
 * seeded noise roughens it, the mountains wall it in, and everything that
 * stands on it gets its ground levelled. A spec that makes an unfair map is
 * a mistake in the spec, so it throws.
 */
export function buildMap(spec: MapSpec): WorldMap {
  const width = spec.width ?? CLASSIC_WORLD_WIDTH;
  const rng = createRng(`mind-the-ox:hand-map:${spec.seed}`);
  const heights = new Float64Array(width);
  const knots = [...spec.ground].sort((a, b) => a[0] - b[0]);
  for (let x = 0; x < width; x++) heights[x] = knotHeight(knots, x);
  addNoise(rng, heights, 90, 4);
  addNoise(rng, heights, 32, 1.4);
  wallIn(heights);
  const sea: Sea | null = spec.sea
    ? {
        level: spec.sea.level ?? SEA_LEVEL,
        spans: spec.sea.spans.map((span) => ({ ...span })),
      }
    : null;
  if (sea) flood(heights, sea);
  const flocks =
    spec.flocks ??
    [0.123, 0.457, 0.543, 0.877].map((fraction, index) => ({
      x: Math.round(width * fraction),
      y: CEILING - 10,
      direction: index < 2 ? (1 as const) : (-1 as const),
    }));
  const map = settle({
    name: spec.name,
    seed: spec.seed,
    width,
    layout: spec.layout ?? 'classic',
    heights: [...heights],
    bases: spec.bases.map((base) => ({ ...base })),
    targets: spec.targets.map((target) => ({ ...target })),
    oxen: [...spec.oxen],
    flocks: flocks.map((flock) => ({ ...flock })),
    fog: (spec.fog ?? []).map((bank) => ({ ...bank })),
    sea,
    fleet: (spec.fleet ?? []).map((ship) => ({ ...ship })),
    raids: (spec.raids ?? []).map((raid) => ({ ...raid })),
    gates: (spec.gates ?? []).map((gate) => ({ ...gate })),
  });
  const problems = mapProblems(map);
  if (problems.length > 0) throw new Error(`${spec.name}: ${problems.join('; ')}.`);
  return map;
}

function knotHeight(knots: readonly (readonly [number, number])[], x: number): number {
  const after = knots.findIndex(([knotX]) => knotX >= x);
  if (after === -1) return knots[knots.length - 1]?.[1] ?? 46;
  if (after === 0) return knots[0]?.[1] ?? 46;
  const [leftX, leftHeight] = knots[after - 1] as readonly [number, number];
  const [rightX, rightHeight] = knots[after] as readonly [number, number];
  return leftHeight + (rightHeight - leftHeight) * smoothstep((x - leftX) / (rightX - leftX));
}

/** Levels the ground under every runway, pasture and standing target. */
function settle(map: WorldMap): WorldMap {
  const heights = Float64Array.from(map.heights);
  for (const base of map.bases) {
    if (base.carrier !== undefined) continue;
    const { left, right } = runwaySpan(base);
    flatten(heights, left - 4, right + 4, 14);
  }
  for (const ox of map.oxen) {
    const { left, right } = pastureSpan(ox);
    flatten(heights, left, right, 10);
  }
  for (const target of map.targets) {
    if (target.drivesTo !== undefined) continue;
    const { left, right } = targetSpan(target);
    flatten(heights, left - 3, right + 3, 8);
  }
  return { ...map, heights: [...heights] };
}

/** Beaches ease the land down to the water over this far; cliffs stand at least this high over it. */
const BEACH_WIDTH = 48;
const CLIFF_HEIGHT = 22;
const CLIFF_SHOULDER = 40;

/**
 * Lays the sea over the land: every water column at the sea level, the
 * land beside it never lower than the water, beaches sloping down into it
 * and cliffs standing tall over it.
 */
function flood(heights: Float64Array, sea: Sea) {
  const { level } = sea;
  const wet = (x: number) => sea.spans.some((span) => x >= span.left && x <= span.right);
  for (let x = 0; x < heights.length; x++) {
    heights[x] = wet(x) ? level : Math.max(level + 1, heights[x] as number);
  }
  for (const span of sea.spans) {
    const edges = [
      { edge: Math.round(span.left), outward: -1, shore: span.shores[0] },
      { edge: Math.round(span.right), outward: 1, shore: span.shores[1] },
    ];
    for (const { edge, outward, shore } of edges) {
      for (let distance = 1; distance <= Math.max(BEACH_WIDTH, CLIFF_SHOULDER); distance++) {
        const x = edge + outward * distance;
        if (x < 0 || x >= heights.length || wet(x)) continue;
        const land = heights[x] as number;
        if (shore === 'beach' && distance <= BEACH_WIDTH) {
          heights[x] = level + 1 + (land - level - 1) * smoothstep(distance / BEACH_WIDTH);
        } else if (shore === 'cliff' && distance <= CLIFF_SHOULDER) {
          const lift = CLIFF_HEIGHT * smoothstep(1 - (distance - 1) / CLIFF_SHOULDER);
          heights[x] = Math.max(land, level + lift);
        }
      }
    }
  }
}

/** Rolling farmland: a few layers of smooth noise, some broad hills, mountains at both ends. */
function rollingGround(rng: Rng, width: number): Float64Array {
  const heights = new Float64Array(width).fill(46);
  const layers: [wavelength: number, amplitude: number][] = [
    [640, 26],
    [240, 13],
    [90, 5],
    [32, 1.6],
  ];
  for (const [wavelength, amplitude] of layers) addNoise(rng, heights, wavelength, amplitude);

  const hills = rng.int(3, 5);
  for (let index = 0; index < hills; index++) {
    const centre = rng.float(EDGE_WIDTH + 80, width - EDGE_WIDTH - 80);
    addBump(heights, centre, rng.float(60, 170), rng.float(18, 48));
  }
  wallIn(heights);
  return heights;
}

/** Keeps the land between the floor and the headroom, and raises mountains at both ends. */
function wallIn(heights: Float64Array) {
  const width = heights.length;
  for (let x = 0; x < width; x++) {
    const ground = Math.min(CEILING - HEADROOM - 4, Math.max(LOWEST_GROUND, heights[x] as number));
    const fromEdge = Math.min(x, width - 1 - x);
    if (fromEdge >= EDGE_WIDTH) {
      heights[x] = ground;
      continue;
    }
    const rise = smoothstep(1 - fromEdge / EDGE_WIDTH);
    heights[x] = ground + (CEILING + 60 - ground) * rise;
  }
}

function addNoise(rng: Rng, heights: Float64Array, wavelength: number, amplitude: number) {
  const knots = Array.from({ length: Math.ceil(heights.length / wavelength) + 2 }, () =>
    rng.float(-1, 1),
  );
  for (let x = 0; x < heights.length; x++) {
    const position = x / wavelength;
    const index = Math.floor(position);
    const low = knots[index] as number;
    const high = knots[index + 1] as number;
    heights[x] =
      (heights[x] as number) + (low + (high - low) * smoothstep(position - index)) * amplitude;
  }
}

function addBump(heights: Float64Array, centre: number, radius: number, height: number) {
  const from = Math.max(0, Math.floor(centre - radius));
  const to = Math.min(heights.length - 1, Math.ceil(centre + radius));
  for (let x = from; x <= to; x++) {
    const t = (x - centre) / radius;
    const shape = 1 - t * t;
    if (shape > 0) heights[x] = (heights[x] as number) + height * shape * shape;
  }
}

/**
 * Levels the ground between two x positions to their average, easing the
 * shoulders back into the land over `shoulder` units on each side.
 */
function flatten(heights: Float64Array, fromX: number, toX: number, shoulder: number) {
  const left = Math.max(0, Math.round(fromX));
  const right = Math.min(heights.length - 1, Math.round(toX));
  let sum = 0;
  for (let x = left; x <= right; x++) sum += heights[x] as number;
  const level = Math.round(sum / (right - left + 1));
  for (let x = left - shoulder; x <= right + shoulder; x++) {
    if (x < 0 || x >= heights.length) continue;
    if (x >= left && x <= right) {
      heights[x] = level;
      continue;
    }
    const distance = x < left ? left - x : x - right;
    const blend = smoothstep(1 - distance / (shoulder + 1));
    heights[x] = (heights[x] as number) + (level - (heights[x] as number)) * blend;
  }
}

/**
 * Three of the player's own targets behind home, then seventeen enemy
 * targets spread evenly over the ground that is left, kept clear of
 * runways, pastures and each other.
 */
function placeClassicTargets(
  rng: Rng,
  width: number,
  bases: BaseSite[],
  oxen: number[],
): TargetSite[] {
  const home = bases[0] as BaseSite;
  const kinds = shuffledKinds(rng, [6, 5, 4, 5]);
  const scale = width / CLASSIC_WORLD_WIDTH;
  // The two nearest stand just behind the runway whatever the width; the third scales with the world.
  const ownOffsets = [Math.round(-330 * scale), -96, -64];
  const targets: TargetSite[] = ownOffsets.map((offset, index) => ({
    kind: kinds[index] as TargetKind,
    side: 0,
    x: home.x - home.facing * RUNWAY_BACK + offset,
  }));

  const blocked: Span[] = [
    { left: 0, right: EDGE_WIDTH + 30 },
    { left: width - EDGE_WIDTH - 30, right: width },
    { left: (targets[0] as TargetSite).x - 110 * scale, right: home.x + 160 * scale },
    ...bases.map((base) => {
      const { left, right } = runwaySpan(base);
      return { left: left - 36, right: right + 36 };
    }),
    ...oxen.map((ox) => ({ left: ox - 30, right: ox + 30 })),
  ];
  const enemyKinds = kinds.slice(OWN_TARGETS);
  targets.push(...spreadTargets(rng, freeStretches(width, blocked), enemyKinds, 1));
  return targets;
}

/** Ten targets on each side's half, kept back from the middle where the oxen graze. */
function placeVersusTargets(
  rng: Rng,
  width: number,
  bases: BaseSite[],
  oxen: number[],
): TargetSite[] {
  const middle = width / 2;
  const blockedAround = [
    ...bases.map((base) => {
      const { left, right } = runwaySpan(base);
      return { left: left - 36, right: right + 36 };
    }),
    ...oxen.map((ox) => ({ left: ox - 30, right: ox + 30 })),
  ];
  const half = (side: Side): TargetSite[] => {
    const blocked: Span[] = [
      ...blockedAround,
      side === 0 ? { left: middle - 90, right: width } : { left: 0, right: middle + 90 },
      { left: 0, right: EDGE_WIDTH + 30 },
      { left: width - EDGE_WIDTH - 30, right: width },
    ];
    return spreadTargets(
      rng,
      freeStretches(width, blocked),
      shuffledKinds(rng, [3, 2, 2, 3]),
      side,
    );
  };
  return [...half(0), ...half(1)];
}

/** Lays targets out evenly along the free stretches, each nudged a little at random. */
function spreadTargets(
  rng: Rng,
  free: Span[],
  kinds: readonly TargetKind[],
  side: Side,
): TargetSite[] {
  const total = free.reduce((sum, stretch) => sum + (stretch.right - stretch.left), 0);
  const spacing = total / kinds.length;
  return kinds.map((kind, index) => {
    const along = spacing * (index + 0.5) + rng.float(-0.28, 0.28) * spacing;
    return { kind, side, x: Math.round(pointAlong(free, along)) };
  });
}

/** Hangars, factories, depots and tanks in these numbers, shuffled. */
function shuffledKinds(rng: Rng, counts: readonly [number, number, number, number]): TargetKind[] {
  const kinds = TARGET_KINDS.flatMap((kind, index) =>
    Array<TargetKind>(counts[index] ?? 0).fill(kind),
  );
  for (let index = kinds.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [kinds[index], kinds[other]] = [kinds[other] as TargetKind, kinds[index] as TargetKind];
  }
  return kinds;
}

function freeStretches(width: number, blocked: Span[]): Span[] {
  const sorted = [...blocked].sort((a, b) => a.left - b.left);
  const free: Span[] = [];
  let cursor = 0;
  for (const block of sorted) {
    if (block.left > cursor + 24) free.push({ left: cursor + 12, right: block.left - 12 });
    cursor = Math.max(cursor, block.right);
  }
  if (width - cursor > 24) free.push({ left: cursor + 12, right: width - 12 });
  return free;
}

function pointAlong(stretches: Span[], distance: number): number {
  let remaining = Math.max(0, distance);
  for (const stretch of stretches) {
    const length = stretch.right - stretch.left;
    if (remaining <= length) return stretch.left + remaining;
    remaining -= length;
  }
  const last = stretches[stretches.length - 1];
  return last ? last.right : 0;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Why a map would be unfair, or nothing. Every generated and hand-made map
 * passes this: flat runways with room to climb out, every target standing
 * on level ground with open sky above it, nothing crowding anything else.
 */
export function mapProblems(map: WorldMap): string[] {
  const problems: string[] = [];
  const { heights, width } = map;
  const height = (x: number) => heights[Math.min(width - 1, Math.max(0, Math.round(x)))] as number;

  if (heights.length !== width) problems.push('the ground does not span the world');
  if (heights.some((value) => !Number.isFinite(value))) problems.push('the ground has holes');
  if (height(0) < CEILING || height(width - 1) < CEILING) {
    problems.push('the world is open at an end');
  }
  for (let x = EDGE_WIDTH; x < width - EDGE_WIDTH; x++) {
    if (height(x) > CEILING - HEADROOM) {
      problems.push(`the ground at ${x} leaves too little room to fly over`);
      break;
    }
  }

  const sides = new Set(map.bases.map((base) => base.side));
  if (!sides.has(0) || !sides.has(1)) problems.push('both sides need an airfield');
  for (const base of map.bases) {
    if (base.carrier !== undefined) {
      const ship = map.fleet[base.carrier];
      if (!ship || ship.kind !== 'carrier' || ship.side !== base.side)
        problems.push(`the deck at ${base.x} is not one of its side's carriers`);
      continue;
    }
    const { left, right } = runwaySpan(base);
    if (isWaterAt(map, left) || isWaterAt(map, right) || isWaterAt(map, base.x))
      problems.push(`the runway at ${base.x} is in the sea`);
    if (!isLevel(heights, left, right)) problems.push(`the runway at ${base.x} is not level`);
    // Taking off at the slowest speed, a plane must be able to climb away gently.
    const runway = height(base.x);
    for (let ahead = 0; ahead <= 160; ahead += 4) {
      const x = base.x + base.facing * (RUNWAY_LENGTH + ahead);
      if (height(x) > runway + 4 + ahead * 0.3) {
        problems.push(`the climb out of the airfield at ${base.x} runs into a hill`);
        break;
      }
    }
  }

  const expected = TARGET_COUNTS[map.layout];
  const ownTargets = map.targets.filter((target) => target.side === 0);
  if (expected && map.targets.length !== expected.total) {
    problems.push(`there must be ${expected.total} targets`);
  }
  if (expected && ownTargets.length !== expected.own) {
    problems.push(`the first side must have ${expected.own} targets`);
  }

  const footprints = [
    ...map.targets.map(targetSpan),
    ...map.bases.filter((base) => base.carrier === undefined).map(runwaySpan),
    ...map.oxen.map(pastureSpan),
  ];
  for (const target of map.targets) {
    const { left, right } = targetSpan(target);
    const route = {
      left: Math.min(left, target.drivesTo ?? left),
      right: Math.max(right, target.drivesTo ?? right),
    };
    if (route.left < EDGE_WIDTH || route.right > width - EDGE_WIDTH) {
      problems.push(`the ${target.kind} at ${target.x} is in the mountains`);
      continue;
    }
    if (isWaterAt(map, route.left) || isWaterAt(map, route.right) || isWaterAt(map, target.x))
      problems.push(`the ${target.kind} at ${target.x} is in the sea`);
    // A lorry on the move only has to stay out of the mountains.
    if (target.drivesTo !== undefined) continue;
    if (!isLevel(heights, left, right))
      problems.push(`the ${target.kind} at ${target.x} is on a slope`);
    // Open sky: nothing nearby towers over it, so bombs and guns can reach it.
    const ground = height(target.x);
    if (highest(heights, target.x - 40, target.x + 40) > ground + 36) {
      problems.push(`the ${target.kind} at ${target.x} is hidden in a ravine`);
    }
  }
  footprints.forEach((first, index) => {
    for (const second of footprints.slice(index + 1)) {
      if (first.left < second.right + 10 && second.left < first.right + 10) {
        problems.push(`two things crowd each other near ${Math.round(first.left)}`);
      }
    }
  });
  for (const ox of map.oxen) {
    if (isWaterAt(map, ox)) problems.push(`the ox at ${ox} is swimming`);
    else if (!isLevel(heights, ox - 8, ox + 8))
      problems.push(`the ox at ${ox} cannot graze on a slope`);
  }
  problems.push(...seaProblems(map), ...gateProblems(map));
  for (const bank of map.fog) {
    if (bank.left >= bank.right || bank.top <= 0) problems.push('a fog bank is empty');
  }
  return problems;
}

/** The sea inside the mountains, and every ship in it with room to steam and turn. */
function seaProblems(map: WorldMap): string[] {
  const problems: string[] = [];
  const spans = map.sea?.spans ?? [];
  for (const span of spans) {
    if (span.left >= span.right) problems.push('a stretch of sea is empty');
    if (span.left < EDGE_WIDTH || span.right > map.width - EDGE_WIDTH)
      problems.push(`the sea at ${span.left} runs into the mountains`);
  }
  const spanOf = (x: number) => spans.find((span) => x >= span.left && x <= span.right);
  for (const ship of map.fleet) {
    const half = SHIP_CLASSES[ship.kind].length / 2;
    const water = spanOf(ship.x);
    if (!water) {
      problems.push(`the ${ship.kind} at ${ship.x} is aground`);
      continue;
    }
    const reach = [ship.x, ...(ship.patrol ? [ship.patrol.left, ship.patrol.right] : [])];
    if (ship.bound !== undefined) reach.push(ship.bound);
    for (const x of reach) {
      if (x - half < water.left || x + half > water.right)
        problems.push(`the ${ship.kind} at ${ship.x} would run aground at ${x}`);
    }
  }
  for (const raid of map.raids) {
    if (!map.fleet[raid.target]) problems.push(`a raid at move ${raid.at} has no ship to attack`);
  }
  for (const ship of map.fleet.filter((candidate) => candidate.kind === 'carrier')) {
    const left = ship.patrol?.left ?? ship.x;
    const right = ship.patrol?.right ?? ship.x;
    if (left < EDGE_WIDTH + LAUNCH_ROOM || right > map.width - EDGE_WIDTH - LAUNCH_ROOM)
      problems.push(`the carrier at ${ship.x} would launch its planes into the mountains`);
  }
  return problems;
}

function gateProblems(map: WorldMap): string[] {
  return map.gates.flatMap((gate) => {
    const problems: string[] = [];
    if (gate.x < EDGE_WIDTH || gate.x > map.width - EDGE_WIDTH)
      problems.push(`the gate at ${gate.x} is in the mountains`);
    const ground = map.heights[Math.round(gate.x)] ?? 0;
    if (gate.top - gate.bottom < 12) problems.push(`the gate at ${gate.x} is too narrow`);
    if (gate.bottom < ground + 4 || gate.top > CEILING - 10)
      problems.push(`the gate at ${gate.x} cannot be flown through`);
    return problems;
  });
}

function isLevel(heights: readonly number[], fromX: number, toX: number): boolean {
  const left = Math.max(0, Math.round(fromX));
  const right = Math.min(heights.length - 1, Math.round(toX));
  let low = Infinity;
  let high = -Infinity;
  for (let x = left; x <= right; x++) {
    low = Math.min(low, heights[x] as number);
    high = Math.max(high, heights[x] as number);
  }
  return high - low <= 0.5;
}

function highest(heights: readonly number[], fromX: number, toX: number): number {
  let top = -Infinity;
  for (
    let x = Math.max(0, Math.round(fromX));
    x <= Math.min(heights.length - 1, Math.round(toX));
    x++
  ) {
    top = Math.max(top, heights[x] as number);
  }
  return top;
}
