import type { Rng } from '@shared/rng';
import type { Point } from './geometry';
import { gorillaCentre, otherPlayer, throwingHand, type PlayerIndex } from './gorillas';
import type { MatchState } from './match';
import type { PowerUpKind } from './powerups';
import type { ShotRecord } from './shot';
import { windAcceleration } from './wind';

/**
 * The CPU plays like a person at the keyboard. Its first throw is an
 * educated guess from the distance, the height difference and a feel for the
 * wind; after that it watches where its banana came down and corrects,
 * aiming between its best short and best long throw once it has both. It
 * never runs the simulation, so it can never solve a throw exactly.
 *
 * Difficulty changes how good the guess is, how much of the wind it reads,
 * how well it corrects and how much its hand shakes.
 */
export type CpuLevel = 'easy' | 'normal' | 'hard' | 'brutal';

interface Traits {
  /** Spread of the first velocity guess, as a fraction. */
  guessError: number;
  /** Share of the wind's push it allows for. */
  windSense: number;
  /** Share of the way to its corrected aim it actually goes. */
  correction: number;
  /** Hand shake: spread of the angle in degrees and of the velocity as a fraction. */
  shakeAngle: number;
  shakeVelocity: number;
  /** Seconds it "thinks" before winding up. */
  thinking: [number, number];
}

export const CPU_LEVELS: Record<CpuLevel, Traits> = {
  easy: {
    guessError: 0.22,
    windSense: 0,
    correction: 0.5,
    shakeAngle: 3.5,
    shakeVelocity: 0.05,
    thinking: [1.2, 2],
  },
  normal: {
    guessError: 0.14,
    windSense: 0.45,
    correction: 0.75,
    shakeAngle: 2,
    shakeVelocity: 0.03,
    thinking: [0.9, 1.6],
  },
  hard: {
    guessError: 0.09,
    windSense: 0.7,
    correction: 0.88,
    shakeAngle: 1.2,
    shakeVelocity: 0.018,
    thinking: [0.7, 1.2],
  },
  brutal: {
    guessError: 0.06,
    windSense: 0.85,
    correction: 0.95,
    shakeAngle: 0.7,
    shakeVelocity: 0.01,
    thinking: [0.5, 0.9],
  },
};

export interface CpuAim {
  angle: number;
  velocity: number;
  usePowerUp: boolean;
}

interface Observation {
  aim: CpuAim;
  /**
   * How far along the throwing direction the banana came down at the
   * target's height (judged from its arc if it left the screen), and how far
   * it needed to go.
   */
  reached: number;
  needed: number;
  /** It hit a building high up before getting anywhere near the target. */
  blocked: boolean;
}

interface Attempt {
  velocity: number;
  reached: number;
}

/** What the CPU remembers between its throws. Forgotten when a new round starts. */
export interface CpuMemory {
  round: number;
  last: Observation | null;
  /** The nearest short and long throws at the current angle. */
  short: Attempt | null;
  long: Attempt | null;
}

export function createCpuMemory(round = 0): CpuMemory {
  return { round, last: null, short: null, long: null };
}

/** What a player can see from their rooftop before throwing. */
interface View {
  hand: Point;
  target: Point;
  gravity: number;
  wind: number;
  /** y of the highest roof between the two gorillas. */
  highestRoofBetween: number;
  held: PowerUpKind | null;
}

function viewOf(state: MatchState): View {
  const thrower: PlayerIndex = state.turn;
  const { round } = state;
  const own = round.gorillas[thrower];
  const opponent = round.gorillas[otherPlayer(thrower)];
  const [from, to] = [own.building, opponent.building].sort((a, b) => a - b) as [number, number];
  const between = round.terrain.buildings.slice(from + 1, to);
  return {
    hand: throwingHand(own, thrower),
    target: gorillaCentre(opponent),
    gravity: round.world.gravity,
    wind: round.wind,
    highestRoofBetween: Math.min(...between.map((building) => building.top), Infinity),
    held: state.held[thrower],
  };
}

