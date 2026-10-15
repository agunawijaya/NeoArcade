/**
 * The road itself. Lanes are fixed positions across a band four lanes wide,
 * W X Y Z from the left (numbered 0 to 3). The road is open on two or three
 * neighbouring positions at a time, and that open set slides sideways now and
 * then: a new lane opens on one side, and a little later a lane on the other
 * side ends at a barrier. Lanes never move; the road moves across them. Mud
 * patches, signs and a finish line sit on top. Positions along the road are
 * metres from the start of the run.
 */
export const LANE_POSITIONS = 4;
export const LANE_NAMES = ['W', 'X', 'Y', 'Z'] as const;

export type LaneCount = 2 | 3;

/** The open lanes: `count` neighbouring positions starting at `first`. */
export interface Layout {
  first: number;
  count: LaneCount;
}

/**
 * One step in the road's shape. From `at` on, the road has its new layout:
 * the lane in `opens` can be entered, and the lane in `closes` can no longer
 * be entered. A car still in the closing lane may drive on in it as far as its
 * barrier, and hits the barrier if it gets there.
 */
export interface LaneChange {
  at: number;
  layout: Layout;
  opens: number | null;
  closes: number | null;
  /** Null until the planner has placed it. */
  barrier: number | null;
}

export interface MudPatch {
  from: number;
  to: number;
  lanes: readonly number[];
}

export type SignKind =
  'pairs' | 'mud' | 'wobblers' | 'three-lanes' | 'herd' | 'carrots' | 'boss' | 'shift';

export interface RoadSign {
  at: number;
  kind: SignKind;
}

export interface Road {
  /** The layout before the first change. */
  start: Layout;
  /** In order along the road; each one is over before the next begins. */
  changes: LaneChange[];
  mud: MudPatch[];
  signs: RoadSign[];
  finish: number | null;
}

/** Two lanes in the middle of the band, X and Y, where every road starts. */
export const MIDDLE_TWO: Layout = { first: 1, count: 2 };

/** A new lane fades in over this distance before it opens; a closed one fades out after its barrier. */
export const TAPER_LENGTH = 10;

export function createRoad(finish: number | null = null, start: Layout = MIDDLE_TWO): Road {
  return { start, changes: [], mud: [], signs: [], finish };
}

export function lanesOf(layout: Layout): number[] {
  return Array.from({ length: layout.count }, (_, index) => layout.first + index);
}

export function inLayout(layout: Layout, lane: number): boolean {
  return lane >= layout.first && lane < layout.first + layout.count;
}

/** The last change at or before `position`. */
export function changeAt(road: Road, position: number): LaneChange | null {
  let found: LaneChange | null = null;
  for (const change of road.changes) {
    if (change.at > position) break;
    found = change;
  }
  return found;
}

export function layoutAt(road: Road, position: number): Layout {
  return changeAt(road, position)?.layout ?? road.start;
}

/** The lane that is closing at `position`: out of the layout, but not yet at its barrier. */
export function closingLaneAt(road: Road, position: number): number | null {
  const change = changeAt(road, position);
  if (!change || change.closes === null) return null;
  return change.barrier === null || position < change.barrier ? change.closes : null;
}

/** Lanes a car can be in at `position`: the open ones and any closing one. */
export function pavedLanes(road: Road, position: number): number[] {
  const lanes = lanesOf(layoutAt(road, position));
  const closing = closingLaneAt(road, position);
  if (closing !== null) lanes.push(closing);
  return lanes.sort((a, b) => a - b);
}

export function isPaved(road: Road, position: number, lane: number): boolean {
  return inLayout(layoutAt(road, position), lane) || closingLaneAt(road, position) === lane;
}

/**
 * The one-button rule. A press moves one open lane to the right, and from the
 * rightmost back round to the leftmost; with two lanes that is simply the
 * other one. From a closing lane, a press merges into the open lane beside it.
 */
export function pressTarget(road: Road, position: number, lane: number): number {
  const layout = layoutAt(road, position);
  if (!inLayout(layout, lane)) return lane < layout.first ? layout.first : lastLane(layout);
  return lane === lastLane(layout) ? layout.first : lane + 1;
}

/**
 * The two-button rule, for Rival Driver: one lane left or right, staying on
 * open lanes. Out of a closing lane only the way into the road works.
 */
export function stepTarget(
  road: Road,
  position: number,
  lane: number,
  direction: -1 | 1,
): number | null {
  const target = lane + direction;
  return inLayout(layoutAt(road, position), target) ? target : null;
}

/** Where a car in a closing lane goes when it is pushed out: the open lane beside it. */
export function mergeTarget(road: Road, position: number, lane: number): number {
  const layout = layoutAt(road, position);
  if (inLayout(layout, lane)) return lane;
  return lane < layout.first ? layout.first : lastLane(layout);
}

function lastLane(layout: Layout): number {
  return layout.first + layout.count - 1;
}

export function isMuddy(road: Road, position: number, lane: number): boolean {
  return road.mud.some(
    (patch) => position >= patch.from && position < patch.to && patch.lanes.includes(lane),
  );
}

/** A lane's centre in lane widths from the middle of the band. */
export function laneLateral(lane: number): number {
  return lane - (LANE_POSITIONS - 1) / 2;
}

/**
 * The paved road's two edges at `position`, in lane widths from the middle of
 * the band. A lane about to open widens in over TAPER_LENGTH, and a lane that
 * has ended narrows away behind its barrier, so the views can draw the road
 * swinging smoothly from side to side.
 */
export function edgesAt(road: Road, position: number): { left: number; right: number } {
  const paved = pavedLanes(road, position);
  const first = paved[0] as number;
  const last = paved.at(-1) as number;
  let left = laneLateral(first) - 0.5;
  let right = laneLateral(last) + 0.5;
  for (const { lane, share } of taperingLanes(road, position)) {
    if (lane < first) left -= share;
    else if (lane > last) right += share;
  }
  return { left, right };
}

/** The middle of the paved road, in lane widths from the middle of the band. */
export function roadCentreAt(road: Road, position: number): number {
  const { left, right } = edgesAt(road, position);
  return (left + right) / 2;
}

/** Lanes partly paved at `position`: one widening in ahead of its opening, or one fading out after its barrier. */
function taperingLanes(road: Road, position: number): { lane: number; share: number }[] {
  const tapers: { lane: number; share: number }[] = [];
  for (const change of road.changes) {
    if (change.opens !== null) {
      const ahead = change.at - position;
      if (ahead > 0 && ahead <= TAPER_LENGTH) {
        tapers.push({ lane: change.opens, share: smooth(1 - ahead / TAPER_LENGTH) });
      }
    }
    if (change.closes !== null && change.barrier !== null) {
      const behind = position - change.barrier;
      if (behind >= 0 && behind < TAPER_LENGTH) {
        tapers.push({ lane: change.closes, share: smooth(1 - behind / TAPER_LENGTH) });
      }
    }
  }
  return tapers;
}

/** Where a change stops shaping the road: its opening, or the end of its closed lane's taper. */
export function endOf(change: LaneChange): number {
  if (change.closes === null) return change.at;
  return (change.barrier ?? Infinity) + TAPER_LENGTH;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Drops everything the car has left far behind. */
export function pruneRoad(road: Road, behind: number) {
  const done = road.changes.filter((change) => endOf(change) < behind);
  const last = done.at(-1);
  if (last) {
    road.start = last.layout;
    road.changes = road.changes.filter((change) => !done.includes(change));
  }
  road.mud = road.mud.filter((patch) => patch.to > behind);
  road.signs = road.signs.filter((sign) => sign.at > behind);
}
