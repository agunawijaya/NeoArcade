import {
  BANANA_RADIUS,
  EXPLOSION_RADIUS,
  FUMBLE_VELOCITY,
  MAX_INPUT,
  MAX_SHOT_STEPS,
  STEP_TIME,
  STREET_Y,
  SUN,
  WORLD_WIDTH,
} from './constants';
import { sinCosDegrees, squareRoot } from './exact-math';
import { discTouchesCircle, discTouchesRect, type Point, type Rect } from './geometry';
import {
  footprint,
  gorillaCentre,
  gorillaHitboxes,
  throwingHand,
  type Gorilla,
  type PlayerIndex,
} from './gorillas';
import {
  balloonAt,
  balloonHitShapes,
  balloonOnScreen,
  type Balloon,
  type PowerUpKind,
} from './powerups';
import { stopsBanana, touchesTarget, type Target } from './targets';
import { buildingRect, copyTerrain, discHitsTerrain, type Terrain } from './terrain';
import { airAt, droneAt, NO_HAZARDS, type Hazards } from './twists';

export interface ShotSetup {
  terrain: Terrain;
  gorillas: readonly [Gorilla, Gorilla];
  wind: number;
  gravity: number;
  balloon: Balloon | null;
  shields: readonly [boolean, boolean];
  /** The World Tour's drones, jet streams, dust devils and springy ground. */
  hazards?: Hazards;
  /** Trick Shot's crates, bells and hoops. */
  targets?: readonly Target[];
}

export interface ThrowInput {
  thrower: PlayerIndex;
  /** Degrees, measured from the thrower's own side as the player typed it. */
  angle: number;
  velocity: number;
  powerUp: PowerUpKind | null;
}

export type GorillaHitCause = 'direct' | 'blast' | 'topple' | 'fumble';

interface EventBase {
  step: number;
  banana: number;
  x: number;
  y: number;
}

export type ShotEvent =
  | (EventBase & { type: 'sun' })
  | (EventBase & { type: 'balloon'; kind: PowerUpKind })
  | (EventBase & { type: 'split'; children: number[] })
  | (EventBase & { type: 'bounce' })
  /** A banana stopped by the patrolling drone. */
  | (EventBase & { type: 'drone' })
  /** A Trick Shot target reached: `target` is its index in the setup's list. */
  | (EventBase & { type: 'target'; target: number })
  | (EventBase & { type: 'explosion'; radius: number; building: number })
  | (EventBase & { type: 'topple'; cut: Rect; building: number })
  | (EventBase & { type: 'shield'; player: PlayerIndex })
  | (EventBase & { type: 'gorilla'; player: PlayerIndex; cause: GorillaHitCause })
  | (EventBase & { type: 'street' })
  | (EventBase & { type: 'offscreen'; side: 'left' | 'right' | 'top' });

export interface BananaTrack {
  id: number;
  /** Step at which points[0] happens. */
  startStep: number;
  points: Point[];
  golden: boolean;
}

export interface ShotRecord {
  input: ThrowInput;
  /** The wind that actually blew during this throw (Calm Air makes it 0). */
  wind: number;
  tracks: BananaTrack[];
  /** In the order they happen. */
  events: ShotEvent[];
  /** Number of steps until the last banana came to rest. */
  steps: number;
  terrain: Terrain;
  victim: PlayerIndex | null;
  shields: [boolean, boolean];
  collected: PowerUpKind | null;
  balloon: Balloon | null;
}

const GOLDEN_RADIUS = EXPLOSION_RADIUS * 2;
/** A gorilla hit leaves a big scorched bowl, as the original's gorilla explosion did. */
const GORILLA_BLAST_RADIUS = 16;
const SPLIT_SPREAD_DEGREES = 12;
/** A Tri-Banana's outer bananas turn this far either way from the middle one. */
const SPLIT_TURN = sinCosDegrees(SPLIT_SPREAD_DEGREES);
const BOUNCE_KEEPS = 0.75;
/** Collisions are checked at most this far apart, so fast bananas cannot tunnel. */
const COLLISION_SPACING = 2;

