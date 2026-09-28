import { CAR_LENGTH, STEP_SECONDS } from './constants';
import { gapOf, type Drive } from './drive';
import type { Hazard } from './hazards';
import { lanesAt, nextLane, pressesBetween, type LaneCount } from './road';

/**
 * A driver with human limits: it only reacts to what has been in view for
 * `reactionSeconds`, presses at most once every `pressGap` seconds, and waits
 * for a hesitant donkey to commit before trusting its lane. It powers the
 * title screen's demo, proves in the tests that every planned road can be
 * driven, and plays the scripted playtests.
 */
export interface AutopilotOptions {
  reactionSeconds: number;
  pressGap: number;
  /** Stays in a donkey's lane until this many seconds before it would hit, to farm near misses. */
  daring?: number;
  /** Goes for carrots in free lanes. */
  greedy?: boolean;
}

export interface Autopilot {
  /** Whether to press this step. */
  decide(drive: Drive): boolean;
}

export function createAutopilot({
  reactionSeconds,
  pressGap,
  daring = 0,
  greedy = true,
}: AutopilotOptions): Autopilot {
  // A hesitant donkey is noticed twice: when it appears, and again when it settles.
  const noticedAt = new Map<string, number>();
  let lastPress = -Infinity;

  const noticed = (drive: Drive, hazard: Hazard) => {
    if (!hazard.revealed || hazard.passed || hazard.hit || hazard.collected) return false;
    const key = `${hazard.id}:${hazard.committed}`;
    const since = noticedAt.get(key);
    if (since === undefined) {
      noticedAt.set(key, drive.roadTime);
      return false;
    }
    return drive.roadTime - since >= reactionSeconds - STEP_SECONDS / 2;
  };

  return {
    decide(drive) {
      const { car } = drive;
      if (drive.roadTime - lastPress < pressGap || car.heldPresses.length > 0) return false;
      const known = drive.hazards.filter((hazard) => noticed(drive, hazard));
      const donkeys = known.filter((hazard) => hazard.kind === 'donkey' && hazard.committed);
      const target = chooseLane(drive, donkeys, known, daring, greedy);
      if (target === car.lane) return false;
      if (!safeToEnter(drive, donkeys, nextLane(car.lane, car.lanes))) return false;
      lastPress = drive.roadTime;
      return true;
    },
  };
}

/** The lane to head for: free for the next donkeys, as few presses away as possible. */
function chooseLane(
  drive: Drive,
  donkeys: Hazard[],
  known: Hazard[],
  daring: number,
  greedy: boolean,
): number {
  const { car } = drive;
  const lanes = car.lanes;
  const ahead = donkeys
    .filter((donkey) => gapOf(drive, donkey) > 0)
    .sort((a, b) => a.position - b.position);
  const first = ahead[0];
  if (!first) return greedy ? (carrotLane(drive, known) ?? car.lane) : car.lane;

  const row = ahead.filter((donkey) => donkey.position - first.position < 0.5);
  const blocked = new Set(row.map((donkey) => donkey.lane));
  const rowLanes = lanesAt(drive.road, first.position);
  if (rowLanes !== lanes) return car.lane;
  if (!blocked.has(car.lane)) return car.lane;
  // Daring drivers wait for the last moment; everyone else leaves at once.
  if (gapOf(drive, first) / drive.speed > daring + 0.02 && daring > 0) return car.lane;

  const free = [0, 1, 2].slice(0, lanes).filter((lane) => !blocked.has(lane));
  const after = ahead.find((donkey) => donkey.position - first.position >= 0.5);
  return free.sort(
    (a, b) =>
      pressesBetween(car.lane, a, lanes) - pressesBetween(car.lane, b, lanes) ||
      Number(after?.lane === a) - Number(after?.lane === b),
  )[0] as number;
}

function carrotLane(drive: Drive, known: Hazard[]): number | null {
  const carrot = known
    .filter((hazard) => hazard.kind === 'carrot' && gapOf(drive, hazard) > 0)
    .sort((a, b) => a.position - b.position)[0];
  if (!carrot || lanesAt(drive.road, carrot.position) !== drive.car.lanes) return null;
  return carrot.lane;
}

/** Moving into `lane` now must not run into a donkey beside or just ahead of the car. */
function safeToEnter(drive: Drive, donkeys: Hazard[], lane: number): boolean {
  const lanes: LaneCount = drive.car.lanes;
  if (lane >= lanes) return false;
  return donkeys.every((donkey) => {
    if (donkey.lane !== lane) return true;
    const gap = gapOf(drive, donkey);
    const alongside = gap <= drive.speed * 0.06 && gap > -(CAR_LENGTH + donkey.depth);
    return !alongside;
  });
}
