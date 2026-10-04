import { addDays, dailyChallenge } from '@shared/daily';
import { careerBoard, newCareer } from '../engine/career';
import { contractRoutes, contractTrip } from '../engine/contracts';
import { dailyHaul } from '../engine/daily-haul';
import { ORIGINAL_ROUTE_IDS } from '../engine/original-routes';
import { STOCK_RIG } from '../engine/rig';
import { singleHaulSetup } from '../engine/single-haul';
import { startTrip } from '../engine/start';
import type { Trip } from '../engine/trip';
import { DRIVERS, driveTrip } from './drivers';

/**
 * Everything that has to come out the same in every browser, one line per
 * check: whole Single Hauls with each simple driver on each original road both
 * ways, a year of Daily Hauls driven to the end, and a few career boards.
 * The determinism test bundles this file and compares each browser's lines
 * with Node's; a Daily Haul is fair only if they match bit for bit.
 */
export function determinismTrace(): string[] {
  return [...singleHaulTrace(), ...dailyTrace(), ...careerTrace()];
}

/** FNV-1a over the trip's whole record: every event, receipt and hour of the trail. */
export function tripDigest(trip: Trip): string {
  const record = JSON.stringify([
    trip.status,
    trip.hr,
    trip.miles,
    trip.fuel,
    trip.events,
    trip.expenses,
    trip.trail,
    trip.settlement ?? null,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < record.length; index++) {
    hash = Math.imul(hash ^ record.charCodeAt(index), 16777619) >>> 0;
  }
  return `${trip.status} hr ${trip.hr} ${hash.toString(16).padStart(8, '0')}`;
}

function singleHaulTrace(): string[] {
  const lines: string[] = [];
  for (const [name, driver] of Object.entries(DRIVERS)) {
    for (const route of ORIGINAL_ROUTE_IDS) {
      for (const direction of ['east', 'west'] as const) {
        for (let seed = 1; seed <= 4; seed++) {
          const { trip } = startTrip(
            singleHaulSetup({
              route,
              direction,
              cargo: seed % 2 === 0 ? 'oranges' : 'freight',
              load: 38_000,
              tyres: driver.tyres,
              seed: seed * 7919,
              difficulty: seed === 3 ? 'hard' : 'normal',
              offences: 0,
            }),
          );
          driveTrip(trip, driver);
          lines.push(`single ${name} ${route} ${direction} ${seed}: ${tripDigest(trip)}`);
        }
      }
    }
  }
  return lines;
}

function dailyTrace(): string[] {
  const daily = dailyChallenge({ game: 'long-haul', launch: '2026-10-04' });
  return Array.from({ length: 366 }, (_, offset) => {
    const day = daily.forKey(addDays('2026-10-04', offset));
    const haul = dailyHaul(day.seed, day.key);
    const option = contractRoutes(haul.contract)[0];
    if (!option) return `daily ${day.key}: no road`;
    const { trip } = startTrip(
      contractTrip({
        contract: haul.contract,
        option,
        tyres: { kind: 'none' },
        seed: haul.seed,
        difficulty: 'normal',
        season: haul.season,
        offences: 0,
        rig: STOCK_RIG,
      }),
    );
    driveTrip(trip, DRIVERS.balanced);
    return `daily ${day.key}: ${haul.contract.from}-${haul.contract.to} ${haul.contract.payCents} ${tripDigest(trip)}`;
  });
}

function careerTrace(): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const career = { ...newCareer(index * 1013, 'normal'), day: index * 9 };
    return `career ${index}: ${careerBoard(career)
      .map((load) => `${load.to}/${load.cargo}/${load.load}/${load.payCents}/${load.dueHours}`)
      .join(' ')}`;
  });
}
