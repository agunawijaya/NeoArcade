import { describe, expect, it } from 'vitest';
import { PLACES } from '../data/places';
import { originalFatigueOf, fatigueOf } from './conditions';
import { MIDDLE_TABLE, NORTH_TABLE, ORIGINAL_TABLES, SOUTH_TABLE } from './original-data';
import {
  decodeCode,
  ORIGINAL_ROUTE_IDS,
  originalRoute,
  returnRoute,
  TABLE_CORRECTIONS,
} from './original-routes';
import { countEvents, knownTolls, type Route } from './route';
import { gallonsPerHour, milesPerGallon, speedCap } from './rules';

/** The tables and formulas of the original listing, checked line by line. */
describe('the DATA tables', () => {
  it('have the counts and lengths the program READs', () => {
    expect(ORIGINAL_TABLES.map((table) => [table.count, table.miles])).toEqual([
      [21, 2850],
      [18, 2710],
      [25, 3120],
    ]);
    for (const table of ORIGINAL_TABLES) {
      expect(table.waypoints).toHaveLength(table.count);
      expect(table.waypoints.at(-1)?.[0]).toBe(9999);
    }
  });

  it('keep the original spellings, typos included', () => {
    const names = ORIGINAL_TABLES.flatMap((table) => table.waypoints.map((row) => row[1]));
    expect(names).toContain('Demoines');
    expect(names).toContain('New Lersey border');
    expect(names).toContain('East Stroudsberg');
    expect(MIDDLE_TABLE.waypoints[2]).toEqual([440, 'Flagstaff', 'I-40 in California', 3.65]);
  });

  it('put every waypoint in ascending order', () => {
    for (const table of ORIGINAL_TABLES) {
      const miles = table.waypoints.map((row) => row[0]);
      expect([...miles].sort((a, b) => a - b)).toEqual(miles);
    }
  });
});

describe('decodeCode', () => {
  it('reads the whole part as the event and the fraction as odds or toll', () => {
    expect(decodeCode(0)).toEqual([]);
    expect(decodeCode(1)).toEqual([{ kind: 'time-zone', hours: 1 }]);
    expect(decodeCode(2.65)).toEqual([{ kind: 'toll', cents: 6_500 }]);
    expect(decodeCode(2.4)).toEqual([{ kind: 'toll', cents: 4_000 }]);
    expect(decodeCode(3.65)).toEqual([{ kind: 'construction', chance: 0.35 }]);
    expect(decodeCode(4.25)).toEqual([{ kind: 'radar', chance: 0.75 }]);
    expect(decodeCode(5.5)).toEqual([{ kind: 'weigh-station', chance: 0.5 }]);
    expect(decodeCode(6.75)).toEqual([
      { kind: 'rock-slide', chance: 0.25, where: 'Allegheny Mountain Tunnel' },
    ]);
    // 7.8 − 7 is 0.7999… in floating point; the odds are still exactly 0.2.
    expect(decodeCode(7.8)).toEqual([{ kind: 'reefer', chance: 0.2 }]);
  });

  it('gives a whole 5 its coin toss and the Louisiana rule', () => {
    const [scale] = decodeCode(5);
    expect(scale).toMatchObject({ kind: 'weigh-station', chance: 0.5 });
    expect(scale?.kind === 'weigh-station' && scale.barrier).toEqual({
      state: 'Louisiana',
      detourMiles: 200,
      via: 'Arkansas county roads',
      limit: 45,
    });
  });
});

const timeZoneHours = (route: Route) =>
  route.stops.reduce(
    (sum, stop) =>
      sum +
      stop.events.reduce(
        (hours, event) => hours + (event.kind === 'time-zone' ? event.hours : 0),
        0,
      ),
    0,
  );

