import type { Settlement } from './arrival';
import type { CargoId } from './cargo';
import type { DifficultyId } from './difficulty';
import { originalRoute, returnRoute, type OriginalRouteId } from './original-routes';
import { skyFor } from './living-weather';
import { ORIGINAL_DEADLINE, type Deadline, type TripSetup, type TyreOrder } from './trip';

/**
 * Single Haul is the original game: Los Angeles to New York on one of three
 * routes, or the same road home. Between trips the program kept a running
 * total (XP), a count of trips (XN) and the driver's record (NT); so does
 * this, as a `HaulRecord`.
 */
export type HaulDirection = 'east' | 'west';

/** Monday 8 AM, line 2100: HR 0 is DH 8. */
export const SINGLE_HAUL_START_CLOCK = 8;

/**
 * Going home the clock turns back three hours, so the same 77 hours on the
 * road end at 10 AM Thursday in Los Angeles; the late cutoff keeps its 15
 * hours of grace.
 */
export const RETURN_DEADLINE: Deadline = { dueHr: 74, lateHr: 89, spoilAfterDays: 4 };

export interface SingleHaulChoice {
  route: OriginalRouteId;
  direction: HaulDirection;
  cargo: CargoId;
  load: number;
  tyres: TyreOrder;
  seed: number;
  difficulty: DifficultyId;
  offences: number;
}

export function singleHaulSetup(choice: SingleHaulChoice): TripSetup {
  const east = choice.direction === 'east';
  return {
    route: east ? originalRoute(choice.route) : returnRoute(choice.route),
    cargo: choice.cargo,
    load: choice.load,
    tyres: choice.tyres,
    seed: choice.seed,
    difficulty: choice.difficulty,
    startClock: SINGLE_HAUL_START_CLOCK,
    deadline: east ? ORIGINAL_DEADLINE : RETURN_DEADLINE,
    offences: choice.offences,
    // Weather comes from the original formula; these systems only dress the map.
    sky: skyFor({ seed: choice.seed, season: 'winter' }),
  };
}

export interface HaulRecord {
  /** XN. */
  trips: number;
  /** XP, in cents. */
  totalCents: number;
  /** NT. */
  offences: number;
}

export const FRESH_RECORD: HaulRecord = { trips: 0, totalCents: 0, offences: 0 };

export interface TripVerdict {
  profitCents: number;
  /** "G O O D   W O R K  !!" above $100 (line 5420). */
  goodWork: boolean;
  /** Shown from the second trip on (line 5430). */
  averageCents: number | null;
  /** "You'd make more money washing dishes !" (line 5440). */
  dishes: boolean;
  /** Running total below zero after a losing trip: the rig is repossessed (line 5490). */
  bankrupt: boolean;
}

/** Lines 5400–5490. */
export function judgeTrip(
  record: HaulRecord,
  settlement: Settlement,
  offences: number,
): { record: HaulRecord; verdict: TripVerdict } {
  const profitCents = settlement.profitCents;
  const next: HaulRecord = {
    trips: record.trips + 1,
    totalCents: record.totalCents + profitCents,
    offences,
  };
  const average = next.totalCents / next.trips;
  return {
    record: next,
    verdict: {
      profitCents,
      goodWork: profitCents > 10_000,
      averageCents: next.trips > 1 ? Math.round(average) : null,
      dishes: profitCents < 20_000 || average < 25_000,
      bankrupt: profitCents < 0 && next.totalCents < 0,
    },
  };
}
