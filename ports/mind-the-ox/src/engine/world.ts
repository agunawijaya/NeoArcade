import type { Rng } from '@shared/rng';
import type { GameEvent } from './events';
import type { ShipKind } from './fleet';
import type { BaseSite, RaiderKind, Side, Span, TargetKind, WorldMap } from './map';
import type { Rules, RoundTuning } from './rules';
import type { ShipHitCause } from './ships';
import type { Terrain } from './terrain';

/**
 * Parked: on its own runway or deck, engine idling. Rolling: braking after
 * a landing, or taxiing along a deck to its spot. Launching: running down
 * a carrier's deck for take-off. Flying covers wounded flight too (see
 * `wounded`). Stalled: tumbling until the nose points down and the speed
 * comes back. Falling: shot down or out of fuel, past saving. Crashed: a
 * wreck on the ground (or sinking) until the next plane is wheeled out.
 * Out: no planes left. Victory: the round is won and the plane is flying
 * off into the sun, beyond harm.
 */
export type PlaneState =
  | 'parked'
  | 'rolling'
  | 'launching'
  | 'flying'
  | 'stalled'
  | 'falling'
  | 'crashed'
  | 'out'
  | 'victory';

/** What the ground crew hang under the plane: five bombs, or one torpedo. */
export type Loadout = 'bombs' | 'torpedo';

export type CpuLevel = 'easy' | 'normal' | 'hard' | 'brutal';

export interface Pilot {
  kind: 'human' | 'cpu';
  level: CpuLevel;
  /** The stretch of the world a CPU defends; outside it the player is left alone. */
  territory: { left: number; right: number } | null;
}

/** What a pilot asks of the plane for one tick. */
export interface Controls {
  /** −1 pushes the nose down, +1 pulls it up, relative to the pilot. */
  pitch: number;
  /** −1 throttles back, +1 opens up; smooth flight treats it as a rate. */
  throttle: number;
  flip: boolean;
  fire: boolean;
  bomb: boolean;
  missile: boolean;
  starburst: boolean;
  /** Pressed: fly home on autopilot (cancelled by any steering). */
  home: boolean;
  /** Asked for while parked: what the ground crew load next. */
  loadout?: Loadout;
}

export const IDLE_CONTROLS: Controls = {
  pitch: 0,
  throttle: 0,
  flip: false,
  fire: false,
  bomb: false,
  missile: false,
  starburst: false,
  home: false,
};

export interface Plane {
  id: number;
  side: Side;
  /** Seat number: 0 is the first player. */
  seat: number;
  pilot: Pilot;
  base: BaseSite;
  state: PlaneState;
  wounded: boolean;
  /** Out of planes in a two-player match, but still flying about as a harmless ghost. */
  ghost: boolean;
  /** Whether running out of planes makes this one a ghost rather than taking it out of the game. */
  ghostWhenOut: boolean;
  /** Centre of the plane. */
  x: number;
  y: number;
  /** Units per tick. */
  vx: number;
  vy: number;
  /** 1/4096ths of a turn; see trig.ts. */
  heading: number;
  /** Rolled over: the pilot's head points the other way from the usual for this heading. */
  inverted: boolean;
  /** Units per move. */
  speed: number;
  throttle: number;
  /** Smooth flight's eased rate of turn, in heading units per tick. */
  turnRate: number;
  fuel: number;
  rounds: number;
  bombs: number;
  loadout: Loadout;
  torpedoes: number;
  missiles: number;
  bursts: number;
  gunCooldown: number;
  bombCooldown: number;
  missileCooldown: number;
  burstCooldown: number;
  /** Counts down to the next stall tumble, fall adjustment, or the end of the wreck. */
  stateTimer: number;
  /** Ticks since smooth flight last steered, for rolling upright. */
  idleTicks: number;
  /** Classic flight steers once a move; what the pilot asked for since the last one waits here. */
  pendingPitch: number;
  pendingThrottle: number;
  pendingFlip: boolean;
  crashes: number;
  /** Crashes allowed before the pilot is out; CPU planes in 1984's mode come back forever. */
  maxCrashes: number;
  homing: boolean;
  /** The starburst currently drawing missiles away from this plane, if any. */
  decoy: number | null;
  /** Who last hurt it, so the right side is paid when it goes down. */
  lastHitBy: Side | null;
  controls: Controls;
  /** What a CPU pilot decided last and is still doing. */
  cpu: CpuMemory;
  /** On a carrier: how far along the deck from the stern, and how fast it rolls along it, units a move. */
  deckOffset: number;
  deckSpeed: number;
  /** Which of the deck's parking spots is this plane's, among those sharing a carrier. */
  deckSpot: number;
  /** Extra sink just after running off a deck, units a tick, dying away. */
  sink: number;
}

export interface CpuMemory {
  held: Controls;
  /** Turning back towards a far target: 0 not, 1 up and over, 2 down and under. */
  longWay: 0 | 1 | 2;
  /** The plane it is chasing, for the views and the pause screen's "who is on your tail". */
  quarry: number | null;
}

