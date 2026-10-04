import { placeById } from '../data/places';
import type { Route } from './route';

/**
 * Where on the map a milepost is: a straight line between the places on
 * either side of it. Plenty for weather and the map's pin; the road between
 * two towns is never far from that line.
 */
export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * `stopMiles(i)` gives each stop's milepost on this trip, so a detour that
 * lengthened the road stretches the line instead of moving the towns.
 */
export function pointAlong(
  route: Route,
  mile: number,
  stopMiles: (index: number) => number = (index) => route.stops[index]?.mile ?? route.miles,
): LatLon {
  let fromPlace = placeById(route.from);
  let fromMile = 0;
  for (let index = 0; index < route.stops.length; index++) {
    const stop = route.stops[index];
    if (!stop) break;
    const toPlace = placeById(stop.place);
    const toMile = stopMiles(index);
    if (mile <= toMile) {
      const span = toMile - fromMile;
      const t = span > 0 ? Math.max(0, (mile - fromMile) / span) : 1;
      return {
        lat: fromPlace.lat + (toPlace.lat - fromPlace.lat) * t,
        lon: fromPlace.lon + (toPlace.lon - fromPlace.lon) * t,
      };
    }
    fromPlace = toPlace;
    fromMile = toMile;
  }
  return { lat: fromPlace.lat, lon: fromPlace.lon };
}

/** Index of the stop a milepost leads to: the first one not yet reached. */
export function legIndexAt(stopMiles: readonly number[], mile: number): number {
  const index = stopMiles.findIndex((stopMile) => mile < stopMile);
  return index === -1 ? stopMiles.length - 1 : index;
}
