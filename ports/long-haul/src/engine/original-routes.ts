import type { RegionId } from '../data/regions';
import {
  MIDDLE_TABLE,
  NORTH_TABLE,
  SOUTH_TABLE,
  type OriginalTable,
  type OriginalWaypoint,
} from './original-data';
import { nameBorders, reverseRoute, type Route, type RouteStop, type WaypointEvent } from './route';
import { RULES } from './rules';

/**
 * The original three Los Angeles → New York routes, decoded from the DATA
 * tables, and the same three driven home again.
 */
export type OriginalRouteId = 'north' | 'middle' | 'south';

export const ORIGINAL_ROUTE_IDS: readonly OriginalRouteId[] = ['north', 'middle', 'south'];

/** What a waypoint code means (line 3130: ON INT(ZH) GOSUB …). */
export function decodeCode(code: number): WaypointEvent[] {
  const kind = Math.floor(code);
  // Two decimals is all the tables use; this also cleans up 7.8 - 7 = 0.7999….
  const fraction = Math.round((code - kind) * 100) / 100;
  const odds = roundOdds(1 - fraction);
  switch (kind) {
    case 1:
      return [{ kind: 'time-zone', hours: 1 }];
    case 2:
      return [{ kind: 'toll', cents: Math.round(fraction * 100) * 100 }];
    case 3:
      return [{ kind: 'construction', chance: odds }];
    case 4:
      return [{ kind: 'radar', chance: odds }];
    case 5:
      // Line 3500: a whole 5 is a coin toss, and (line 3580) the Louisiana rule.
      if (fraction === 0) {
        return [
          {
            kind: 'weigh-station',
            chance: 0.5,
            barrier: {
              state: 'Louisiana',
              detourMiles: RULES.detourMiles,
              via: 'Arkansas county roads',
              limit: RULES.detourLimit,
            },
          },
        ];
      }
      return [{ kind: 'weigh-station', chance: odds }];
    case 6:
      return [{ kind: 'rock-slide', chance: odds, where: 'Allegheny Mountain Tunnel' }];
    case 7:
      return [{ kind: 'reefer', chance: odds }];
    default:
      return [];
  }
}