/**
 * A banana's flight is a chain of segments, each a closed-form arc from its
 * own origin. Anything that changes the arc (a bounce, a split, entering a
 * jet stream or a dust devil) starts a new segment from where the banana is,
 * so the path stays continuous and exactly repeatable.
 */
interface Flight {
  track: BananaTrack;
  origin: Point;
  velocity: Point;
  segmentStart: number;
  /** Sideways acceleration in this segment: the wind, or the air of a zone it is in. */
  push: number;
  canSplit: boolean;
  /** Bounces left: one from a Bouncer, one from springy ground. */
  bounces: number;
  previous: Point;
  done: boolean;
}

/** Converts the typed angle to world degrees: player 2 faces left, so it is mirrored. */
export function worldAngle(thrower: PlayerIndex, angle: number): number {
  return thrower === 0 ? angle : 180 - angle;
}

/**
 * Inputs as the original accepted them, 0–360, with the velocity a whole
 * number and the angle kept to a hundredth of a degree: exactly what a
 * challenge link carries, so a shot rebuilt from a link is the shot thrown.
 */
export function normaliseThrow(input: ThrowInput): ThrowInput {
  const clamp = (value: number) =>
    Math.min(MAX_INPUT, Math.max(0, Number.isFinite(value) ? value : 0));
  return {
    ...input,
    angle: Math.round(clamp(input.angle) * 100) / 100,
    velocity: Math.round(clamp(input.velocity)),
  };
}

export function simulateShot(setup: ShotSetup, rawInput: ThrowInput): ShotRecord {
  return new ShotSimulation(setup, normaliseThrow(rawInput)).run();
}

class ShotSimulation {
  private readonly terrain: Terrain;
  private readonly events: ShotEvent[] = [];
  private readonly flights: Flight[] = [];
  private readonly shields: [boolean, boolean];
  private readonly wind: number;
  private readonly hazards: Hazards;
  private readonly golden: boolean;
  private readonly targets: readonly Target[];
  /** Targets already reached: a crate or a bell is spent, a hoop counts once. */
  private readonly spent: boolean[];
  private balloon: Balloon | null;
  private collected: PowerUpKind | null = null;
  private victim: PlayerIndex | null = null;
  private sunHit = false;
  private lastStep = 0;

  constructor(
    private readonly setup: ShotSetup,
    private readonly input: ThrowInput,
  ) {
    this.terrain = copyTerrain(setup.terrain);
    this.shields = [...setup.shields];
    const calm = input.powerUp === 'calm';
    this.wind = calm ? 0 : setup.wind;
    // Calm Air stills all the air, jet stream and dust devil included.
    const hazards = setup.hazards ?? NO_HAZARDS;
    this.hazards = calm ? { ...hazards, jetStream: null, dustDevil: null } : hazards;
    this.golden = input.powerUp === 'golden';
    this.targets = setup.targets ?? [];
    this.spent = this.targets.map(() => false);
    this.balloon = setup.balloon;
  }

  run(): ShotRecord {
    const { thrower, angle, velocity } = this.input;
    const hand = throwingHand(this.setup.gorillas[thrower], thrower);

    if (velocity < FUMBLE_VELOCITY) {
      this.fumble(hand);
    } else {
      const direction = sinCosDegrees(worldAngle(thrower, angle));
      this.launch(hand, { x: direction.cos * velocity, y: -direction.sin * velocity }, 0);
      this.fly();
    }

    const steps = this.lastStep + 1;
    const drifted = this.balloon ? balloonAt(this.balloon, steps) : null;
    return {
      input: this.input,
      wind: this.wind,
      tracks: this.flights.map((flight) => flight.track),
      events: this.events,
      steps,
      terrain: this.terrain,
      victim: this.victim,
      shields: this.shields,
      collected: this.collected,
      balloon: drifted && balloonOnScreen(drifted) ? drifted : null,
    };
  }