export function planThrow(state: MatchState, memory: CpuMemory, level: CpuLevel, rng: Rng): CpuAim {
  if (memory.round !== state.round.number)
    Object.assign(memory, createCpuMemory(state.round.number));
  const traits = CPU_LEVELS[level];
  const view = viewOf(state);
  const last = memory.last;
  const planned = last ? correct(memory, last, view, traits, rng) : guess(view, traits, rng);
  return {
    angle: clamp(planned.angle + gaussian(rng) * traits.shakeAngle, 5, 85),
    velocity: Math.round(
      clamp(planned.velocity * (1 + gaussian(rng) * traits.shakeVelocity), 3, 250),
    ),
    usePowerUp: wantsPowerUp(view, last),
  };
}

/** Looks at where the banana came down; call after every CPU throw. */
export function observeThrow(
  memory: CpuMemory,
  aim: CpuAim,
  shot: ShotRecord,
  state: MatchState,
): void {
  const thrower = shot.input.thrower;
  const hand = throwingHand(state.round.gorillas[thrower], thrower);
  const target = gorillaCentre(state.round.gorillas[otherPlayer(thrower)]);
  const direction = Math.sign(target.x - hand.x);
  const needed = (target.x - hand.x) * direction;
  const gravity = state.round.world.gravity;

  // With a Tri-Banana, judge by whichever banana came down closest.
  const landings = shot.tracks.map((track) => landingX(track.points, target.y, gravity));
  const landing = landings.reduce((best, x) =>
    Math.abs(x - target.x) < Math.abs(best - target.x) ? x : best,
  );
  const reached = (landing - hand.x) * direction;

  // Blocked: a building stopped an arc that would have carried on well past it.
  const ending = shot.events.at(-1);
  const blocked = ending?.type === 'explosion' && reached - (ending.x - hand.x) * direction > 30;

  if (memory.round !== state.round.number) {
    Object.assign(memory, createCpuMemory(state.round.number));
  }
  if (memory.last && Math.abs(memory.last.aim.angle - aim.angle) > 2) {
    memory.short = null;
    memory.long = null;
  }
  // Even a blocked arc says how far that throw would have gone.
  const attempt = { velocity: aim.velocity, reached };
  if (reached < needed && (!memory.short || reached > memory.short.reached)) {
    memory.short = attempt;
  }
  if (reached >= needed && (!memory.long || reached < memory.long.reached)) {
    memory.long = attempt;
  }
  memory.last = { aim, reached, needed, blocked };
}

export function thinkingSeconds(level: CpuLevel, rng: Rng): number {
  const [min, max] = CPU_LEVELS[level].thinking;
  return rng.float(min, max);
}

/**
 * Where a banana's arc came down to a given height, the way a player judges
 * it: read off the path if it got there, otherwise continued from the last
 * thing it was seen doing.
 */
function landingX(points: readonly Point[], height: number, gravity: number): number {
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1] as Point;
    const after = points[index] as Point;
    if (before.y < height && after.y >= height) {
      return before.x + ((after.x - before.x) * (height - before.y)) / (after.y - before.y);
    }
  }
  const end = points.at(-1) as Point;
  const previous = points.at(-2) ?? end;
  const speedX = (end.x - previous.x) / 0.1;
  const speedY = (end.y - previous.y) / 0.1;
  const drop = height - end.y;
  if (drop <= 0) return end.x;
  const time = (-speedY + Math.sqrt(speedY * speedY + 2 * gravity * drop)) / gravity;
  return end.x + speedX * time;
}

