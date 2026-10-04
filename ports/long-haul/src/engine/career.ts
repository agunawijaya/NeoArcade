import type { CargoId } from './cargo';
import { jobBoard, type Contract } from './contracts';
import type { DifficultyId } from './difficulty';
import { seasonOfMonth, type Season } from './living-weather';
import { STOCK_RIG, type RigSpec } from './rig';
import { RULES } from './rules';
import { streamFor } from './streams';
import { expensesTotal, type Trip } from './trip';

/**
 * A career is a run of contracts in the same old rig: profits carry over,
 * the rig can be improved, shippers learn your name, and the seasons turn.
 * It ends the way the original game ended a trip: a crash takes the truck, a
 * fourth offence takes the licence, and a balance below zero takes the rig.
 */
export interface Upgrade {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** The catch, where there is one. */
  finePrint?: string;
  cents: number;
}

export type UpgradeId = 'tank' | 'engine' | 'sleeper' | 'reefer' | 'tyres' | 'detector';

export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'tank',
    name: 'Saddle tanks',
    blurb: '300 gallons instead of 200: a hundred more gallons to run on between stops.',
    cents: 150_000,
  },
  {
    id: 'engine',
    name: 'Fuel-saver engine',
    blurb: 'A rebuilt diesel that burns 15 % less at any speed.',
    cents: 450_000,
  },
  {
    id: 'sleeper',
    name: 'Sleeper cab',
    blurb: 'Insulated, curtained, quiet: daytime sleep counts in full, without a motel.',
    cents: 250_000,
  },
  {
    id: 'reefer',
    name: 'Reliable reefer unit',
    blurb: 'A new refrigeration unit that fails a third as often.',
    cents: 120_000,
  },
  {
    id: 'tyres',
    name: 'Radial tyres',
    blurb: 'Better rubber all round: blowouts much rarer from the first mile.',
    cents: 90_000,
  },
  {
    id: 'detector',
    name: 'Radar detector',
    blurb: 'Beeps before a radar trap, so you can ease off in time.',
    finePrint:
      'Illegal in Virginia and Washington, D.C.: get pulled over there and it costs you $75.',
    cents: 25_000,
  },
];

export function upgradeById(id: UpgradeId): Upgrade {
  const upgrade = UPGRADES.find((candidate) => candidate.id === id);
  if (!upgrade) throw new Error(`Unknown upgrade "${id}".`);
  return upgrade;
}

export function rigWith(upgrades: readonly UpgradeId[]): RigSpec {
  const has = (id: UpgradeId) => upgrades.includes(id);
  return {
    tankGallons: has('tank') ? 300 : STOCK_RIG.tankGallons,
    economy: has('engine') ? 0.85 : 1,
    sleeper: has('sleeper') ? 'sleeper-cab' : 'bunk',
    reeferOdds: has('reefer') ? 0.35 : 1,
    tyreWear: has('tyres') ? 6 : STOCK_RIG.tyreWear,
    radarDetector: has('detector'),
  };
}

export interface CareerTrip {
  contract: string;
  from: string;
  to: string;
  cargo: CargoId;
  goods: string;
  /** Career day it departed. */
  day: number;
  miles: number;
  outcome: 'delivered' | 'crashed' | 'jailed';
  payCents: number;
  profitCents: number;
  late: boolean;
  spoiled: boolean;
  damage: number;
  hours: number;
  tickets: number;
}

export type CareerStatus = 'active' | 'repossessed' | 'wrecked' | 'jailed' | 'retired';

export interface Career {
  version: 1;
  seed: number;
  difficulty: DifficultyId;
  /** Days since Monday 1 March 1982, the first morning. */
  day: number;
  hub: string;
  cashCents: number;
  /** 0–100: what shippers think of you. */
  reputation: number;
  /** The rig's odometer; it was not new. */
  odometer: number;
  /** Career day of each offence still on the record. */
  offenceDays: number[];
  upgrades: UpgradeId[];
  trips: CareerTrip[];
  status: CareerStatus;
  /** Diesel left in the tank, carried to the next load. */
  fuel?: number;
}

