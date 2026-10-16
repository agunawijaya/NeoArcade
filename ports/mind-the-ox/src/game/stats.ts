import { TICKS_PER_SECOND } from '../engine/constants';
import type { GameEvent } from '../engine/events';
import type { Side } from '../engine/map';
import { isLit } from '../engine/sight';
import { TURN, headingDelta } from '../engine/trig';
import type { Plane, World } from '../engine/world';
import type { Goal } from './campaign';

/** What one side did in a round: the numbers behind the stars, the badges and the results card. */
export interface SideTally {
  targets: number;
  depots: number;
  /** Its own targets it destroyed. */
  ownTargets: number;
  planesDowned: number;
  planesLost: number;
  oxen: number;
  birds: number;
  /** Craters dug by its bombs and missiles. */
  craters: number;
  acesDowned: number;
  /** Enemy ships it sent to the bottom, and how many of them were carriers. */
  shipsSunk: number;
  carriersSunk: number;
  torpedoHits: number;
  /** The longest run of a torpedo of its that hit, world units, or 0. */
  longestTorpedo: number;
  raidersDowned: number;
  airshipsDowned: number;
}

/** What one person at the controls did: the moments only a pilot can have. */
export interface PilotTally {
  splats: number;
  landings: number;
  /** The least fuel left on a landing at home, 0…1, or null before any landing. */
  lowestLandingFuel: number | null;
  stalledIntoHome: boolean;
  loops: number;
  /** Ticks spent in a searchlight on a night raid. */
  litTicks: number;
  missilesDecoyed: number;
  /** Flocks broken up by flying through them. */
  flocksScattered: number;
  /** Deck landings caught by a wire, and approaches that missed them all and went round. */
  traps: number;
  bolters: number;
  /** Traps on the third wire, the one a good landing takes. */
  thirdWires: number;
  touchAndGoes: number;
  /** Times in the water, and times a destroyer's boat came for the pilot. */
  ditchings: number;
  rescues: number;
}

/** A loop counts when the nose comes all the way round within this long. */
const LOOP_TICKS = 6 * TICKS_PER_SECOND;

function emptySide(): SideTally {
  return {
    targets: 0,
    depots: 0,
    ownTargets: 0,
    planesDowned: 0,
    planesLost: 0,
    oxen: 0,
    birds: 0,
    craters: 0,
    acesDowned: 0,
    shipsSunk: 0,
    carriersSunk: 0,
    torpedoHits: 0,
    longestTorpedo: 0,
    raidersDowned: 0,
    airshipsDowned: 0,
  };
}

function emptyPilot(): PilotTally {
  return {
    splats: 0,
    landings: 0,
    lowestLandingFuel: null,
    stalledIntoHome: false,
    loops: 0,
    litTicks: 0,
    missilesDecoyed: 0,
    flocksScattered: 0,
    traps: 0,
    bolters: 0,
    thirdWires: 0,
    touchAndGoes: 0,
    ditchings: 0,
    rescues: 0,
  };
}

/**
 * Keeps the round's tally from the engine's events. One is made per round;
 * the session keeps the finished ones for the match's results.
 */
export class RoundTally {
  readonly sides: [SideTally, SideTally] = [emptySide(), emptySide()];
  readonly pilots = new Map<number, PilotTally>();
  ticks = 0;
  convoyEscaped = 0;
  /** A depot was still standing when something else of the enemy's went up. */
  depotsFirstBroken = false;
  /** Bombs the raids landed on our ships. */
  raiderBombs = 0;
  /** Hits taken by the convoy we escort. */
  escortHits = 0;
  /** An enemy ship went down while their carrier was still afloat. */
  carrierFirstBroken = false;
  /** Each human plane's turning, for spotting loops: total turn, and when it started. */
  private readonly turning = new Map<number, { heading: number; total: number; since: number }>();

  constructor(
    humanPlanes: readonly number[],
    private readonly acePlanes: ReadonlySet<number>,
  ) {
    for (const id of humanPlanes) this.pilots.set(id, emptyPilot());
  }

