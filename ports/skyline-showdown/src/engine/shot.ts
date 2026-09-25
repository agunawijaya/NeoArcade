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
import { buildingRect, copyTerrain, discHitsTerrain, type Terrain } from './terrain';
import { windAcceleration } from './wind';

export interface ShotSetup {
  terrain: Terrain;
  gorillas: readonly [Gorilla, Gorilla];
  wind: number;
  gravity: number;
  balloon: Balloon | null;
  shields: readonly [boolean, boolean];
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
const BOUNCE_KEEPS = 0.75;
/** Collisions are checked at most this far apart, so fast bananas cannot tunnel. */
const COLLISION_SPACING = 2;

interface Flight {
  track: BananaTrack;
  origin: Point;
  velocity: Point;
  segmentStart: number;
  canSplit: boolean;
  canBounce: boolean;
  previous: Point;
  done: boolean;
}

/** Converts the typed angle to world degrees: player 2 faces left, so it is mirrored. */
export function worldAngle(thrower: PlayerIndex, angle: number): number {
  return thrower === 0 ? angle : 180 - angle;
}

/** Inputs as the original accepted them: 0–360, velocity rounded to a whole number. */
export function normaliseThrow(input: ThrowInput): ThrowInput {
  const clamp = (value: number) =>
    Math.min(MAX_INPUT, Math.max(0, Number.isFinite(value) ? value : 0));
  return { ...input, angle: clamp(input.angle), velocity: Math.round(clamp(input.velocity)) };
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
  private readonly golden: boolean;
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
    this.wind = input.powerUp === 'calm' ? 0 : setup.wind;
    this.golden = input.powerUp === 'golden';
    this.balloon = setup.balloon;
  }

  run(): ShotRecord {
    const { thrower, angle, velocity } = this.input;
    const hand = throwingHand(this.setup.gorillas[thrower], thrower);

    if (velocity < FUMBLE_VELOCITY) {
      this.fumble(hand);
    } else {
      const radians = (worldAngle(thrower, angle) * Math.PI) / 180;
      this.launch(hand, { x: Math.cos(radians) * velocity, y: -Math.sin(radians) * velocity }, 0);
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
      canSplit,
      canBounce: this.input.powerUp === 'bouncer',
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

  private positionAt(flight: Flight, step: number): Point {
    const time = (step - flight.segmentStart) * STEP_TIME;
    return {
      x:
        flight.origin.x +
        flight.velocity.x * time +
        0.5 * windAcceleration(this.wind) * time * time,
      y: flight.origin.y + flight.velocity.y * time + 0.5 * this.setup.gravity * time * time,
    };
  }

  private velocityAt(flight: Flight, step: number): Point {
    const time = (step - flight.segmentStart) * STEP_TIME;
    return {
      x: flight.velocity.x + windAcceleration(this.wind) * time,
      y: flight.velocity.y + this.setup.gravity * time,
    };
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
  }

  /** Walks from the last point to this one in small hops; returns true if the flight ended. */
  private collide(flight: Flight, target: Point, step: number): boolean {
    const from = flight.previous;
    const hops = Math.min(
      16,
      Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.y - from.y) / COLLISION_SPACING)),
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

    if (flight.canBounce) {
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
        return {
          player,
          toppled,
          blasted,
          distance: Math.hypot(centre.x - point.x, centre.y - point.y),
        };
      })
      .filter((casualty) => casualty.toppled || casualty.blasted)
      .sort((a, b) => a.distance - b.distance);

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
    flight.origin = clear;
    flight.velocity = {
      x: (hitWall ? -incoming.x : incoming.x) * BOUNCE_KEEPS,
      y: (hitWall ? incoming.y : -incoming.y) * BOUNCE_KEEPS,
    };
    flight.segmentStart = step;
    flight.canBounce = false;
    flight.track.points.push(clear);
    flight.previous = clear;
    this.lastStep = Math.max(this.lastStep, step);
    this.record({ type: 'bounce', ...this.at(flight, clear, step) });
  }

  private split(flight: Flight, position: Point, step: number) {
    this.finish(flight, position, step);
    const heading = this.velocityAt(flight, step);
    const children = [-SPLIT_SPREAD_DEGREES, 0, SPLIT_SPREAD_DEGREES].map((degrees) => {
      const turn = (degrees * Math.PI) / 180;
      const velocity = {
        x: heading.x * Math.cos(turn) - heading.y * Math.sin(turn),
        y: heading.x * Math.sin(turn) + heading.y * Math.cos(turn),
      };
      const child = this.launch(position, velocity, step, false);
      child.canBounce = false;
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