export const CAREER_START_CENTS = 100_000;
export const CAREER_START_REPUTATION = 40;
/** Offences drop off the record after this many days. */
export const OFFENCE_MEMORY_DAYS = 60;
export const MILLION = 1_000_000;

export function newCareer(seed: number, difficulty: DifficultyId): Career {
  const rng = streamFor(seed, 'board', 'odometer');
  return {
    version: 1,
    seed: seed >>> 0,
    difficulty,
    day: 0,
    hub: 'los-angeles',
    cashCents: CAREER_START_CENTS,
    reputation: CAREER_START_REPUTATION,
    odometer: 946_000 + rng.int(0, 6_000),
    offenceDays: [],
    upgrades: [],
    trips: [],
    status: 'active',
  };
}

const FIRST_MORNING = Date.UTC(1982, 2, 1);
const DAY_MS = 86_400_000;

/** The calendar date of a career day. */
export function careerDate(day: number): Date {
  return new Date(FIRST_MORNING + day * DAY_MS);
}

/** "Monday, March 1, 1982". */
export function careerDateName(day: number): string {
  return careerDate(day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function careerSeason(day: number): Season {
  return seasonOfMonth(careerDate(day).getUTCMonth());
}

export function activeOffences(career: Career): number {
  return career.offenceDays.filter((day) => career.day - day < OFFENCE_MEMORY_DAYS).length;
}

export function careerRig(career: Career): RigSpec {
  return rigWith(career.upgrades);
}

/** Today's loads at the current hub, the same every time it is looked at. */
export function careerBoard(career: Career): Contract[] {
  return jobBoard({
    rng: streamFor(career.seed, 'board', `${career.day}:${career.hub}`),
    hub: career.hub,
    season: careerSeason(career.day),
    reputation: career.reputation,
  });
}

/** The seed for a contract's trip: fixed by the career, the day and the load. */
export function tripSeed(career: Career, contract: Contract): number {
  return streamFor(career.seed, 'board', `${career.day}:${contract.id}`).int(0, 2_147_483_646);
}

export function canAfford(career: Career, cents: number): boolean {
  return career.cashCents >= cents;
}

export function buyUpgrade(career: Career, id: UpgradeId): Career {
  const upgrade = upgradeById(id);
  if (career.upgrades.includes(id)) throw new Error(`${upgrade.name} is already fitted.`);
  if (!canAfford(career, upgrade.cents))
    throw new Error(`${upgrade.name} costs more than you have.`);
  return {
    ...career,
    cashCents: career.cashCents - upgrade.cents,
    upgrades: [...career.upgrades, id],
  };
}

/** Sitting out a day for a better board still costs the truck's daily $85. */
export function waitADay(career: Career): Career {
  return { ...career, day: career.day + 1, cashCents: career.cashCents - RULES.truckDayCents };
}

/** How a delivery changes what shippers think of you. */
export function reputationChange(trip: Trip, contract: Contract): number {
  const settlement = trip.settlement;
  if (!settlement) return 0;
  if (settlement.spoiled) return -15;
  let change = settlement.late ? -8 : 4;
  if (!settlement.late && contract.special === 'rush') change += 3;
  if (settlement.early) change += 2;
  change -= settlement.damage;
  return change;
}

/**
 * A wreck does not end a career: the insurer pays for the rig, less the
 * deductible, and it spends three days in the shop while the truck payments
 * keep coming. The load is lost, and so is some of your name.
 */
export const WRECK_DEDUCTIBLE_CENTS = 50_000;
export const WRECK_SHOP_DAYS = 3;
export const WRECK_REPUTATION = -20;

/** What a wreck costs on top of the trip's own receipts. */
export function wreckCents(trip: Pick<Trip, 'hr'>): number {
  const daysOnRoad = Math.floor((8 + trip.hr) / 24);
  return WRECK_DEDUCTIBLE_CENTS + RULES.truckDayCents * (daysOnRoad + 1 + WRECK_SHOP_DAYS);
}

/**
 * Closes a contract: the money, the name, the miles and the calendar. A
 * fourth offence ends the career, and so does a balance below zero.
 */
export function finishContract(career: Career, contract: Contract, trip: Trip): Career {
  const tickets = trip.events.filter((event) => event.type === 'pulled-over').length;
  const wrecked = trip.status === 'crashed';
  const lossCents = wrecked ? -(expensesTotal(trip) + wreckCents(trip)) : 0;
  const record: CareerTrip = {
    contract: contract.id,
    from: contract.from,
    to: contract.to,
    cargo: contract.cargo,
    goods: contract.goods,
    day: career.day,
    miles: trip.miles,
    outcome:
      trip.status === 'arrived' ? 'delivered' : trip.status === 'jailed' ? 'jailed' : 'crashed',
    payCents: trip.settlement?.paidCents ?? 0,
    profitCents: trip.settlement?.profitCents ?? lossCents,
    late: trip.settlement?.late ?? false,
    spoiled: trip.settlement?.spoiled ?? false,
    damage: trip.settlement?.damage ?? 0,
    hours: trip.hr,
    tickets,
  };
  const daysOnRoad = Math.floor((8 + trip.hr) / 24);
  const offenceDays = [
    ...career.offenceDays,
    ...trip.events
      .filter((event) => event.type === 'pulled-over' || event.type === 'jailed')
      .map((event) => career.day + Math.floor((8 + event.hr) / 24)),
  ];
  const base: Career = {
    ...career,
    odometer: career.odometer + trip.miles,
    offenceDays,
    trips: [...career.trips, record],
  };
  if (trip.status === 'jailed') return { ...base, status: 'jailed', day: career.day + daysOnRoad };
  if (wrecked) {
    const cashCents = career.cashCents + lossCents;
    return {
      ...base,
      cashCents,
      reputation: Math.max(0, career.reputation + WRECK_REPUTATION),
      // Towed back to the terminal it left from, with an empty tank.
      hub: contract.from,
      fuel: 0,
      day: career.day + daysOnRoad + 1 + WRECK_SHOP_DAYS,
      status: cashCents < 0 ? 'repossessed' : 'active',
    };
  }

  const cashCents = career.cashCents + (trip.settlement?.profitCents ?? 0);
  const fuel = Math.max(0, Math.floor(trip.fuel));
  const reputation = Math.max(
    0,
    Math.min(100, career.reputation + reputationChange(trip, contract)),
  );
  return {
    ...base,
    cashCents,
    reputation,
    hub: contract.to,
    fuel,
    // The next load leaves at 8 AM the day after delivery.
    day: career.day + daysOnRoad + 1,
    status: cashCents < 0 ? 'repossessed' : 'active',
  };
}

export interface CareerSummary {
  trips: number;
  delivered: number;
  miles: number;
  profitCents: number;
  bestTrip: CareerTrip | null;
  days: number;
  hubsVisited: number;
}

export function summarise(career: Career): CareerSummary {
  const delivered = career.trips.filter((trip) => trip.outcome === 'delivered');
  const best = delivered.reduce<CareerTrip | null>(
    (top, trip) => (top === null || trip.profitCents > top.profitCents ? trip : top),
    null,
  );
  const hubs = new Set(career.trips.flatMap((trip) => [trip.from, trip.to]));
  return {
    trips: career.trips.length,
    delivered: delivered.length,
    miles: career.trips.reduce((sum, trip) => sum + trip.miles, 0),
    profitCents: career.cashCents - CAREER_START_CENTS,
    bestTrip: best,
    days: career.day,
    hubsVisited: hubs.size,
  };
}

/** Rebuilds a stored career, or null when it is missing or damaged. */
export function sanitiseCareer(raw: unknown): Career | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const stored = raw as Partial<Career>;
  if (stored.version !== 1) return null;
  const numbers = [stored.seed, stored.day, stored.cashCents, stored.reputation, stored.odometer];
  if (numbers.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return null;
  if (typeof stored.hub !== 'string' || !Array.isArray(stored.trips)) return null;
  return stored as Career;
}