  private launch(
    origin: Point,
    velocity: Point,
    step: number,
    canSplit = this.input.powerUp === 'tri',
  ) {
    const flight: Flight = {
      track: { id: this.flights.length, startStep: step, points: [origin], golden: this.golden },
      origin,
      velocity,
      segmentStart: step,
      push: this.airAt(origin),
      canSplit,
      bounces: (this.input.powerUp === 'bouncer' ? 1 : 0) + (this.hazards.bouncy ? 1 : 0),
      previous: origin,
      done: false,
    };
    this.flights.push(flight);
    return flight;
  }

  private fly() {
    for (let step = 1; step < MAX_SHOT_STEPS; step++) {
      const active = this.flights.filter((flight) => !flight.done);
      if (active.length === 0) return;
      for (const flight of active) {
        if (this.victim !== null) flight.done = true;
        else this.advance(flight, step);
      }
    }
    for (const flight of this.flights.filter((candidate) => !candidate.done)) {
      this.finish(flight, flight.previous, MAX_SHOT_STEPS - 1);
      this.record({
        type: 'offscreen',
        side: 'top',
        ...this.at(flight, flight.previous, MAX_SHOT_STEPS - 1),
      });
    }
  }

  private airAt(point: Point): number {
    return airAt(this.hazards, this.wind, point.x, point.y);
  }

  private positionAt(flight: Flight, step: number): Point {
    const time = (step - flight.segmentStart) * STEP_TIME;
    return {
      x: flight.origin.x + flight.velocity.x * time + 0.5 * flight.push * time * time,
      y: flight.origin.y + flight.velocity.y * time + 0.5 * this.setup.gravity * time * time,
    };
  }

  private velocityAt(flight: Flight, step: number): Point {
    const time = (step - flight.segmentStart) * STEP_TIME;
    return {
      x: flight.velocity.x + flight.push * time,
      y: flight.velocity.y + this.setup.gravity * time,
    };
  }

  /** Starts a new segment here with new motion, keeping the path continuous. */
  private resegment(flight: Flight, origin: Point, velocity: Point, step: number) {
    flight.origin = origin;
    flight.velocity = velocity;
    flight.segmentStart = step;
    flight.push = this.airAt(origin);
  }

  private advance(flight: Flight, step: number) {
    const position = this.positionAt(flight, step);

    if (position.x >= WORLD_WIDTH - 6 || position.x <= 6) {
      this.finish(flight, position, step);
      this.record({
        type: 'offscreen',
        side: position.x <= 6 ? 'left' : 'right',
        ...this.at(flight, position, step),
      });
      return;
    }
    if (position.y >= STREET_Y + 4) {
      this.finish(flight, position, step);
      this.record({ type: 'street', ...this.at(flight, position, step) });
      return;
    }

    // Like the original, nothing is checked while the banana is above the screen.
    if (position.y > 0 && this.collide(flight, position, step)) return;

    if (
      flight.canSplit &&
      this.velocityAt(flight, step - 1).y < 0 &&
      this.velocityAt(flight, step).y >= 0
    ) {
      this.split(flight, position, step);
      return;
    }

    flight.track.points.push(position);
    flight.previous = position;
    this.lastStep = Math.max(this.lastStep, step);
    // Crossing into or out of a jet stream or a dust devil changes the push from here on.
    if (this.airAt(position) !== flight.push) {
      this.resegment(flight, position, this.velocityAt(flight, step), step);
    }
  }

  /** Walks from the last point to this one in small hops; returns true if the flight ended. */
  private collide(flight: Flight, target: Point, step: number): boolean {
    const from = flight.previous;
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const hops = Math.min(
      16,
      Math.max(1, Math.ceil(squareRoot(dx * dx + dy * dy) / COLLISION_SPACING)),
    );
    let clear = from;
    for (let hop = 1; hop <= hops; hop++) {
      const point = {
        x: from.x + ((target.x - from.x) * hop) / hops,
        y: from.y + ((target.y - from.y) * hop) / hops,
      };
      if (point.y > 0 && this.touch(flight, point, clear, step)) return true;
      clear = point;
    }
    return false;
  }

