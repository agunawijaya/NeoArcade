import { createRng, type Rng } from '@shared/rng';
import { EDGE_WIDTH, isWaterAt, runwaySpan, targetSpan, type WorldMap } from '../engine/map';
import type { ThemeId } from '../themes';
import { buildClouds, type Cloud } from './clouds';

/**
 * The countryside around the battle: everything that is only there to be
 * looked at. It is laid out once per map from the map's seed, so both
 * views put the same poplar at the same spot, and nothing ever stands
 * where it could hide a target, an ox or a runway.
 */
export type PropKind =
  | 'poplar'
  | 'oak'
  | 'bush'
  | 'farmhouse'
  | 'barn'
  | 'church'
  | 'windmill'
  | 'haystack'
  | 'fence'
  | 'stump'
  | 'wire'
  | 'tent'
  | 'windsock'
  | 'balloon'
  | 'sign'
  | 'marquee'
  | 'grandstand'
  | 'bunting'
  | 'ferris';

export interface Prop {
  kind: PropKind;
  x: number;
  /** 0 on the line of play, up to 1 at the back of the near ground; a little higher and hazier the further back. */
  depth: number;
  scale: number;
  /** Faces left (−1) or right (1). */
  facing: 1 | -1;
  /** Picks small differences: roof shape, tree shape, which window is lit. */
  variant: number;
}

/** Where the trenches run (or, at the Airshow, the crowd stands): between two airfields of different sides. */
export interface Front {
  left: number;
  right: number;
}

export interface Scenery {
  theme: ThemeId;
  props: Prop[];
  fronts: Front[];
  clouds: Cloud[];
  /** Hills behind the field, as heights every 8 units, for the parallax layers. */
  midHills: Float64Array;
  farHills: Float64Array;
}

const HILL_STEP = 8;

/**
 * The Great War has trenches, wire and kite balloons along its fronts;
 * Cyan vs Magenta has signposts and cartoon blimps; the Airshow turns each
 * front into a showground with marquees, grandstands and a big wheel.
 */
export function buildScenery(map: WorldMap, theme: ThemeId = 'great-war'): Scenery {
  const rng = createRng(`mind-the-ox:scenery:${map.seed}`);
  const keepClear = clearZones(map);
  const fronts = frontLines(map);
  const props: Prop[] = [];
  // Nothing stands in the sea, nor right at its edge.
  const ashore = (x: number, margin: number) =>
    !isWaterAt(map, x - margin - 6) && !isWaterAt(map, x) && !isWaterAt(map, x + margin + 6);
  const isFree = (x: number, margin: number) =>
    x > EDGE_WIDTH &&
    x < map.width - EDGE_WIDTH &&
    ashore(x, margin) &&
    !keepClear.some((zone) => x > zone.left - margin && x < zone.right + margin);
  const inFront = (x: number) => fronts.some((front) => x > front.left && x < front.right);

  for (const base of map.bases) {
    if (base.carrier !== undefined) continue;
    const { left, right } = runwaySpan(base);
    const behind = base.facing === 1 ? left - 16 : right + 16;
    props.push({
      kind: 'tent',
      x: behind,
      depth: 0.55,
      scale: 1,
      facing: base.facing,
      variant: base.side,
    });
    props.push({
      kind: 'windsock',
      x: base.facing === 1 ? right + 10 : left - 10,
      depth: 0.2,
      scale: 1,
      facing: 1,
      variant: 0,
    });
  }

  for (let x = EDGE_WIDTH + 20; x < map.width - EDGE_WIDTH - 20; x += rng.float(14, 30)) {
    if (inFront(x)) {
      if (theme === 'airshow') placeShowgroundProp(rng, props, x, isFree);
      else placeFrontProp(rng, props, x, isFree, theme);
      continue;
    }
    placeFarmProp(rng, props, x, isFree, ashore);
  }
  placeVillages(rng, props, map, isFree, inFront, ashore);
  placeBalloons(rng, props, fronts);

  if (theme === 'airshow') placeBigWheels(rng, props, fronts);
  props.sort((a, b) => b.depth - a.depth || a.x - b.x);
  return {
    theme,
    props,
    fronts,
    clouds: buildClouds(map.seed, map.width),
    midHills: hills(rng, map.width, 0.5, 58, 22),
    farHills: hills(rng, map.width, 0.25, 74, 34),
  };
}

function clearZones(map: WorldMap) {
  return [
    ...map.targets.map(targetSpan),
    ...map.bases.filter((base) => base.carrier === undefined).map(runwaySpan),
    ...map.oxen.map((ox) => ({ left: ox - 12, right: ox + 12 })),
  ];
}

/** Between each enemy airfield and the next friendly one lies a front. */
function frontLines(map: WorldMap): Front[] {
  const bases = map.bases.filter((base) => base.carrier === undefined).sort((a, b) => a.x - b.x);
  const fronts: Front[] = [];
  for (let index = 0; index + 1 < bases.length; index++) {
    const first = bases[index];
    const second = bases[index + 1];
    if (!first || !second || first.side === second.side) continue;
    const middle = (first.x + second.x) / 2;
    fronts.push({ left: middle - 70, right: middle + 70 });
  }
  return fronts;
}

function placeFrontProp(
  rng: Rng,
  props: Prop[],
  x: number,
  isFree: (x: number, margin: number) => boolean,
  theme: ThemeId,
) {
  const roll = rng.next();
  if (roll < 0.35) props.push(prop('stump', x, rng.float(0.1, 0.9), rng.float(0.7, 1.2), rng));
  else if (roll < 0.7 && isFree(x, 6))
    props.push(prop(theme === 'great-war' ? 'wire' : 'sign', x, rng.float(0, 0.3), 1, rng));
}