function roundOdds(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A deliberate change to the original tables, kept as data so the docs and tests can list them. */
export interface TableCorrection {
  route: OriginalRouteId;
  /** The waypoint's name as the DATA line spells it. */
  waypoint: string;
  change: string;
  why: string;
}

interface RouteEdit {
  place: string;
  name?: string;
  road?: string;
  region?: RegionId;
  /** Replaces the decoded events. */
  events?: WaypointEvent[];
}

interface TableSpec {
  id: OriginalRouteId;
  table: OriginalTable;
  name: string;
  roads: string;
  /** RH, lines 1365–1375. */
  factor: number;
  /** Per waypoint, in table order, New York included. */
  edits: readonly RouteEdit[];
}

const eastern = (): WaypointEvent => ({ kind: 'time-zone', hours: 1 });

const MIDDLE: TableSpec = {
  id: 'middle',
  table: MIDDLE_TABLE,
  name: 'Middle route',
  roads: 'I-40 · I-44 · I-70',
  factor: 2,
  edits: [
    { place: 'barstow' },
    { place: 'needles' },
    { place: 'flagstaff', road: 'I-40 in Arizona' },
    { place: 'gallup' },
    { place: 'albuquerque' },
    { place: 'tucumcari' },
    { place: 'amarillo' },
    { place: 'ok-border-i40' },
    { place: 'oklahoma-city' },
    { place: 'mo-border-i44' },
    { place: 'st-louis', region: 'ozarks' },
    { place: 'terre-haute' },
    { place: 'indianapolis', road: 'I-70 in Indiana' },
    { place: 'oh-border-i70', road: 'I-70 in Indiana' },
    { place: 'columbus-oh' },
    { place: 'wheeling', name: 'Wheeling' },
    { place: 'new-stanton' },
    { place: 'harrisburg' },
    { place: 'nj-border-pa-tpk' },
    { place: 'holland-tunnel', road: 'New Jersey Turnpike' },
    { place: 'new-york' },
  ],
};

const NORTH: TableSpec = {
  id: 'north',
  table: NORTH_TABLE,
  name: 'Northern route',
  roads: 'I-15 · I-70 · I-80',
  factor: 4,
  edits: [
    { place: 'barstow' },
    { place: 'las-vegas', events: [] },
    { place: 'ut-border-i15', events: [eastern()] },
    { place: 'cove-fort' },
    { place: 'salina-ut' },
    { place: 'grand-junction' },
    { place: 'denver' },
    { place: 'ne-border-i76' },
    { place: 'omaha' },
    { place: 'des-moines', name: 'Des Moines' },
    { place: 'il-border-i80' },
    { place: 'gary', events: [{ kind: 'toll', cents: 5_000 }, eastern()] },
    { place: 'oh-border-i80', road: 'Indiana Turnpike' },
    { place: 'cleveland' },
    { place: 'pa-border-i80' },
    { place: 'east-stroudsburg', name: 'East Stroudsburg' },
    { place: 'george-washington-bridge', name: 'George Washington Bridge' },
    { place: 'new-york' },
  ],
};

const SOUTH: TableSpec = {
  id: 'south',
  table: SOUTH_TABLE,
  name: 'Southern route',
  roads: 'I-10 · I-20 · I-85 · I-95',
  factor: 1,
  edits: [
    { place: 'palm-springs' },
    { place: 'blythe' },
    { place: 'phoenix' },
    { place: 'tucson' },
    { place: 'lordsburg' },
    { place: 'el-paso' },
    { place: 'pecos' },
    { place: 'odessa' },
    { place: 'abilene' },
    { place: 'dallas' },
    { place: 'la-border-i20' },
    { place: 'vicksburg' },
    { place: 'al-border-i20', events: [] },
    { place: 'birmingham' },
    { place: 'ga-border-i20', events: [eastern()] },
    { place: 'atlanta' },
    { place: 'sc-border-i85', name: 'South Carolina border' },
    { place: 'greensboro', road: 'I-85 in the Carolinas' },
    { place: 'va-border-i85' },
    { place: 'richmond' },
    { place: 'washington-dc', name: 'Washington, D.C.' },
    { place: 'baltimore' },
    { place: 'nj-border-i95', name: 'New Jersey border' },
    { place: 'holland-tunnel' },
    { place: 'new-york' },
  ],
};

const SPECS: Readonly<Record<OriginalRouteId, TableSpec>> = {
  north: NORTH,
  middle: MIDDLE,
  south: SOUTH,
};

/** Every change made to the tables, for docs/games/long-haul.md and the tests. */
export const TABLE_CORRECTIONS: readonly TableCorrection[] = [
  {
    route: 'middle',
    waypoint: 'Flagstaff',
    change: 'road "I-40 in California" → "I-40 in Arizona"',
    why: 'Flagstaff is in Arizona.',
  },
  {
    route: 'middle',
    waypoint: 'Indianapolis, Ohio border',
    change: '"Indianna" → "Indiana"',
    why: 'Spelling.',
  },
  {
    route: 'middle',
    waypoint: 'Holland Tunnel',
    change: 'road "I-70 in New Jersey" → "New Jersey Turnpike"',
    why: 'I-70 never reaches New Jersey; the turnpike leads to the tunnel, as on the southern route.',
  },
  {
    route: 'north',
    waypoint: 'Demoines',
    change: '→ "Des Moines"',
    why: 'Spelling.',
  },
  {
    route: 'north',
    waypoint: 'Ohio border',
    change: 'road "Indianna Turnpike" → "Indiana Turnpike"',
    why: 'Spelling.',
  },
  {
    route: 'north',
    waypoint: 'East Stroudsberg',
    change: '→ "East Stroudsburg"',
    why: 'Spelling.',
  },
  {
    route: 'north',
    waypoint: 'Washington Bridge',
    change: '→ "George Washington Bridge"',
    why: 'Its name.',
  },
  {
    route: 'north',
    waypoint: 'Las Vegas → Utah border',
    change: 'the Mountain time change moves from Las Vegas to the Utah border',
    why: 'Las Vegas keeps Pacific time.',
  },
  {
    route: 'north',
    waypoint: 'Gary',
    change: 'adds the Eastern time change (the toll stays)',
    why: 'The northern route never set the clock to Eastern time, so it arrived an hour behind the other two.',
  },
  {
    route: 'south',
    waypoint: 'Alabama border → Georgia border',
    change: 'the Eastern time change moves to the Georgia border',
    why: 'Mississippi and Alabama share Central time; Georgia keeps Eastern.',
  },
  {
    route: 'south',
    waypoint: 'Carolina border',
    change: '→ "South Carolina border"',
    why: 'Leaving Georgia on I-85, the first Carolina is the South one.',
  },
  {
    route: 'south',
    waypoint: 'Greensboro',
    change: 'road "I-85 in Carolina" → "I-85 in the Carolinas"',
    why: 'The leg crosses both.',
  },
  {
    route: 'south',
    waypoint: 'New Lersey border',
    change: '→ "New Jersey border"',
    why: 'Spelling.',
  },
];

function decodeStop(
  row: OriginalWaypoint,
  edit: RouteEdit,
  isLast: boolean,
  miles: number,
): RouteStop {
  const [mile, name, road, code] = row;
  const stop: RouteStop = {
    place: edit.place,
    name: edit.name ?? name,
    // New York's 9999 only kept the READ loop happy; the trip ends at the route's length.
    mile: isLast ? miles : mile,
    road: edit.road ?? road,
    events: edit.events ?? decodeCode(code),
    code,
  };
  return edit.region ? { ...stop, region: edit.region } : stop;
}

function buildForward(spec: TableSpec): Route {
  const { table } = spec;
  if (spec.edits.length !== table.waypoints.length) {
    throw new Error(`The ${spec.id} route edits do not line up with its table.`);
  }
  return {
    id: spec.id,
    name: spec.name,
    from: 'los-angeles',
    to: 'new-york',
    miles: table.miles,
    factor: spec.factor,
    fineBase: table.index,
    weather: { kind: 'original', profile: spec.id },
    corridors: [],
    stops: table.waypoints.map((row, index) =>
      decodeStop(
        row,
        spec.edits[index] as RouteEdit,
        index === table.waypoints.length - 1,
        table.miles,
      ),
    ),
  };
}

/** The roads each original route follows, for the route cards. */
export function originalRoads(id: OriginalRouteId): string {
  return SPECS[id].roads;
}

export function originalRoute(id: OriginalRouteId): Route {
  return buildForward(SPECS[id]);
}

/**
 * The same route from New York back to Los Angeles. Going west, Louisiana's
 * scale sits where I-20 enters the state at Vicksburg, the Allegheny tunnel
 * comes after Harrisburg, and the Hudson crossings charge nothing: their
 * tolls are taken only on the way into New York.
 */
export function returnRoute(id: OriginalRouteId): Route {
  const forward = buildForward(SPECS[id]);
  const stops = forward.stops.map((stop): RouteStop => {
    const events = stop.events.flatMap((event): WaypointEvent[] => {
      if (event.kind === 'toll' && HUDSON_CROSSINGS.has(stop.place)) {
        return [{ ...event, only: 'forward' }];
      }
      if (event.kind === 'weigh-station' && event.barrier) return [{ ...event, only: 'forward' }];
      if (event.kind === 'rock-slide') return [{ ...event, only: 'forward' }];
      return [event];
    });
    const extra = BACKWARD_EXTRAS[stop.place] ?? [];
    return { ...stop, events: [...events, ...extra] };
  });
  return nameBorders(reverseRoute({ ...forward, stops }, `${id}-return`, forward.name));
}

const HUDSON_CROSSINGS = new Set(['holland-tunnel', 'george-washington-bridge']);

const BACKWARD_EXTRAS: Readonly<Record<string, WaypointEvent[]>> = {
  vicksburg: [
    {
      kind: 'weigh-station',
      chance: 0.5,
      only: 'backward',
      barrier: {
        state: 'Louisiana',
        detourMiles: RULES.detourMiles,
        via: 'Arkansas county roads',
        limit: RULES.detourLimit,
      },
    },
  ],
  harrisburg: [
    { kind: 'rock-slide', chance: 0.25, where: 'Allegheny Mountain Tunnel', only: 'backward' },
  ],
};
