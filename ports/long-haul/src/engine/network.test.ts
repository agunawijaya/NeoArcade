import { describe, expect, it } from 'vitest';
import { CORRIDORS } from '../data/corridors';
import { HUB_IDS, PLACES, placeById } from '../data/places';
import { decodeCode } from './original-routes';
import {
  corridorById,
  corridorRoute,
  joinLegs,
  routeFor,
  routeOptions,
  shortestMiles,
} from './network';
import type { Route } from './route';

/** Great-circle miles between two places, for checking the tables' mileages. */
function crowMiles(a: string, b: string): number {
  const p = placeById(a);
  const q = placeById(b);
  const radians = Math.PI / 180;
  const dLat = (q.lat - p.lat) * radians;
  const dLon = (q.lon - p.lon) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p.lat * radians) * Math.cos(q.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * 3959 * Math.asin(Math.sqrt(h));
}

const zoneHours = (route: Route) =>
  route.stops.reduce(
    (sum, stop) =>
      sum +
      stop.events.reduce(
        (hours, event) => hours + (event.kind === 'time-zone' ? event.hours : 0),
        0,
      ),
    0,
  );

describe('the corridor tables', () => {
  it('join hubs, name known places and count up the miles', () => {
    for (const spec of CORRIDORS) {
      expect(HUB_IDS, spec.id).toContain(spec.from);
      expect(HUB_IDS, spec.id).toContain(spec.to);
      expect(spec.rows.at(-1)?.[1], spec.id).toBe(spec.to);
      let previous = 0;
      for (const [mile, place, , codes] of spec.rows) {
        expect(PLACES.has(place), `${spec.id}: ${place}`).toBe(true);
        expect(mile, `${spec.id}: ${place}`).toBeGreaterThan(previous);
        previous = mile;
        const list = codes === undefined ? [] : typeof codes === 'number' ? [codes] : codes;
        for (const code of list) expect(decodeCode(code).length, `${spec.id}: ${code}`).toBe(1);
      }
    }
  });

  it('have plausible road miles: never shorter than the crow flies, never wildly longer', () => {
    for (const spec of CORRIDORS) {
      let from = spec.from;
      let fromMile = 0;
      for (const [mile, place] of spec.rows) {
        const road = mile - fromMile;
        const crow = crowMiles(from, place);
        expect(road, `${spec.id}: ${from} → ${place}`).toBeGreaterThanOrEqual(crow * 0.97);
        expect(road, `${spec.id}: ${from} → ${place}`).toBeLessThanOrEqual(crow * 1.6 + 25);
        from = place;
        fromMile = mile;
      }
    }
  });

  it('connect every hub to every other', () => {
    for (const from of HUB_IDS) {
      for (const to of HUB_IDS) {
        if (from === to) continue;
        expect(Number.isFinite(shortestMiles(from, to)), `${from} → ${to}`).toBe(true);
      }
    }
  });

  it('give every corridor a sensible length', () => {
    for (const spec of CORRIDORS) {
      const route = corridorRoute(spec);
      expect(route.miles, spec.id).toBeGreaterThan(200);
      expect(route.miles, spec.id).toBeLessThan(1950);
    }
  });
});

describe('routes across the network', () => {
  it('offer a few different ways between distant hubs, shortest first', () => {
    const options = routeOptions('los-angeles', 'new-york');
    expect(options.length).toBeGreaterThanOrEqual(2);
    const miles = options.map((option) => option.miles);
    expect([...miles].sort((a, b) => a - b)).toEqual(miles);
    expect(miles[0]).toBeGreaterThan(2500);
    expect(miles[0]).toBeLessThan(3200);
  });

  it('set the clocks by the map: three hours ahead coast to coast, back again going west', () => {
    const [east] = routeOptions('los-angeles', 'new-york');
    const [west] = routeOptions('new-york', 'los-angeles');
    if (!east || !west) throw new Error('No route found.');
    expect(zoneHours(routeFor(east))).toBe(3);
    expect(zoneHours(routeFor(west))).toBe(-3);
    const [short] = routeOptions('dallas', 'houston');
    if (!short) throw new Error('No route found.');
    expect(zoneHours(routeFor(short))).toBe(0);
  });

  it('name state lines for the state ahead, whichever way', () => {
    const north = joinLegs([{ corridor: 'i80-east', direction: 'forward' }]);
    const back = joinLegs([{ corridor: 'i80-east', direction: 'backward' }]);
    expect(north.stops.find((stop) => stop.place === 'oh-border-i80')?.name).toBe('Ohio border');
    expect(back.stops.find((stop) => stop.place === 'oh-border-i80')?.name).toBe('Indiana border');
  });

  it('take Hudson tolls only into New York', () => {
    const into = joinLegs([{ corridor: 'i95-northeast', direction: 'forward' }]);
    const out = joinLegs([{ corridor: 'i95-northeast', direction: 'backward' }]);
    const tolls = (route: Route, place: string) =>
      route.stops
        .find((stop) => stop.place === place)
        ?.events.filter((event) => event.kind === 'toll').length;
    expect(tolls(into, 'holland-tunnel')).toBe(1);
    expect(tolls(out, 'holland-tunnel')).toBe(0);
  });

  it('join corridors at their hub with continuous miles', () => {
    const route = joinLegs([
      { corridor: 'i45', direction: 'backward' },
      { corridor: 'i30-i40', direction: 'forward' },
    ]);
    const first = corridorRoute(corridorById('i45')).miles;
    const second = corridorRoute(corridorById('i30-i40')).miles;
    expect(route.from).toBe('houston');
    expect(route.to).toBe('memphis');
    expect(route.miles).toBe(first + second);
    expect(route.stops.find((stop) => stop.place === 'dallas')?.mile).toBe(first);
    expect(route.stops.at(-1)).toMatchObject({ place: 'memphis', mile: first + second });
  });
});
