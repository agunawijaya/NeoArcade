import { stepMatch, type Match } from '../src/engine/match';
import { TURN } from '../src/engine/trig';
import { IDLE_CONTROLS, type Controls, type Plane } from '../src/engine/world';

/**
 * What every staged scene is made of: a real match flown with scripted
 * pilots, the plane to follow, where to point the camera, and the light.
 */
export interface Scene {
  match: Match;
  focus: Plane;
  cameraX: number | undefined;
  sun: number | null;
  /** The chapter flies in the dark whatever the light setting. */
  night: boolean;
  /** Sunrise or sunset over the scene: the light setting picks how far along. */
  hour: 'dawn' | 'dusk' | null;
  label: string;
  /** Points added to the panel's score, as if earlier in the game. */
  scoreShown: number;
  /** The mission's objectives as the panel shows them, if the scene is a mission. */
  objective?: string | null;
}

export function place(plane: Plane, x: number, y: number, heading: number, speed: number) {
  plane.state = 'flying';
  plane.x = x;
  plane.y = y;
  plane.heading = heading;
  plane.inverted = heading > TURN / 4 && heading < (3 * TURN) / 4;
  plane.speed = speed;
  plane.throttle = 3;
}

/** Keeps every computer pilot out of the way, so a scene shows only what it means to. */
export function benchComputers(match: Match) {
  for (const plane of match.world.planes) {
    if (plane.pilot.kind === 'cpu')
      plane.pilot = { ...plane.pilot, territory: { left: 0, right: 0 } };
  }
}

/**
 * Runs the match with scripted pilots, one entry per seat; `onTick` sees
 * every tick, for the visuals to collect events from.
 */
export function fly(
  match: Match,
  ticks: number,
  pilots: (tick: number) => Partial<Controls>[],
  onTick: (match: Match) => void,
) {
  for (let tick = 0; tick < ticks; tick++) {
    stepMatch(
      match,
      pilots(tick).map((controls) => ({ ...IDLE_CONTROLS, ...controls })),
    );
    onTick(match);
  }
}

export function base(
  scene: Omit<Scene, 'night' | 'hour' | 'label' | 'scoreShown'>,
  extra: Partial<Scene> = {},
): Scene {
  return { night: false, hour: null, label: 'Round 1', scoreShown: 0, ...scene, ...extra };
}