export interface Target {
  id: number;
  kind: TargetKind;
  side: Side;
  x: number;
  /** The ground it stands on. */
  y: number;
  width: number;
  height: number;
  standing: boolean;
  damage: number;
  /** A convoy lorry's destination, or null for a target that stays put. */
  drivesTo: number | null;
  /** The lorry reached its destination and got away. */
  escaped: boolean;
}

export interface Ox {
  id: number;
  x: number;
  y: number;
  alive: boolean;
  facing: 1 | -1;
  /** Until this tick the ox will not be startled again. */
  calmUntil: number;
}

export interface Flock {
  id: number;
  x: number;
  y: number;
  vx: number;
}

export interface Bird {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks until it changes course a little. */
  wander: number;
  /** A bird scattered from a flock leaves the battle after this many ticks; a stray never does. */
  leavesIn: number | null;
}

/** Who fired something, so penalties and kills are paid to the right side. */
export interface Owner {
  side: Side;
  /** The plane that fired it, or null for a target's gun. */
  plane: number | null;
}

export interface Shot {
  id: number;
  owner: Owner;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** A ship's anti-aircraft shell: the same as a bullet to the engine, a burst of flak to the eye. */
  shell?: boolean;
}

export interface Bomb {
  id: number;
  owner: Owner;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface Missile {
  id: number;
  owner: Owner;
  /** The plane it chases, or null once it has lost lock. */
  quarry: number | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  speed: number;
  life: number;
  burnedOut: boolean;
  /** Drawn off by a starburst at least once. */
  decoyed: boolean;
}

export interface Starburst {
  id: number;
  owner: Owner;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export type ShipState = 'afloat' | 'sinking' | 'sunk';

export interface Ship {
  id: number;
  /** Its place in the map's fleet, which carrier bases and raids point at. */
  index: number;
  kind: ShipKind;
  side: Side;
  /** The middle of the hull, at the waterline. */
  x: number;
  y: number;
  /** Which way the bow points. */
  direction: 1 | -1;
  /** Its cruising speed, and the speed it is making now, units a move. */
  cruise: number;
  speed: number;
  /** Units a tick, signed. */
  vx: number;
  /** 0 steaming straight; through a turn it runs up to 1 as the bow swings round, and the direction flips halfway. */
  turn: number;
  patrol: Span | null;
  bound: number | null;
  escaped: boolean;
  protect: boolean;
  convoy: boolean;
  hitPoints: number;
  maxHitPoints: number;
  /** Where it has been struck, so both views can show the holes and fires there. */
  wounds: ShipWound[];
  /** How far it has settled from its wounds, 0 to 1, catching up with the damage it has taken. */
  flooded: number;
  state: ShipState;
  /** 0 to 1 through the sinking. */
  sinking: number;
  /** The deck's rise and fall on the swell, units, and how fast it is moving, units a tick. */
  heave: number;
  heaveRate: number;
  gunCooldown: number;
  torpedoCooldown: number;
  lastHitBy: Side | null;
}

/** A heavy blow a ship took: a bomb, a torpedo, a raid's bomb or a plane flown into it. */
export interface ShipWound {
  /** Along the hull from amidships, towards the bow, and up from the waterline, units. */
  along: number;
  height: number;
  cause: ShipHitCause;
  tick: number;
}

/** A torpedo: falling from its plane, then running just under the surface. */
export interface Torpedo {
  id: number;
  owner: Owner;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'falling' | 'running';
  direction: 1 | -1;
  /** How much further it can run, world units. */
  run: number;
  /** Dropped low, level and slow enough to run true; otherwise it breaks up as it hits the water. */
  armed: boolean;
  /** Ships it has slipped past, end-on as they turned: it can no longer hit them. */
  passed: number[];
}

/** A bomber or an airship on its way to a ship, its gunners watching for fighters. */
export interface Raider {
  id: number;
  kind: RaiderKind;
  side: Side;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: 1 | -1;
  hitPoints: number;
  state: 'inbound' | 'outbound' | 'falling';
  /** The ship it is after, by id. */
  target: number;
  gunCooldown: number;
  lastHitBy: Side | null;
}

/** Wreckage flung out of an explosion; it can still bring a plane down. */
export interface Debris {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which shape a view draws, chosen at random when it is thrown. */
  shape: number;
}

export interface World {
  map: WorldMap;
  rules: Rules;
  tuning: RoundTuning;
  terrain: Terrain;
  rng: Rng;
  tick: number;
  nextId: number;
  planes: Plane[];
  targets: Target[];
  oxen: Ox[];
  flocks: Flock[];
  birds: Bird[];
  shots: Shot[];
  bombs: Bomb[];
  missiles: Missile[];
  bursts: Starburst[];
  debris: Debris[];
  ships: Ship[];
  torpedoes: Torpedo[];
  raiders: Raider[];
  /** How many of the map's gates have been flown through, in order. */
  gatesPassed: number;
  /** Touch-and-goes flown by people on our side, for the deck trial that asks for one. */
  touchAndGoes: number;
  /** Points per side this round, already including penalties. */
  score: [number, number];
  /** What happened during the last tick, for sound, pictures and the Arcade Pass. */
  events: GameEvent[];
}

export function nextId(world: World): number {
  world.nextId += 1;
  return world.nextId;
}