describe('the original routes', () => {
  it('go from Los Angeles to New York at the right length, factor and fine base', () => {
    const routes = ORIGINAL_ROUTE_IDS.map(originalRoute);
    expect(routes.map((route) => [route.id, route.miles, route.factor, route.fineBase])).toEqual([
      ['north', 2710, 4, 1],
      ['middle', 2850, 2, 0],
      ['south', 3120, 1, 2],
    ]);
    for (const route of routes) {
      expect(route.from).toBe('los-angeles');
      expect(route.to).toBe('new-york');
      expect(route.stops.at(-1)).toMatchObject({ place: 'new-york', mile: route.miles });
      for (const stop of route.stops) expect(PLACES.has(stop.place), stop.place).toBe(true);
    }
  });

  it('carry the corrections, and list every one of them', () => {
    const middle = originalRoute('middle');
    const north = originalRoute('north');
    const south = originalRoute('south');
    expect(middle.stops[2]).toMatchObject({ name: 'Flagstaff', road: 'I-40 in Arizona' });
    expect(middle.stops.at(-2)?.road).toBe('New Jersey Turnpike');
    expect(north.stops.map((stop) => stop.name)).toEqual(
      expect.arrayContaining(['Des Moines', 'East Stroudsburg', 'George Washington Bridge']),
    );
    expect(south.stops.map((stop) => stop.name)).toEqual(
      expect.arrayContaining(['South Carolina border', 'New Jersey border']),
    );
    const roads = [middle, north, south].flatMap((route) => route.stops.map((stop) => stop.road));
    expect(roads.some((road) => road.includes('Indianna'))).toBe(false);
    expect(TABLE_CORRECTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('set the clock ahead three hours on every route', () => {
    for (const id of ORIGINAL_ROUTE_IDS) expect(timeZoneHours(originalRoute(id)), id).toBe(3);
    const north = originalRoute('north');
    const zoneStops = north.stops.filter((stop) =>
      stop.events.some((event) => event.kind === 'time-zone'),
    );
    expect(zoneStops.map((stop) => stop.place)).toEqual(['ut-border-i15', 'ne-border-i76', 'gary']);
    const southZones = originalRoute('south')
      .stops.filter((stop) => stop.events.some((event) => event.kind === 'time-zone'))
      .map((stop) => stop.place);
    expect(southZones).toEqual(['blythe', 'pecos', 'ga-border-i20']);
  });

  it('keep the tolls of the tables', () => {
    expect(knownTolls(originalRoute('middle'))).toBe((65 + 40 + 95 + 40) * 100);
    expect(knownTolls(originalRoute('north'))).toBe((50 + 45 + 80 + 20) * 100);
    expect(knownTolls(originalRoute('south'))).toBe((30 + 25 + 40) * 100);
    expect(countEvents(originalRoute('middle'), 'rock-slide')).toBe(1);
  });
});

describe('the road home', () => {
  it('counts the miles from New York and ends in Los Angeles', () => {
    for (const id of ORIGINAL_ROUTE_IDS) {
      const route = returnRoute(id);
      expect(route.from).toBe('new-york');
      expect(route.to).toBe('los-angeles');
      const miles = route.stops.map((stop) => stop.mile);
      expect([...miles].sort((a, b) => a - b)).toEqual(miles);
      expect(route.stops.at(-1)).toMatchObject({ place: 'los-angeles', mile: route.miles });
      expect(timeZoneHours(route), id).toBe(-3);
    }
  });

  it('reaches each stop by the road that left it going east', () => {
    const route = returnRoute('middle');
    expect(route.stops[0]).toMatchObject({ place: 'holland-tunnel', road: 'New York streets' });
    expect(route.stops.at(-1)).toMatchObject({ place: 'los-angeles', road: 'I-15 in California' });
    const barstow = route.stops.find((stop) => stop.place === 'barstow');
    expect(barstow?.road).toBe('I-40 in California');
  });

  it('moves the westbound scale, slide and free Hudson crossings', () => {
    const south = returnRoute('south');
    const vicksburg = south.stops.find((stop) => stop.place === 'vicksburg');
    const border = south.stops.find((stop) => stop.place === 'la-border-i20');
    expect(vicksburg?.events.some((event) => event.kind === 'weigh-station' && event.barrier)).toBe(
      true,
    );
    expect(border?.events).toEqual([]);
    expect(south.stops[0]?.events).toEqual([]);
    const middle = returnRoute('middle');
    expect(
      middle.stops.find((stop) => stop.place === 'harrisburg')?.events.map((e) => e.kind),
    ).toEqual(['construction', 'rock-slide']);
    expect(middle.stops.find((stop) => stop.place === 'new-stanton')?.events).toEqual([]);
    expect(returnRoute('north').stops[0]).toMatchObject({
      place: 'george-washington-bridge',
      events: [],
    });
  });
});

describe('the formulas', () => {
  it('give the best mileage at 55 and the worst from 13 mph away', () => {
    expect(milesPerGallon(55)).toBe(4.5);
    expect(milesPerGallon(65)).toBeCloseTo(2.5);
    expect(milesPerGallon(67)).toBeCloseTo(2.1);
    expect(milesPerGallon(68)).toBe(2);
    expect(milesPerGallon(20)).toBe(2);
    expect(gallonsPerHour(55)).toBeCloseTo(12.22, 2);
    expect(gallonsPerHour(80)).toBe(40);
  });

  it('let the old rig do one and a half times the limit', () => {
    expect(speedCap(55)).toBe(82);
    expect(speedCap(45)).toBe(67);
    expect(speedCap(35)).toBe(52);
  });

  it('judge fatigue by the ratio the cosine was hiding', () => {
    // Three hours awake after a trip spent mostly awake: bored, where the original said rested.
    expect(fatigueOf(3, 72, 24)).toBe('bored');
    expect(originalFatigueOf(3, 72, 24)).toBe('rested');
    expect(fatigueOf(3, 10, 7)).toBe('rested');
    expect(fatigueOf(6, 16, 7)).toBe('fine');
    expect(fatigueOf(10, 20, 7)).toBe('bored');
    expect(fatigueOf(14, 21, 7)).toBe('tired');
    expect(fatigueOf(17, 21, 7)).toBe('fatigued');
    expect(fatigueOf(20, 21, 7)).toBe('exhausted');
    expect(fatigueOf(2, 29, 7)).toBe('exhausted');
  });
});

describe('the routes, end to end', () => {
  it('line up with the tables mile for mile', () => {
    for (const [route, table] of [
      [originalRoute('middle'), MIDDLE_TABLE],
      [originalRoute('north'), NORTH_TABLE],
      [originalRoute('south'), SOUTH_TABLE],
    ] as const) {
      expect(route.stops.slice(0, -1).map((stop) => stop.mile)).toEqual(
        table.waypoints.slice(0, -1).map((row) => row[0]),
      );
    }
  });
});