/** Along the Airshow's crowd line: marquees, grandstands and bunting. */
function placeShowgroundProp(
  rng: Rng,
  props: Prop[],
  x: number,
  isFree: (x: number, margin: number) => boolean,
) {
  const roll = rng.next();
  if (roll < 0.3) props.push(prop('marquee', x, rng.float(0.5, 0.9), rng.float(0.9, 1.15), rng));
  else if (roll < 0.5) props.push(prop('grandstand', x, rng.float(0.6, 0.95), 1, rng));
  else if (roll < 0.85 && isFree(x, 6))
    props.push(prop('bunting', x, rng.float(0.05, 0.3), 1, rng));
}

/** A big wheel behind each showground, lit up at night. */
function placeBigWheels(rng: Rng, props: Prop[], fronts: Front[]) {
  for (const front of fronts) props.push(prop('ferris', (front.left + front.right) / 2, 1, 1, rng));
}

function placeFarmProp(
  rng: Rng,
  props: Prop[],
  x: number,
  isFree: (x: number, margin: number) => boolean,
  ashore: (x: number, margin: number) => boolean,
) {
  const depth = rng.float(0.15, 1);
  // Only low things may stand close to the line of play.
  const roll = rng.next();
  if (depth < 0.35) {
    if (!isFree(x, 10)) return;
    if (roll < 0.35) props.push(prop('bush', x, depth, rng.float(0.6, 1.1), rng));
    else if (roll < 0.6) props.push(prop('fence', x, depth, 1, rng));
    else if (roll < 0.72) props.push(prop('haystack', x, depth, rng.float(0.8, 1.1), rng));
    return;
  }
  // Trees further back may stand anywhere on land, but not out at sea.
  if (!ashore(x, 0)) return;
  if (roll < 0.4) props.push(prop('poplar', x, depth, rng.float(0.8, 1.25), rng));
  else if (roll < 0.75) props.push(prop('oak', x, depth, rng.float(0.75, 1.2), rng));
  else if (roll < 0.85) props.push(prop('bush', x, depth, rng.float(0.8, 1.2), rng));
  else if (roll < 0.9) props.push(prop('haystack', x, depth, 1, rng));
}

function placeVillages(
  rng: Rng,
  props: Prop[],
  map: WorldMap,
  isFree: (x: number, margin: number) => boolean,
  inFront: (x: number) => boolean,
  ashore: (x: number, margin: number) => boolean,
) {
  const villages = rng.int(4, 6);
  for (let index = 0; index < villages; index++) {
    const centre = rng.float(EDGE_WIDTH + 60, map.width - EDGE_WIDTH - 60);
    if (inFront(centre) || !ashore(centre, 30)) continue;
    const houses = rng.int(2, 4);
    for (let house = 0; house < houses; house++) {
      const x = centre + (house - houses / 2) * rng.float(14, 20);
      if (!isFree(x, 4)) continue;
      props.push(
        prop(
          rng.chance(0.25) ? 'barn' : 'farmhouse',
          x,
          rng.float(0.5, 0.95),
          rng.float(0.85, 1.1),
          rng,
        ),
      );
    }
    if (rng.chance(0.6)) props.push(prop('church', centre + rng.float(-10, 10), 0.97, 1, rng));
    else if (rng.chance(0.5)) props.push(prop('windmill', centre + rng.float(20, 40), 0.9, 1, rng));
  }
}

/** Observation balloons hang over the lines, tethered far behind the field. */
function placeBalloons(rng: Rng, props: Prop[], fronts: Front[]) {
  for (const front of fronts) {
    if (!rng.chance(0.75)) continue;
    props.push(prop('balloon', front.left + rng.float(-120, -60), 1, 1, rng));
  }
}

function prop(kind: PropKind, x: number, depth: number, scale: number, rng: Rng): Prop {
  return { kind, x, depth, scale, facing: rng.chance(0.5) ? 1 : -1, variant: rng.int(0, 7) };
}

/** A rolling skyline for a parallax layer, wide enough for its slower scroll. */
function hills(
  rng: Rng,
  width: number,
  parallax: number,
  base: number,
  amplitude: number,
): Float64Array {
  const samples = Math.ceil((width * parallax + 4000) / HILL_STEP);
  const knots = Array.from({ length: Math.ceil(samples / 12) + 2 }, () => rng.float(0, 1));
  const fine = Array.from({ length: Math.ceil(samples / 3) + 2 }, () => rng.float(-1, 1));
  const heights = new Float64Array(samples);
  for (let index = 0; index < samples; index++) {
    heights[index] =
      base + amplitude * smoothSample(knots, index / 12) + 4 * smoothSample(fine, index / 3);
  }
  return heights;
}

function smoothSample(values: number[], position: number): number {
  const index = Math.floor(position);
  const t = position - index;
  const eased = t * t * (3 - 2 * t);
  const low = values[index] ?? 0;
  const high = values[index + 1] ?? low;
  return low + (high - low) * eased;
}

export function hillHeightAt(hills: Float64Array, x: number): number {
  const position = Math.max(0, x / HILL_STEP);
  const index = Math.floor(position);
  const t = position - index;
  const low = hills[Math.min(hills.length - 1, index)] ?? 0;
  const high = hills[Math.min(hills.length - 1, index + 1)] ?? low;
  return low + (high - low) * t;
}
