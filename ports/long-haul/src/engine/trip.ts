import type { Settlement } from './arrival';
import { CARGO, type CargoId } from './cargo';
import type { ConditionId, FatigueId } from './conditions';
import { DIFFICULTIES, type Difficulty, type DifficultyId } from './difficulty';
import type { TripEvent } from './events';
import { STOCK_RIG, type RigSpec } from './rig';
import { destinationStop, type Route, type RouteStop } from './route';
import { RULES, speedCap } from './rules';
import type { WeatherSystem } from './living-weather';

/**
 * One trip from terminal to warehouse: the original's variables, named. The
 * state is plain data, so a trip can be saved after any hour and picked up
 * again, and replayed from its seed and the player's choices.
 */
export type TyreOrder =
  | { kind: 'none' }
  | { kind: 'retread'; count: 0 | 1 | 2 }
  /** Three new tyres puts a new one on the spare as well (line 1280). */
  | { kind: 'new'; count: 0 | 1 | 2 | 3 };

export interface Deadline {
  /** HR at which the load is due, as the dispatcher posts it. */
  dueHr: number;
  /** Freight delivered at this HR or later pays the late penalty (line 5330 uses 95). */
  lateHr: number;
  /** Oranges risk damage for each whole day on the road after this many (line 5220 uses 4). */
  spoilAfterDays: number;
}

export interface TripSetup {
  route: Route;
  cargo: CargoId;
  load: number;
  tyres: TyreOrder;
  seed: number;
  difficulty: DifficultyId;
  /** Hours since Monday 00:00, local time at the start: 8 is the original's Monday 8 AM. */
  startClock: number;
  deadline: Deadline;
  /** Offences already on the driver's record (NT survives between trips). */
  offences?: number;
  rig?: RigSpec;
  /** Weather systems for a route with living weather. */
  sky?: readonly WeatherSystem[];
  /** Gallons in the tank at departure, at $1 each; the original rig took 190. */
  startFuel?: number;
  /** Gallons already in the tank from the last trip, which cost nothing now. */
  carriedFuel?: number;
  /** A contract's agreed pay, in place of the original rate per pound. */
  payCents?: number;
  /** A tenth more for delivering by the time it is due. */
  earlyBonus?: boolean;
}

export type TripStatus = 'driving' | 'crashed' | 'jailed' | 'arrived';

export interface Expense {
  kind: ExpenseKind;
  cents: number;
  hr: number;
  mile: number;
  note?: string;
}

export type ExpenseKind =
  | 'fuel'
  | 'tyres'
  | 'toll'
  | 'fine'
  | 'scale-fine'
  | 'repair'
  | 'tow'
  | 'barrel'
  | 'motel'
  | 'coffee';

/** One hour of the trail: where the rig was and how it went, for the map. */
export interface TrailPoint {
  hr: number;
  mile: number;
  speed: number;
  condition: ConditionId;
}

export interface Trip {
  seed: number;
  route: Route;
  cargo: CargoId;
  load: number;
  difficulty: DifficultyId;
  rig: RigSpec;
  deadline: Deadline;
  startClock: number;
  sky: readonly WeatherSystem[];
  /** The contract's pay, when there is one; otherwise the load earns the original rate. */
  payCents: number | null;
  earlyBonus: boolean;
  status: TripStatus;

  /** HR: hours on the trip clock, which jumps with time zones. */
  hr: number;
  /** HL: hours since real sleep. */
  awake: number;
  /** HS: hours slept, counting the night before. */
  slept: number;
  /** MF: odometer, in whole miles. */
  miles: number;
  /** WF: gallons in the tank. */
  fuel: number;
  /** TC: tyre wear; more wear, more blowouts. */
  tyreWear: number;
  /** TS: the spare. 0 used, 1 an old one, 2 a new one. */
  spare: 0 | 1 | 2;
  /** SL: the limit right now (35 in a work zone). */
  limit: number;
  /** The limit of the leg being driven, which a work zone gives way back to. */
  legLimit: number;
  /** NP: the next stop on the route. */
  next: number;
  /** NS: hours since the last truck stop. */
  hoursSinceStop: number;
  /** SP: the speed of the hour just driven. */
  speed: number;
  /** CR and CD for the coming hour. */
  condition: ConditionId;
  fatigue: FatigueId;
  /** CX: points of damage to oranges; seven or more spoils the load. */
  damage: number;
  /** NT: offences on the record, this trip included. */
  offences: number;
  /** Hours the clock has been moved by time zones. */
  zoneShift: number;
  /** Miles added by a detour, from `extraFrom` on. */
  extraMiles: number;
  extraFrom: number;
  /** The road the next leg follows when a detour renamed it. */
  detourRoad: { stop: number; road: string } | null;
  /** How many hours have been driven; names each hour's random stream. */
  hourCount: number;
  stopCount: number;
  /** The truck stop on offer: NS > 3 (line 1630). */
  stopOffered: boolean;
  /** The original's fuel gauge: within five gallons either way (line 1560). */
  fuelGauge: number;

  expenses: Expense[];
  events: TripEvent[];
  trail: TrailPoint[];
  /** How many times each place has been passed, for its random stream. */
  visits: Record<string, number>;
  /** Filled in on arrival. */
  settlement?: Settlement;
}

export function difficultyOf(trip: Trip): Difficulty {
  return DIFFICULTIES[trip.difficulty];
}

