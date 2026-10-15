import { edgesAt, laneLateral, pavedLanes, type LaneChange, type Road } from '../engine/road';

/**
 * The road's shape as every view draws it, worked out from the engine's lane
 * changes: where its edges are, where the lane lines run, and how a lane
 * that is ending is marked. Laterals are in lane widths from the middle of
 * the lane band; positions are road metres.
 */
/** One lane's width on the ground, in metres; every view draws to this scale. */
export const LANE_METRES = 3.5;

/** The orange of the chevrons down a lane that is ending. */
export const LANE_END_PAINT = '#ff9a3c';

export interface RoadSlice {
  left: number;
  right: number;
  /** Lane lines between neighbouring lanes a car may be in. */
  dividers: number[];
}

export function sliceAt(road: Road, position: number): RoadSlice {
  const { left, right } = edgesAt(road, position);
  const lanes = pavedLanes(road, position);
  const dividers = lanes.slice(1).map((lane) => laneLateral(lane) - 0.5);
  return { left, right, dividers };
}

/** Everything that tells a driver a lane is ending, for one lane change. */
export interface LaneEnd {
  change: LaneChange;
  lane: number;
  /** Where it starts closing, and its barrier. */
  from: number;
  to: number;
  /** Which way the traffic has to move: -1 to the left, 1 to the right. */
  merge: -1 | 1;
}

/** The lane ends whose markings fall between two road positions. */
export function laneEndsBetween(road: Road, from: number, to: number): LaneEnd[] {
  const ends: LaneEnd[] = [];
  for (const change of road.changes) {
    if (change.closes === null || change.barrier === null) continue;
    if (change.barrier < from || change.at > to) continue;
    const merge = change.closes < change.layout.first ? 1 : -1;
    ends.push({ change, lane: change.closes, from: change.at, to: change.barrier, merge });
  }
  return ends;
}

/** Chevrons painted down the closing lane, pointing the way to move over. */
export function chevronsOf(end: LaneEnd): number[] {
  const marks: number[] = [];
  for (let along = end.from + 2.5; along < end.to - 1.5; along += 3) marks.push(along);
  return marks;
}

/** Where the merge arrows are painted: once near the start, once close to the barrier. */
export function mergeArrowsOf(end: LaneEnd): number[] {
  const length = end.to - end.from;
  return [end.from + length * 0.32, end.to - Math.min(7, length * 0.3)];
}

/** Cones along the line between the ending lane and the lane it merges into, over its last half. */
export function conesOf(end: LaneEnd): { along: number; lateral: number }[] {
  const line = laneLateral(end.lane) + end.merge * 0.5;
  const cones: { along: number; lateral: number }[] = [];
  const start = end.from + (end.to - end.from) * 0.5;
  for (let along = end.to - 0.4; along > start; along -= 3) {
    cones.push({ along, lateral: line });
  }
  return cones;
}

/** The "lane ends" sign stands just off the road on the ending lane's side, where it starts to close. */
export function laneEndsSign(road: Road, end: LaneEnd): { along: number; side: -1 | 1 } {
  const lanes = pavedLanes(road, end.from);
  const side = end.lane <= (lanes[0] as number) ? -1 : 1;
  return { along: end.from, side };
}

/** A flat shape painted on the road, as [metres along, metres across] corners. */
export type Shape = [number, number][];

/** A chevron across the ending lane, its point towards the lane to move into. */
export function chevronShape(end: LaneEnd, along: number): Shape {
  const centre = laneLateral(end.lane) * LANE_METRES;
  const tip = centre + end.merge * 0.95;
  const tail = centre - end.merge * 0.75;
  const thick = 0.32;
  return [
    [along - 0.9, tail],
    [along, tip],
    [along + 0.9, tail],
    [along + 0.9 - thick, tail],
    [along, tip - end.merge * thick * 1.4],
    [along - 0.9 + thick, tail],
  ];
}

/** An arrow painted in the ending lane, slanting over into the lane beside it. */
export function mergeArrowShape(end: LaneEnd, along: number): Shape {
  const centre = laneLateral(end.lane) * LANE_METRES;
  // Worked out with across pointing towards the merge, then turned the right way round.
  const run = 3.6;
  const rise = 1.3;
  const length = Math.hypot(run, rise);
  const [du, dw] = [run / length, rise / length];
  const corner = (forward: number, aside: number): [number, number] => [
    along - 1.8 + du * forward - dw * aside,
    centre + end.merge * (-0.55 + dw * forward + du * aside),
  ];
  return [
    corner(0, -0.2),
    corner(2.7, -0.2),
    corner(2.7, -0.6),
    corner(3.9, 0),
    corner(2.7, 0.6),
    corner(2.7, 0.2),
    corner(0, 0.2),
  ];
}