  /** Everything the banana can meet, in the order the original found it. */
  private touch(flight: Flight, point: Point, clear: Point, step: number): boolean {
    const { x, y } = point;

    if (!this.sunHit && y < SUN.reach && discTouchesCircle(x, y, BANANA_RADIUS, SUN)) {
      this.sunHit = true;
      this.record({ type: 'sun', ...this.at(flight, point, step) });
    }

    if (this.balloon) {
      const balloon = balloonAt(this.balloon, step);
      if (
        balloonHitShapes(balloon).some((shape) => discTouchesCircle(x, y, BANANA_RADIUS, shape))
      ) {
        this.collected = balloon.kind;
        this.balloon = null;
        this.record({ type: 'balloon', kind: balloon.kind, ...this.at(flight, point, step) });
      }
    }

    const drone = this.hazards.drone;
    if (drone && discTouchesRect(x, y, BANANA_RADIUS, droneAt(drone, step))) {
      this.finish(flight, point, step);
      this.record({ type: 'drone', ...this.at(flight, point, step) });
      return true;
    }

    for (const [index, target] of this.targets.entries()) {
      if (this.spent[index] || !touchesTarget(target, x, y, BANANA_RADIUS)) continue;
      this.spent[index] = true;
      this.record({ type: 'target', target: index, ...this.at(flight, point, step) });
      if (stopsBanana(target)) {
        this.finish(flight, point, step);
        return true;
      }
    }

    for (const player of [0, 1] as const) {
      const gorilla = this.setup.gorillas[player];
      if (gorillaHitboxes(gorilla).some((box) => discTouchesRect(x, y, BANANA_RADIUS, box))) {
        this.finish(flight, point, step);
        this.hitGorilla(player, 'direct', flight, point, step);
        return true;
      }
    }

    const building = discHitsTerrain(this.terrain, x, y, BANANA_RADIUS);
    if (building === -1) return false;

    if (flight.bounces > 0) {
      this.bounce(flight, building, clear, step);
      return true;
    }
    this.finish(flight, point, step);
    this.explode(flight, building, point, step);
    return true;
  }

  private hitGorilla(
    player: PlayerIndex,
    cause: GorillaHitCause,
    flight: Flight,
    point: Point,
    step: number,
  ) {
    if (this.shields[player]) {
      this.shields[player] = false;
      this.record({ type: 'shield', player, ...this.at(flight, point, step) });
      return;
    }
    this.victim = player;
    const centre = gorillaCentre(this.setup.gorillas[player]);
    this.terrain.craters.push({ ...centre, radius: GORILLA_BLAST_RADIUS });
    this.record({ type: 'gorilla', player, cause, ...this.at(flight, point, step) });
  }

  private explode(flight: Flight, building: number, point: Point, step: number) {
    const radius = this.golden ? GOLDEN_RADIUS : EXPLOSION_RADIUS;
    this.terrain.craters.push({ x: point.x, y: point.y, radius });
    this.record({ type: 'explosion', radius, building, ...this.at(flight, point, step) });
    if (this.golden) this.goldenAftermath(flight, building, point, radius, step);
  }