  pilot(id: number): PilotTally | undefined {
    return this.pilots.get(id);
  }

  /** One tick of the round: the events it produced and how the human planes are flying. */
  absorb(world: World, events: readonly GameEvent[]) {
    this.ticks += 1;
    for (const event of events) this.absorbEvent(world, event);
    for (const plane of world.planes) {
      const tally = this.pilots.get(plane.id);
      if (!tally) continue;
      this.watchForLoops(plane, tally);
      if (world.rules.searchlights && isLit(world, plane.x, plane.y) && plane.state === 'flying')
        tally.litTicks += 1;
    }
  }

  private absorbEvent(world: World, event: GameEvent) {
    switch (event.type) {
      case 'target-destroyed': {
        if (event.by === null) return;
        const tally = this.sides[event.by];
        if (event.side === event.by) {
          tally.ownTargets += 1;
          return;
        }
        tally.targets += 1;
        if (event.kind === 'depot') tally.depots += 1;
        else if (
          event.side === 1 &&
          world.targets.some((t) => t.kind === 'depot' && t.side === 1 && t.standing)
        )
          this.depotsFirstBroken = true;
        return;
      }
      case 'plane-down':
        if (event.by !== null && event.by !== event.side) {
          this.sides[event.by].planesDowned += 1;
          if (this.acePlanes.has(event.plane)) this.sides[event.by].acesDowned += 1;
        }
        return;
      case 'crash':
        this.sides[event.side].planesLost += 1;
        if (event.stalled && event.atHome) {
          const tally = this.pilots.get(event.plane);
          if (tally) tally.stalledIntoHome = true;
        }
        return;
      case 'ox-hit':
        if (event.by !== null) this.sides[event.by].oxen += 1;
        return;
      case 'bird-hit':
        if (event.by !== null) this.sides[event.by].birds += 1;
        return;
      case 'crater':
        if (event.cause !== 'crash' && event.by !== null) this.sides[event.by].craters += 1;
        return;
      case 'splat': {
        const tally = this.pilots.get(event.plane);
        if (tally) tally.splats += 1;
        return;
      }
      case 'landed': {
        const tally = this.pilots.get(event.plane);
        if (!tally) return;
        tally.landings += 1;
        tally.lowestLandingFuel = Math.min(tally.lowestLandingFuel ?? 1, event.fuel);
        return;
      }
      case 'missile-decoyed': {
        const missile = world.missiles.find((candidate) => candidate.id === event.missile);
        const quarry = missile?.quarry;
        const tally = quarry === null || quarry === undefined ? undefined : this.pilots.get(quarry);
        if (tally) tally.missilesDecoyed += 1;
        return;
      }
      case 'convoy-escaped':
        this.convoyEscaped += 1;
        return;
      case 'trap': {
        const tally = this.pilots.get(event.plane);
        if (!tally) return;
        tally.traps += 1;
        if (event.wire === 3) tally.thirdWires += 1;
        return;
      }
      case 'bolter': {
        const tally = this.pilots.get(event.plane);
        if (tally) tally.bolters += 1;
        return;
      }
      case 'touch-and-go': {
        const tally = this.pilots.get(event.plane);
        if (tally) tally.touchAndGoes += 1;
        return;
      }
      case 'ditched': {
        const tally = this.pilots.get(event.plane);
        if (!tally) return;
        tally.ditchings += 1;
        if (event.rescuedBy !== null) tally.rescues += 1;
        return;
      }
      case 'ship-sinking': {
        if (event.by === null || event.by === event.side) return;
        const tally = this.sides[event.by];
        tally.shipsSunk += 1;
        if (event.kind === 'carrier') tally.carriersSunk += 1;
        else if (
          world.ships.some(
            (ship) =>
              ship.side === event.side && ship.kind === 'carrier' && ship.state === 'afloat',
          )
        )
          this.carrierFirstBroken = true;
        return;
      }
      case 'ship-hit': {
        const ship = world.ships.find((candidate) => candidate.id === event.ship);
        if (ship?.side === 0 && ship.convoy) this.escortHits += 1;
        return;
      }
      case 'torpedo-hit': {
        const tally = this.sides[event.by];
        tally.torpedoHits += 1;
        tally.longestTorpedo = Math.max(tally.longestTorpedo, event.distance);
        return;
      }
      case 'raider-down':
        if (event.by === null || event.by === event.side) return;
        this.sides[event.by].raidersDowned += 1;
        if (event.kind === 'zeppelin') this.sides[event.by].airshipsDowned += 1;
        return;
      case 'raider-bombs': {
        const ship = world.ships.find((candidate) => candidate.id === event.ship);
        if (ship?.side === 0) this.raiderBombs += 1;
        return;
      }
      case 'flock-scattered': {
        // The engine does not say who did it; a pilot right there did.
        const pilot = world.planes.find(
          (plane) =>
            this.pilots.has(plane.id) &&
            Math.abs(plane.x - event.x) < 20 &&
            Math.abs(plane.y - event.y) < 20,
        );
        const tally = pilot ? this.pilots.get(pilot.id) : undefined;
        if (tally) tally.flocksScattered += 1;
        return;
      }
      default:
        return;
    }
  }

