import type { Rng } from '@shared/rng';
import { HUB_IDS, placeById } from '../data/places';
import { CARGO, type CargoId } from './cargo';
import type { DifficultyId } from './difficulty';
import { skyFor, type Season } from './living-weather';
import { routeFor, routeOptions, shortestMiles, type RouteOption } from './network';
import type { RigSpec } from './rig';
import { RULES } from './rules';
import type { Deadline, TripSetup, TyreOrder } from './trip';

/**
 * A load on the job board: where it goes, what it is, what it pays and by
 * when. Pay follows the original rates, which were for 2,850 miles, scaled to
 * the shortest road distance, so a short haul pays the same per mile as
 * New York did.
 */
export type ContractSpecial = 'rush' | 'heavy' | 'early-bonus';

export interface Contract {
  id: string;
  from: string;
  to: string;
  cargo: CargoId;
  /** What is in the trailer, for the board: "Washington apples". */
  goods: string;
  load: number;
  /** Shortest road miles, which the pay is based on. */
  miles: number;
  payCents: number;
  /** Hours after departure the load is due; freight is late `LATE_GRACE` hours later. */
  dueHours: number;
  special: ContractSpecial | null;
  /** Reputation needed to be offered it. */
  minReputation: number;
}

/** A heavy load: legal at the scales with about a hundred gallons aboard, fined with a full tank. */
export const HEAVY_LOAD = 40_000;

/** The most diesel a rig can carry past an open scale with this load and stay legal. */
export function legalFuel(load: number): number {
  return Math.max(
    0,
    Math.floor((RULES.grossLimitPounds - RULES.rigPounds - 225 - load) / RULES.fuelPoundsPerGallon),
  );
}

/** The original's 95 − 80: fifteen hours between "due" and "late". */
export const LATE_GRACE = 15;
/** The original's reference trip. */
export const REFERENCE_MILES = 2850;
/** Every trip departs at 8 AM, as in the original. */
export const DEPARTURE_CLOCK = 8;

/** Refrigerated loads each hub ships, in its own words. */
const REEFER_GOODS: Readonly<Record<string, readonly string[]>> = {
  'los-angeles': ['California oranges', 'Valencia oranges', 'lemons'],
  'san-francisco': ['Salinas lettuce', 'artichokes', 'strawberries'],
  seattle: ['Washington apples', 'cherries', 'salmon on ice'],
  phoenix: ['Arizona grapefruit', 'cantaloupes'],
  'salt-lake-city': ['cheese', 'frozen peas'],
  denver: ['Colorado beef', 'Rocky Ford melons'],
  dallas: ['Texas beef', 'ruby red grapefruit'],
  houston: ['Gulf shrimp', 'Rio Grande oranges'],
  'kansas-city': ['Kansas City steaks', 'frozen pies'],
  'st-louis': ['ice cream', 'frozen dinners'],
  minneapolis: ['Wisconsin cheese', 'butter'],
  chicago: ['frozen pizza', 'sausages'],
  memphis: ['catfish', 'sweet potatoes'],
  atlanta: ['Georgia peaches', 'chicken'],
  miami: ['Florida oranges', 'tomatoes', 'grapefruit'],
  charlotte: ['North Carolina sweet potatoes', 'apples'],
  'washington-dc': ['Chesapeake crabs', 'apples'],
  'new-york': ['bagels', 'cheesecake'],
  boston: ['Maine lobster', 'cranberries'],
};

const FREIGHT_GOODS: readonly string[] = [
  'auto parts',
  'machine tools',
  'paper rolls',
  'canned goods',
  'furniture',
  'tyres',
  'textiles',
  'electronics',
  'appliances',
  'steel coils',
  'building supplies',
  'boxed books',
];

export function seasonFactor(cargo: CargoId, season: Season): number {
  // Winter roads and summer heat both make refrigerated hauling scarcer and dearer.
  if (cargo === 'oranges') return season === 'summer' ? 1.1 : season === 'winter' ? 1.05 : 1;
  return 1;
}

/** What a load pays: the original rate per pound, for this distance, adjusted. */
export function contractPay(
  cargo: CargoId,
  load: number,
  miles: number,
  special: ContractSpecial | null,
  market: number,
): number {
  const base = (load * CARGO[cargo].centsPerPound * miles) / REFERENCE_MILES;
  const bonus = special === 'rush' ? 1.25 : special === 'heavy' ? 1.15 : 1;
  return Math.round((base * bonus * market) / 100) * 100;
}

/**
 * Hours from departure to due: the original's ratio of 80 hours to 2,850 miles
 * (about 36 miles an hour of the clock), never under a day.
 */
export function dueHoursFor(miles: number, special: ContractSpecial | null): number {
  const pace = special === 'rush' ? 42 : 35.6;
  return Math.max(20, Math.round(miles / pace));
}

export function contractDeadline(contract: Contract): Deadline {
  // Day boundaries count from the trip clock; spoilage starts the day after the load is due.
  return {
    dueHr: contract.dueHours,
    lateHr: contract.dueHours + LATE_GRACE,
    spoilAfterDays: Math.max(1, Math.floor(contract.dueHours / 24)),
  };
}