export function totalMiles(trip: Trip): number {
  return trip.route.miles + trip.extraMiles;
}

/** A stop's milepost on this trip, detours included. */
export function stopMile(trip: Trip, index: number): number {
  const stop = trip.route.stops[index];
  if (!stop) return totalMiles(trip);
  if (index === trip.route.stops.length - 1) return totalMiles(trip);
  return stop.mile + (index >= trip.extraFrom ? trip.extraMiles : 0);
}

export function nextStop(trip: Trip): RouteStop {
  return trip.route.stops[trip.next] ?? destinationStop(trip.route);
}

/** "Cruising on …" (line 1600). */
export function currentRoad(trip: Trip): string {
  if (trip.detourRoad?.stop === trip.next) return trip.detourRoad.road;
  return nextStop(trip).road;
}

export function milesToGo(trip: Trip): number {
  return Math.max(0, totalMiles(trip) - trip.miles);
}

/** Local time, as hours since Monday 00:00. */
export function weekHours(trip: Trip): number {
  return trip.startClock + trip.hr;
}

export function hourOfDay(trip: Trip): number {
  return (((trip.startClock + trip.hr) % 24) + 24) % 24;
}

/** Real hours since departure: the trip clock without its time-zone jumps. */
export function elapsedHours(trip: Trip): number {
  return trip.hr - trip.zoneShift;
}

/** RH for the leg being driven. */
export function legFactor(trip: Trip): number {
  return nextStop(trip).factor ?? trip.route.factor;
}

/** RT for the leg being driven. */
export function legFineBase(trip: Trip): number {
  return nextStop(trip).fineBase ?? trip.route.fineBase;
}

export function currentSpeedCap(trip: Trip): number {
  return speedCap(trip.limit);
}

export function spend(trip: Trip, kind: ExpenseKind, cents: number, note?: string) {
  if (cents <= 0) return;
  trip.expenses.push({
    kind,
    cents: Math.round(cents),
    hr: trip.hr,
    mile: trip.miles,
    ...(note ? { note } : {}),
  });
}

export function expensesTotal(trip: Trip): number {
  return trip.expenses.reduce((sum, expense) => sum + expense.cents, 0);
}

/** What the scale will read before its random 0–225 lb (line 3540). */
export function grossWeight(trip: Pick<Trip, 'load' | 'fuel'>): number {
  return RULES.rigPounds + trip.load + RULES.fuelPoundsPerGallon * trip.fuel;
}

/**
 * The most cargo that stays under the scale's 60,000 lb with this much fuel
 * aboard. The original's prompt called 40,000 lb "the legal limit", which is only
 * true with a tank about half empty; the port shows the real figure.
 */
export function legalLoad(fuelGallons: number): number {
  const margin = 225;
  return Math.floor(
    RULES.grossLimitPounds - RULES.rigPounds - RULES.fuelPoundsPerGallon * fuelGallons - margin,
  );
}

export interface SetupProblem {
  field: 'load' | 'tyres';
  message: string;
}

/** The checks of lines 1110 and 1290; a full trailer is not a problem, just a full trailer. */
export function setupProblems(setup: Pick<TripSetup, 'load' | 'tyres'>): SetupProblem[] {
  const problems: SetupProblem[] = [];
  if (!Number.isFinite(setup.load) || setup.load < RULES.minLoad) {
    problems.push({ field: 'load', message: "You can't make a living on half a load." });
  }
  const { tyres } = setup;
  if (tyres.kind === 'retread' && (tyres.count < 0 || tyres.count > 2)) {
    problems.push({ field: 'tyres', message: 'I did not understand your answers.' });
  }
  if (tyres.kind === 'new' && (tyres.count < 0 || tyres.count > 3)) {
    problems.push({ field: 'tyres', message: 'I did not understand your answers.' });
  }
  return problems;
}

/** The cost and effect of the tyres bought at the terminal (lines 1280–1315). */
export function tyrePurchase(
  tyres: TyreOrder,
  startWear: number,
): { wear: number; spare: 1 | 2; cents: number } {
  if (tyres.kind === 'retread') {
    return {
      wear: startWear - RULES.retreadWear * tyres.count,
      spare: 1,
      cents: RULES.retreadCents * tyres.count,
    };
  }
  if (tyres.kind === 'new') {
    const spareToo = tyres.count === 3;
    const onWheels = spareToo ? 2 : tyres.count;
    return {
      wear: startWear - RULES.newTyreWear * onWheels,
      spare: spareToo ? 2 : 1,
      cents: RULES.newTyreCents * tyres.count,
    };
  }
  return { wear: startWear, spare: 1, cents: 0 };
}

/** Loads above a full trailer are trimmed, as line 1200 does. */
export function trimLoad(load: number): number {
  return Math.min(RULES.maxLoad, Math.round(load));
}

/** Freight's deadline in Single Haul: due 4 PM Thursday, late from Friday 7 AM (HR 80 and 95). */
export const ORIGINAL_DEADLINE: Deadline = { dueHr: 80, lateHr: 95, spoilAfterDays: 4 };

export function isRefrigerated(trip: Pick<Trip, 'cargo'>): boolean {
  return CARGO[trip.cargo].refrigerated;
}

export function defaultRig(): RigSpec {
  return { ...STOCK_RIG };
}