  /**
   * A Golden Banana also hurts a gorilla caught in its blast, and a blast that
   * reaches the roof knocks off the section above it, along with anyone
   * standing there.
   */
  private goldenAftermath(
    flight: Flight,
    building: number,
    point: Point,
    radius: number,
    step: number,
  ) {
    const roof = this.terrain.buildings[building];
    const reachesRoof = roof !== undefined && point.y - radius <= roof.top;
    const cut: Rect | null =
      roof && reachesRoof
        ? spanOf(
            roof.top - 1,
            point.y,
            Math.max(roof.x, point.x - radius * 1.6),
            Math.min(roof.x + roof.width, point.x + radius * 1.6),
          )
        : null;

    const casualties = ([0, 1] as const)
      .map((player) => {
        const gorilla = this.setup.gorillas[player];
        const feet = footprint(gorilla);
        const toppled =
          cut !== null &&
          gorilla.building === building &&
          feet.to >= cut.x &&
          feet.from <= cut.x + cut.width;
        const blasted = gorillaHitboxes(gorilla).some((box) =>
          discTouchesRect(point.x, point.y, radius, box),
        );
        const centre = gorillaCentre(gorilla);
        const dx = centre.x - point.x;
        const dy = centre.y - point.y;
        return { player, toppled, blasted, distanceSquared: dx * dx + dy * dy };
      })
      .filter((casualty) => casualty.toppled || casualty.blasted)
      .sort((a, b) => a.distanceSquared - b.distanceSquared);

    const shieldedOnCut = casualties.some(
      (casualty) => casualty.toppled && this.shields[casualty.player],
    );
    if (cut && !shieldedOnCut) {
      this.terrain.cuts.push(cut);
      this.record({ type: 'topple', cut, building, ...this.at(flight, point, step) });
    }
    const first = casualties[0];
    if (first)
      this.hitGorilla(
        first.player,
        first.toppled && !shieldedOnCut ? 'topple' : 'blast',
        flight,
        point,
        step,
      );
  }

  private bounce(flight: Flight, building: number, clear: Point, step: number) {
    const rect = this.terrain.buildings[building];
    const incoming = this.velocityAt(flight, step);
    const hitWall =
      rect !== undefined && (clear.x < rect.x || clear.x > rect.x + buildingRect(rect).width);
    this.resegment(
      flight,
      clear,
      {
        x: (hitWall ? -incoming.x : incoming.x) * BOUNCE_KEEPS,
        y: (hitWall ? incoming.y : -incoming.y) * BOUNCE_KEEPS,
      },
      step,
    );
    flight.bounces -= 1;
    flight.track.points.push(clear);
    flight.previous = clear;
    this.lastStep = Math.max(this.lastStep, step);
    this.record({ type: 'bounce', ...this.at(flight, clear, step) });
  }

  private split(flight: Flight, position: Point, step: number) {
    this.finish(flight, position, step);
    const heading = this.velocityAt(flight, step);
    const children = [-1, 0, 1].map((side) => {
      const sin = side * SPLIT_TURN.sin;
      const cos = side === 0 ? 1 : SPLIT_TURN.cos;
      const velocity = {
        x: heading.x * cos - heading.y * sin,
        y: heading.x * sin + heading.y * cos,
      };
      const child = this.launch(position, velocity, step, false);
      child.bounces = this.hazards.bouncy ? 1 : 0;
      return child.track.id;
    });
    this.record({ type: 'split', children, ...this.at(flight, position, step) });
  }

  /** Too weak a throw: the banana drops straight onto the thrower's head. */
  private fumble(hand: Point) {
    const { thrower } = this.input;
    const flight = this.launch(hand, { x: 0, y: 0 }, 0, false);
    const head = this.setup.gorillas[thrower].y + 2;
    const fall = Math.max(this.setup.gravity, 5);
    let step = 1;
    let point = hand;
    while (point.y < head) {
      const time = step * STEP_TIME * 2;
      point = { x: hand.x, y: Math.min(head, hand.y + 0.5 * fall * time * time) };
      flight.track.points.push(point);
      step++;
    }
    this.finish(flight, point, step - 1);
    this.hitGorilla(thrower, 'fumble', flight, point, step - 1);
  }

  private finish(flight: Flight, point: Point, step: number) {
    if (flight.track.points.at(-1) !== point) flight.track.points.push(point);
    flight.done = true;
    flight.previous = point;
    this.lastStep = Math.max(this.lastStep, step);
  }

  private at(flight: Flight, point: Point, step: number): EventBase {
    return { step, banana: flight.track.id, x: point.x, y: point.y };
  }

  private record(event: ShotEvent) {
    this.events.push(event);
  }
}

function spanOf(top: number, bottom: number, left: number, right: number): Rect {
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(1, bottom - top) };
}