  /**
   * A loop: the nose turns a full circle the same way within six seconds,
   * in the air the whole time.
   */
  private watchForLoops(plane: Plane, tally: PilotTally) {
    const flying = plane.state === 'flying';
    const track = this.turning.get(plane.id);
    if (!flying || !track) {
      this.turning.set(plane.id, { heading: plane.heading, total: 0, since: this.ticks });
      return;
    }
    const turn = headingDelta(track.heading, plane.heading);
    track.heading = plane.heading;
    if (turn === 0) return;
    if (track.total !== 0 && Math.sign(turn) !== Math.sign(track.total)) {
      track.total = turn;
      track.since = this.ticks;
      return;
    }
    track.total += turn;
    if (this.ticks - track.since > LOOP_TICKS) {
      track.total = turn;
      track.since = this.ticks;
      return;
    }
    if (Math.abs(track.total) >= TURN) {
      tally.loops += 1;
      track.total = 0;
      track.since = this.ticks;
    }
  }

  get seconds(): number {
    return this.ticks / TICKS_PER_SECOND;
  }
}

/** Whether a campaign goal was met in a won round, by the given side and pilot. */
export function goalMet(
  goal: Goal,
  round: RoundTally,
  side: Side,
  pilot: PilotTally | undefined,
): boolean {
  const tally = round.sides[side];
  switch (goal.kind) {
    case 'no-ox-harmed':
      return tally.oxen === 0;
    case 'no-planes-lost':
      return tally.planesLost === 0;
    case 'landed-at-home':
      return (pilot?.landings ?? 0) > 0;
    case 'convoy-stopped':
      return round.convoyEscaped === 0;
    case 'ace-downed':
      return tally.acesDowned > 0;
    case 'depots-first':
      return !round.depotsFirstBroken;
    case 'under-time':
      return round.seconds < goal.seconds;
    case 'lit-under':
      return (pilot?.litTicks ?? 0) / TICKS_PER_SECOND < goal.seconds;
    case 'no-bolters':
      return (pilot?.traps ?? 0) > 0 && pilot?.bolters === 0;
    case 'third-wire':
      return (pilot?.thirdWires ?? 0) > 0;
    case 'long-torpedo':
      return tally.longestTorpedo >= goal.distance;
    case 'no-raider-bombs':
      return round.raiderBombs === 0;
    case 'escort-unhurt':
      return round.escortHits === 0;
    case 'ships-sunk':
      return tally.shipsSunk >= goal.count;
    case 'airship-downed':
      return tally.airshipsDowned > 0;
    case 'carrier-first':
      return tally.carriersSunk > 0 && !round.carrierFirstBroken;
  }
}