function guess(view: View, traits: Traits, rng: Rng): { angle: number; velocity: number } {
  const { hand, target, gravity, wind } = view;
  const distance = Math.abs(target.x - hand.x);
  const rise = hand.y - target.y;
  const towardTarget = Math.sign(target.x - hand.x);

  // A tall building in the way calls for a higher lob.
  const clearance = hand.y - view.highestRoofBetween;
  let angle = clearance > 0 ? 55 + Math.min(20, clearance / 5) : 45;
  angle += rng.float(-4, 4);
  // A strong wind in the face blows a lob straight back; throw flatter.
  const headwind = -windAcceleration(wind) * towardTarget * traits.windSense;
  if (headwind > 0) angle = Math.min(angle, 0.75 * toDegrees(Math.atan(gravity / headwind)));
  angle = Math.max(angle, 15);

  const calm = velocityFor(distance, rise, angle, gravity);
  const flightTime = distance / (calm * Math.cos(toRadians(angle)));
  const tailwind = windAcceleration(wind) * towardTarget;
  const windShift = 0.5 * tailwind * flightTime * flightTime * traits.windSense;
  const velocity = velocityFor(Math.max(30, distance - windShift), rise, angle, gravity);

  return { angle, velocity: velocity * (1 + gaussian(rng) * traits.guessError) };
}

function correct(
  memory: CpuMemory,
  last: Observation,
  view: View,
  traits: Traits,
  rng: Rng,
): { angle: number; velocity: number } {
  const distance = Math.abs(view.target.x - view.hand.x);
  const rise = view.hand.y - view.target.y;
  const retune = (angle: number) => {
    // Keep whatever wind fudge the last velocity carried, moved to the new angle.
    const fudge = last.aim.velocity / velocityFor(distance, rise, last.aim.angle, view.gravity);
    return {
      angle,
      velocity: velocityFor(distance, rise, angle, view.gravity) * clamp(fudge, 0.7, 1.4),
    };
  };

  // In the way but otherwise about right: lob higher. Blocked and short anyway: throw harder.
  const nearlyThere = last.reached > last.needed - 25;
  if (last.blocked && nearlyThere) return retune(Math.min(82, last.aim.angle + rng.float(6, 12)));

  // Blown back, or still short after throwing harder: the wind wins at this angle.
  const harderButShort =
    memory.short !== null &&
    memory.short.velocity < last.aim.velocity &&
    last.reached < last.needed * 0.4;
  if (last.reached < 0 || harderButShort) {
    return retune(Math.max(15, last.aim.angle - rng.float(8, 14)));
  }

  const { short, long } = memory;
  let target: number;
  if (short && long && long.reached > short.reached) {
    // Aim between the nearest short and long throws.
    const share = (last.needed - short.reached) / (long.reached - short.reached);
    target = short.velocity + share * (long.velocity - short.velocity);
  } else {
    // Range grows with the square of the velocity, so correct by the square root.
    const ideal = Math.sqrt(last.needed / Math.max(15, last.reached));
    target = last.aim.velocity * clamp(ideal, 0.7, 1.4);
  }
  const velocity = last.aim.velocity + traits.correction * (target - last.aim.velocity);
  return inWholeNumbers(last.aim.angle, velocity);
}

/**
 * Velocity can only be typed as a whole number. In low gravity one step of it
 * moves the landing further than a gorilla is wide, so round the velocity and
 * let the angle make up the difference (range goes with v² · sin 2a).
 */
function inWholeNumbers(angle: number, velocity: number): { angle: number; velocity: number } {
  const whole = Math.max(1, Math.round(velocity));
  const shape = Math.sin(2 * toRadians(angle)) * (velocity / whole) ** 2;
  if (shape >= 1) return { angle: 45, velocity: whole };
  const flatter = toDegrees(Math.asin(shape) / 2);
  return { angle: angle > 45 ? 90 - flatter : flatter, velocity: whole };
}

function wantsPowerUp(view: View, last: Observation | null): boolean {
  switch (view.held) {
    case null:
      return false;
    case 'shield':
      return true;
    case 'calm':
      return Math.abs(view.wind) >= 6;
    default:
      return last !== null && Math.abs(last.reached - last.needed) < 60;
  }
}

/** Launch speed to land `distance` away and `rise` higher on a calm day. */
function velocityFor(distance: number, rise: number, angle: number, gravity: number): number {
  const radians = toRadians(angle);
  const lift = distance * Math.tan(radians) - rise;
  if (lift <= 1) return 120;
  return Math.sqrt((gravity * distance * distance) / (2 * Math.cos(radians) ** 2 * lift));
}

function gaussian(rng: Rng): number {
  const u = Math.max(rng.next(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
