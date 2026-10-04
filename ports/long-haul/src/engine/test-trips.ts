import type { CargoId } from './cargo';
import type { OriginalRouteId } from './original-routes';
import { singleHaulSetup, type HaulDirection } from './single-haul';
import { startTrip } from './start';
import type { Trip, TyreOrder } from './trip';

/** A Single Haul trip for tests, with sensible defaults. */
export function testTrip(
  options: {
    route?: OriginalRouteId;
    direction?: HaulDirection;
    cargo?: CargoId;
    load?: number;
    tyres?: TyreOrder;
    seed?: number;
    offences?: number;
  } = {},
): Trip {
  return startTrip(
    singleHaulSetup({
      route: options.route ?? 'middle',
      direction: options.direction ?? 'east',
      cargo: options.cargo ?? 'freight',
      load: options.load ?? 38_000,
      tyres: options.tyres ?? { kind: 'none' },
      seed: options.seed ?? 1982,
      difficulty: 'normal',
      offences: options.offences ?? 0,
    }),
  ).trip;
}

/** Makes the next hour's road and driver as safe as the formula allows. */
export function calm(trip: Trip) {
  trip.condition = 'clear';
  trip.fatigue = 'rested';
  trip.tyreWear = 0;
}