export interface BoardOptions {
  rng: Rng;
  hub: string;
  season: Season;
  reputation: number;
  /** How many loads to post. */
  count?: number;
}

/** The job board at a hub: a handful of loads to other hubs, better ones for a better name. */
export function jobBoard({ rng, hub, season, reputation, count = 5 }: BoardOptions): Contract[] {
  const destinations = HUB_IDS.filter((other) => other !== hub);
  const contracts: Contract[] = [];
  const used = new Set<string>();
  for (let attempt = 0; contracts.length < count && attempt < 60; attempt++) {
    const to = rng.pick(destinations);
    const miles = shortestMiles(hub, to);
    // Long hauls are for drivers with a name; newcomers get shorter runs.
    const reach = 900 + reputation * 30;
    if (miles > reach || miles < 220) continue;
    const cargo = pickCargo(rng, hub);
    const key = `${to}:${cargo}`;
    if (used.has(key)) continue;
    used.add(key);
    const special = pickSpecial(rng, cargo, reputation);
    // A heavy load is legal at the scales only with a light tank; an ordinary one with any.
    const load = special === 'heavy' ? HEAVY_LOAD : rng.int(28, 38) * 1000;
    const market = rng.float(0.92, 1.12) * (1 + reputation / 400) * seasonFactor(cargo, season);
    contracts.push({
      id: `${hub}-${to}-${cargo}-${contracts.length}`,
      from: hub,
      to,
      cargo,
      goods: goodsFor(rng, hub, cargo),
      load,
      miles,
      payCents: contractPay(cargo, load, miles, special, market),
      dueHours: dueHoursFor(miles, special),
      special,
      minReputation: 0,
    });
  }
  return contracts.sort((a, b) => a.miles - b.miles);
}

function pickCargo(rng: Rng, hub: string): CargoId {
  const roll = rng.next();
  const reefer = REEFER_GOODS[hub] ? 0.4 : 0.2;
  if (roll < reefer) return 'oranges';
  return roll < reefer + 0.4 ? 'freight' : 'mail';
}

function pickSpecial(rng: Rng, cargo: CargoId, reputation: number): ContractSpecial | null {
  const roll = rng.next();
  if (cargo === 'freight' && roll < 0.25 + reputation / 400) return 'rush';
  if (roll > 0.82) return 'heavy';
  if (cargo !== 'mail' && roll > 0.7) return 'early-bonus';
  return null;
}

function goodsFor(rng: Rng, hub: string, cargo: CargoId): string {
  if (cargo === 'oranges') return rng.pick(REEFER_GOODS[hub] ?? ['produce']);
  if (cargo === 'mail') return 'U.S. Mail';
  return rng.pick(FREIGHT_GOODS);
}

export interface ContractTripOptions {
  contract: Contract;
  option: RouteOption;
  tyres: TyreOrder;
  seed: number;
  difficulty: DifficultyId;
  season: Season;
  offences: number;
  rig: RigSpec;
  /** Day of the week it leaves, 0 for Monday, so the clock reads true. */
  weekday?: number;
  /** Diesel left in the tank from the last load. */
  carriedFuel?: number;
}

/** Turns a signed contract and a chosen road into the setup for a trip. */
export function contractTrip(options: ContractTripOptions): TripSetup {
  const { contract } = options;
  return {
    route: routeFor(options.option),
    cargo: contract.cargo,
    load: contract.load,
    tyres: options.tyres,
    seed: options.seed,
    difficulty: options.difficulty,
    startClock: (options.weekday ?? 0) * 24 + DEPARTURE_CLOCK,
    deadline: contractDeadline(contract),
    offences: options.offences,
    rig: options.rig,
    // The terminal fills the tank only as far as the scales allow with this load.
    startFuel: Math.max(
      Math.min(terminalFuel(options.rig), legalFuel(contract.load)),
      Math.min(options.carriedFuel ?? 0, options.rig.tankGallons),
    ),
    carriedFuel: options.carriedFuel ?? 0,
    payCents: contract.payCents,
    earlyBonus: contract.special === 'early-bonus',
    sky: skyFor({
      seed: options.seed,
      season: options.season,
      scale: options.difficulty === 'hard' ? 1.25 : 1,
    }),
  };
}

/** The roads a contract can take, for the planner. */
export function contractRoutes(contract: Contract): RouteOption[] {
  return routeOptions(contract.from, contract.to);
}

/** "Denver → Atlanta". */
export function contractTitle(contract: Pick<Contract, 'from' | 'to'>): string {
  return `${placeById(contract.from).name} → ${placeById(contract.to).name}`;
}

/** The start-of-trip diesel: as much as the original's terminal sold, or more for a bigger tank. */
export function terminalFuel(rig: RigSpec): number {
  return Math.min(rig.tankGallons - 10, RULES.startFuel + (rig.tankGallons - RULES.tankGallons));
}
