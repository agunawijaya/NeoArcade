/**
 * The road itself: two lanes, except on three-lane stretches; mud patches;
 * signs that announce what is coming; and, for runs with an end, a finish
 * line. Positions are road metres from the start of the run.
 */
export type LaneCount = 2 | 3;

export interface LaneStretch {
  /** The road is three lanes wide from here… */
  from: number;
  /** …until here, where the middle lane merges right. */
  to: number;
}

export interface MudPatch {
  from: number;
  to: number;
  /** Lanes covered, in the lane numbering of that stretch. */
  lanes: readonly number[];
}

export type SignKind = 'pairs' | 'mud' | 'wobblers' | 'three-lanes' | 'herd' | 'carrots' | 'boss';

export interface RoadSign {
  at: number;
  kind: SignKind;
}

export interface Road {
  stretches: LaneStretch[];
  mud: MudPatch[];
  signs: RoadSign[];
  finish: number | null;
}

/** The road narrows and widens over this distance, before the stretch begins or ends. */
export const TRANSITION_LENGTH = 7;

export function createRoad(finish: number | null = null): Road {
  return { stretches: [], mud: [], signs: [], finish };
}

export function lanesAt(road: Road, position: number): LaneCount {
  return road.stretches.some((stretch) => position >= stretch.from && position < stretch.to)
    ? 3
    : 2;
}

export function isMuddy(road: Road, position: number, lane: number): boolean {
  return road.mud.some(
    (patch) => position >= patch.from && position < patch.to && patch.lanes.includes(lane),
  );
}

/** One press moves one lane to the right, and from the rightmost lane back to the leftmost. */
export function nextLane(lane: number, lanes: LaneCount): number {
  return (lane + 1) % lanes;
}

/** Presses needed to get from one lane to another. */
export function pressesBetween(from: number, to: number, lanes: LaneCount): number {
  return (to - from + lanes) % lanes;
}

/**
 * Where a car keeps driving when the lane count changes under it: the outer
 * lanes stay outer lanes, and the middle lane merges right.
 */
export function remapLane(lane: number, from: LaneCount, to: LaneCount): number {
  if (from === to) return lane;
  if (from === 2) return lane === 0 ? 0 : 2;
  return lane === 0 ? 0 : 1;
}

/** A lane's centre in lane widths from the middle of the road. */
export function laneCentre(lane: number, lanes: LaneCount): number {
  return lane - (lanes - 1) / 2;
}

/**
 * Where something in `lane` sits across the road at `position`, in lane
 * widths from the middle, easing through the widening and narrowing so the
 * views can draw the road changing shape smoothly.
 */
export function lateralAt(road: Road, position: number, lane: number): number {
  const lanes = lanesAt(road, position);
  const here = laneCentre(lane, lanes);
  const blend = transitionBlend(road, position);
  if (blend === 0) return here;
  const other: LaneCount = lanes === 2 ? 3 : 2;
  const there = laneCentre(remapLane(lane, lanes, other), other);
  return here + (there - here) * smooth(blend);
}

/** Half the road's width in lane widths at `position`, easing through transitions. */
export function halfWidthAt(road: Road, position: number): number {
  const lanes = lanesAt(road, position);
  const here = lanes / 2;
  const there = lanes === 2 ? 1.5 : 1;
  return here + (there - here) * smooth(transitionBlend(road, position));
}

/**
 * How far into a transition `position` is: 0 on a steady stretch, rising to 1
 * at the point where the lane count changes.
 */
function transitionBlend(road: Road, position: number): number {
  let blend = 0;
  for (const { from, to } of road.stretches) {
    for (const edge of [from, to]) {
      const ahead = edge - position;
      if (ahead > 0 && ahead <= TRANSITION_LENGTH) {
        blend = Math.max(blend, 1 - ahead / TRANSITION_LENGTH);
      }
    }
  }
  return blend;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Drops everything the car has left far behind. */
export function pruneRoad(road: Road, behind: number) {
  road.stretches = road.stretches.filter((stretch) => stretch.to > behind);
  road.mud = road.mud.filter((patch) => patch.to > behind);
  road.signs = road.signs.filter((sign) => sign.at > behind);
}
