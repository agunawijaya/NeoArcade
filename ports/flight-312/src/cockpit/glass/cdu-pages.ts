import { referenceSpeeds } from '../../engine/aircraft';
import type { CrewCommand } from '../../engine/crew';
import type { Flight } from '../../engine/flight';
import {
  activeWaypoints,
  lnavGuidance,
  routeWaypoints,
  shownRoute,
  type FmsState,
  type Waypoint,
} from '../../engine/fms';
import { bearingTrue, distanceNm, type LatLon } from '../../engine/geo';
import { toMagnetic, variationAt } from '../../engine/magnetic';
import { STATIONS } from '../../engine/navdata';
import { NAV_BAND } from '../../engine/panel';
import { windAt } from '../../engine/weather';

/**
 * The CDU's pages: what each shows on its fourteen lines, and what a line
 * select key does on it with whatever is in the scratchpad. A page never
 * changes the flight itself: it answers with the crew's commands, a new
 * scratchpad, a message, or another page to show.
 */
export type CduColour = 'white' | 'green' | 'magenta' | 'cyan' | 'amber';

export interface CduText {
  text: string;
  colour?: CduColour;
  small?: boolean;
}

/** One of the six pairs of lines: a small label above, the data below. */
export interface CduRow {
  labelLeft?: string;
  labelCentre?: string;
  labelRight?: string;
  left?: CduText;
  centre?: CduText;
  right?: CduText;
}

export interface CduView {
  title: string;
  /** This page and how many there are, for the "1/2" at the top right. */
  page: [number, number] | null;
  rows: CduRow[];
}

export type CduPageId = 'RTE' | 'LEGS' | 'DEP ARR' | 'TAKEOFF' | 'APPROACH' | 'PROG' | 'NAV RAD';

export interface CduOutcome {
  commands?: CrewCommand[];
  scratchpad?: string;
  message?: string;
  page?: CduPageId;
  pageNumber?: number;
}

export interface CduPage {
  count(flight: Flight): number;
  view(flight: Flight, pageNumber: number): CduView;
  select(
    flight: Flight,
    pageNumber: number,
    side: 'L' | 'R',
    line: number,
    scratchpad: string,
  ): CduOutcome;
}

export const DELETE = 'DELETE';
export const MESSAGES = {
  invalid: 'INVALID ENTRY',
  notInDatabase: 'NOT IN DATA BASE',
  invalidDelete: 'INVALID DELETE',
} as const;

const stationIndex = (ident: string) => STATIONS.findIndex((station) => station.ident === ident);
const fms = (flight: Flight): FmsState | null => flight.fms;
const thousands = (pounds: number) => (pounds / 1000).toFixed(1);
const fmsCommand = (edit: Extract<CrewCommand, { kind: 'fms' }>['edit']): CrewCommand => ({
  kind: 'fms',
  edit,
});

/** A waypoint ident from the scratchpad: a station, or the reason it is not one. */
function stationEntry(scratchpad: string): { station: number } | { message: string } {
  if (!/^[A-Z]{2,5}$/.test(scratchpad)) return { message: MESSAGES.invalid };
  const index = stationIndex(scratchpad);
  return index < 0 ? { message: MESSAGES.notInDatabase } : { station: index };
}

function modTitle(flight: Flight, name: string): string {
  return `${flight.fms?.pending ? 'MOD' : 'ACT'} ${name}`;
}

/** The waypoint LEGS starts from in the route shown, which may be a modification. */
function shownActive(state: FmsState): number {
  const pending = state.pending;
  if (!pending) return state.active;
  if (pending.direct !== null) return pending.direct;
  const station = state.route[state.active];
  if (station !== undefined) {
    const kept = pending.route.indexOf(station);
    return kept >= 0 ? kept : Math.min(state.active, pending.route.length);
  }
  return state.active - state.route.length + pending.route.length;
}

// ——— RTE ———

/** Route legs, the line for one more, and the approach: what the RTE pages list. */
interface RouteLine {
  kind: 'leg' | 'next' | 'approach';
  index: number;
  ident: string;
}

function routeLines(flight: Flight): RouteLine[] {
  const state = fms(flight);
  if (!state) return [];
  const shown = shownRoute(state);
  const lines: RouteLine[] = shown.route.map((station, index) => ({
    kind: 'leg',
    index,
    ident: STATIONS[station]?.ident ?? '',
  }));
  lines.push({ kind: 'next', index: shown.route.length, ident: '' });
  if (shown.approach)
    lines.push({ kind: 'approach', index: -1, ident: `RW${flight.world.ils.runway.ident}` });
  return lines;
}

/** Page one lists three legs under the origin and destination; later pages five each. */
const routeLineAt = (pageNumber: number, line: number) =>
  pageNumber === 1 ? line - 3 : 3 + (pageNumber - 2) * 5 + (line - 1);

const RTE: CduPage = {
  count: (flight) => 1 + Math.max(0, Math.ceil((routeLines(flight).length - 3) / 5)),
  view(flight, pageNumber) {
    const lines = routeLines(flight);
    const rows: CduRow[] = [];
    if (pageNumber === 1) {
      rows.push(
        {
          labelLeft: 'ORIGIN',
          labelRight: 'DEST',
          left: { text: flight.world.departure.airport },
          right: { text: flight.world.destination.airport },
        },
        {
          labelLeft: 'RUNWAY',
          labelRight: 'FLT NO',
          left: { text: `RW${flight.world.departure.ident}` },
          right: { text: '312' },
        },
      );
    }
    const first = pageNumber === 1 ? 3 : 1;
    for (let line = first; line <= 5; line++) {
      const entry = lines[routeLineAt(pageNumber, line)];
      const header = line === first ? { labelLeft: 'VIA', labelRight: 'TO' } : {};
      if (!entry) {
        rows.push({});
        continue;
      }
      if (entry.kind === 'next')
        rows.push({ ...header, left: { text: '-----' }, right: { text: '-----' } });
      else if (entry.kind === 'approach')
        rows.push({
          ...header,
          left: { text: `ILS${flight.world.ils.runway.ident}` },
          right: { text: entry.ident },
        });
      else rows.push({ ...header, left: { text: 'DIRECT' }, right: { text: entry.ident } });
    }
    rows.push({
      left: flight.fms?.pending ? { text: '<ERASE' } : undefined,
      right: { text: 'LEGS>' },
    });
    return { title: modTitle(flight, 'RTE 1'), page: [pageNumber, RTE.count(flight)], rows };
  },
  select(flight, pageNumber, side, line, scratchpad) {
    if (line === 6) {
      if (side === 'R') return { page: 'LEGS', pageNumber: 1 };
      return flight.fms?.pending ? { commands: [fmsCommand({ op: 'erase' })] } : {};
    }
    if (pageNumber === 1 && line < 3) return scratchpad ? { message: MESSAGES.invalid } : {};
    const entry = routeLines(flight)[routeLineAt(pageNumber, line)];
    if (!entry || entry.kind === 'approach') return scratchpad ? { message: MESSAGES.invalid } : {};
    return editRouteLine(entry.kind === 'leg', entry.index, entry.ident, scratchpad);
  },
};

/** An entry on a line of the route: insert before it, delete it, or copy its ident down. */
function editRouteLine(
  existing: boolean,
  index: number,
  ident: string,
  scratchpad: string,
): CduOutcome {
  if (scratchpad === DELETE) {
    if (!existing) return { message: MESSAGES.invalidDelete };
    return { commands: [fmsCommand({ op: 'delete', index })], scratchpad: '' };
  }
  if (!scratchpad) return existing ? { scratchpad: ident } : {};
  const entry = stationEntry(scratchpad);
  if ('message' in entry) return { message: entry.message };
  return {
    commands: [fmsCommand({ op: 'insert', index, station: entry.station })],
    scratchpad: '',
  };
}

// ——— LEGS ———

function legsWaypoints(flight: Flight): { list: Waypoint[]; start: number; routeLength: number } {
  const state = fms(flight);
  if (!state) return { list: [], start: 0, routeLength: 0 };
  const shown = shownRoute(state);
  const list = routeWaypoints(shown.route, shown.approach, flight.world);
  return {
    list,
    start: Math.min(shownActive(state), Math.max(0, list.length - 1)),
    routeLength: shown.route.length,
  };
}

const LEGS: CduPage = {
  count: (flight) => {
    const { list, start } = legsWaypoints(flight);
    return Math.max(1, Math.ceil((list.length - start) / 5));
  },
  view(flight, pageNumber) {
    const { list, start } = legsWaypoints(flight);
    const rows: CduRow[] = [];
    let from: LatLon = flight.readout.position;
    const first = start + (pageNumber - 1) * 5;
    if (first > start) from = list[first - 1]?.position ?? from;
    for (let line = 1; line <= 5; line++) {
      const waypoint = list[first + line - 1];
      if (!waypoint) {
        rows.push(line === 1 || list[first + line - 2] ? { left: { text: '-----' } } : {});
        continue;
      }
      const course = Math.round(
        toMagnetic(bearingTrue(from, waypoint.position), variationAt(from)),
      );
      const miles = distanceNm(from, waypoint.position);
      const active = first + line - 1 === start;
      rows.push({
        labelLeft: `${String(course % 360 || 360).padStart(3, '0')}°`,
        labelCentre: `${miles < 10 ? miles.toFixed(1) : Math.round(miles)}NM`,
        left: {
          text: waypoint.ident,
          colour: active && !flight.fms?.pending ? 'magenta' : 'white',
        },
        right:
          waypoint.altitudeFt !== null
            ? { text: `/${waypoint.altitudeFt}` }
            : { text: '---/-----', small: true },
      });
      from = waypoint.position;
    }
    rows.push({
      left: flight.fms?.pending ? { text: '<ERASE' } : undefined,
      right: { text: 'RTE>' },
    });
    return { title: modTitle(flight, 'RTE 1 LEGS'), page: [pageNumber, LEGS.count(flight)], rows };
  },
  select(flight, pageNumber, side, line, scratchpad) {
    if (line === 6) {
      if (side === 'R') return { page: 'RTE', pageNumber: 1 };
      return flight.fms?.pending ? { commands: [fmsCommand({ op: 'erase' })] } : {};
    }
    if (side === 'R') return scratchpad ? { message: MESSAGES.invalid } : {};
    const { list, start, routeLength } = legsWaypoints(flight);
    const index = start + (pageNumber - 1) * 5 + line - 1;
    const waypoint = list[index];
    const isStation = waypoint !== undefined && index < routeLength;
    if (scratchpad === DELETE) {
      if (!isStation) return { message: MESSAGES.invalidDelete };
      return { commands: [fmsCommand({ op: 'delete', index })], scratchpad: '' };
    }
    if (!scratchpad) return waypoint ? { scratchpad: waypoint.ident } : {};
    // An ident on the first line of the first page is a direct-to.
    if (index === start) {
      const later = list.findIndex((one, at) => at >= start && one.ident === scratchpad);
      if (later >= 0)
        return { commands: [fmsCommand({ op: 'direct', index: later })], scratchpad: '' };
      const entry = stationEntry(scratchpad);
      if ('message' in entry) return { message: entry.message };
      const at = Math.min(start, routeLength);
      return {
        commands: [
          fmsCommand({ op: 'insert', index: at, station: entry.station }),
          fmsCommand({ op: 'direct', index: at }),
        ],
        scratchpad: '',
      };
    }
    const entry = stationEntry(scratchpad);
    if ('message' in entry) return { message: entry.message };
    return {
      commands: [
        fmsCommand({ op: 'insert', index: Math.min(index, routeLength), station: entry.station }),
      ],
      scratchpad: '',
    };
  },
};

// ——— DEP ARR ———

const DEP_ARR: CduPage = {
  count: () => 1,
  view(flight) {
    const state = fms(flight);
    const shown = state ? shownRoute(state) : null;
    const marker = shown?.approach ? (state?.pending ? '<SEL> ' : '<ACT> ') : '';
    const runway = flight.world.ils.runway.ident;
    return {
      title: `${flight.world.destination.airport} ARRIVALS`,
      page: [1, 1],
      rows: [
        {
          labelLeft: 'STARS',
          labelRight: 'APPROACHES',
          left: { text: '-NONE-', small: true },
          right: {
            text: `${marker}ILS${runway}`,
            colour: shown?.approach && !state?.pending ? 'green' : 'white',
          },
        },
        { labelRight: 'RUNWAYS', right: { text: runway, small: true } },
        {},
        {},
        {},
        { left: state?.pending ? { text: '<ERASE' } : undefined, right: { text: 'ROUTE>' } },
      ],
    };
  },
  select(flight, _pageNumber, side, line, scratchpad) {
    const state = fms(flight);
    if (!state) return {};
    if (line === 6) {
      if (side === 'R') return { page: 'RTE', pageNumber: 1 };
      return state.pending ? { commands: [fmsCommand({ op: 'erase' })] } : {};
    }
    if (scratchpad) return { message: MESSAGES.invalid };
    if (line === 1 && side === 'R')
      return { commands: [fmsCommand({ op: 'approach', loaded: !shownRoute(state).approach })] };
    return {};
  },
};

// ——— INIT REF: takeoff and approach ———

const TAKEOFF: CduPage = {
  count: () => 1,
  view(flight) {
    const state = fms(flight);
    const flaps = state?.takeoffFlaps ?? 10;
    const weight = flight.readout.weightLb;
    const speeds = referenceSpeeds(weight, flaps);
    const accepted = state?.takeoffSpeeds;
    // Speeds the computer offers are small; once accepted they are large, and on the airspeed tape.
    const speed = (value: number, set: number | undefined) =>
      set !== undefined ? { text: `${set}KT` } : { text: `${value}>`, small: true };
    return {
      title: 'TAKEOFF REF',
      page: [1, 2],
      rows: [
        {
          labelLeft: 'FLAPS',
          labelRight: 'V1',
          left: { text: `${flaps}°` },
          right: speed(speeds.v1, accepted?.v1),
        },
        {
          labelLeft: 'E/O ACCEL HT',
          labelRight: 'VR',
          left: { text: '1000FT', small: true },
          right: speed(speeds.vr, accepted?.vr),
        },
        {
          labelLeft: 'THR REDUCTION',
          labelRight: 'V2',
          left: { text: '1500FT', small: true },
          right: speed(speeds.v2, accepted?.v2),
        },
        { labelLeft: 'GR WT', left: { text: thousands(weight) } },
        { labelLeft: 'FUEL', left: { text: thousands(flight.readout.fuelLb) } },
        {
          left: { text: '<APPR REF' },
          right: accepted ? { text: 'SET', colour: 'green' } : { text: 'ACCEPT>' },
        },
      ],
    };
  },
  select(_flight, _pageNumber, side, line, scratchpad) {
    if (side === 'L' && line === 6) return { page: 'APPROACH', pageNumber: 2 };
    if (side === 'L' && line === 1) {
      if (!scratchpad) return {};
      const flaps = Number(scratchpad);
      if (flaps !== 10 && flaps !== 20) return { message: MESSAGES.invalid };
      return { commands: [fmsCommand({ op: 'takeoffFlaps', flaps })], scratchpad: '' };
    }
    if (side === 'R' && (line <= 3 || line === 6))
      return scratchpad
        ? { message: MESSAGES.invalid }
        : { commands: [fmsCommand({ op: 'acceptTakeoffSpeeds' })] };
    return scratchpad ? { message: MESSAGES.invalid } : {};
  },
};

const APPROACH: CduPage = {
  count: () => 1,
  view(flight) {
    const state = fms(flight);
    const weight = flight.readout.weightLb;
    const vref = (flaps: number) => referenceSpeeds(weight, 10, flaps).vref;
    return {
      title: 'APPROACH REF',
      page: [2, 2],
      rows: [
        {
          labelLeft: 'GROSS WT',
          labelRight: 'FLAPS    VREF',
          left: { text: thousands(weight) },
          right: { text: `25°  ${vref(25)}KT` },
        },
        { right: { text: `30°  ${vref(30)}KT` } },
        {},
        {
          labelRight: 'FLAP/SPD',
          right:
            state?.vref != null
              ? { text: `${state.landingFlaps}/${state.vref}`, colour: 'green' }
              : { text: '□□/□□□', colour: 'amber' },
        },
        {},
        { left: { text: '<TAKEOFF' } },
      ],
    };
  },
  select(_flight, _pageNumber, side, line, scratchpad) {
    if (side === 'L' && line === 6) return { page: 'TAKEOFF', pageNumber: 1 };
    if (side === 'R' && (line === 1 || line === 2)) {
      if (scratchpad) return { message: MESSAGES.invalid };
      const flaps = line === 1 ? 25 : 30;
      return {
        commands: [fmsCommand({ op: 'landingFlaps', flaps }), fmsCommand({ op: 'acceptVref' })],
      };
    }
    return scratchpad ? { message: MESSAGES.invalid } : {};
  },
};

// ——— PROG ———

/** The flight's clock is Eastern Standard Time; the computer keeps Greenwich, five hours on. */
function zulu(localSeconds: number): string {
  const seconds = (((localSeconds + 5 * 3600) % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(seconds / 3600);
  const minutes = (seconds % 3600) / 60;
  return `${String(hours).padStart(2, '0')}${minutes.toFixed(1).padStart(4, '0')}z`;
}

const PROG: CduPage = {
  count: () => 1,
  view(flight) {
    const state = fms(flight);
    const r = flight.readout;
    const now = flight.clockStart + flight.time;
    const speed = Math.max(r.groundSpeedKt, 120);
    const list = state ? activeWaypoints(state, flight.world) : [];
    const active = state ? Math.min(state.active, list.length - 1) : 0;
    const guidance = state ? lnavGuidance(state, list, r.position) : null;
    const to = list[active];
    const next = list[active + 1];
    // Distances along the route: to the active waypoint, then leg by leg.
    const toGo = guidance?.toGoNm ?? (to ? distanceNm(r.position, to.position) : 0);
    const toNext = next && to ? toGo + distanceNm(to.position, next.position) : null;
    let toDestination = toGo;
    for (let index = active + 1; index < list.length; index++)
      toDestination += distanceNm(
        (list[index - 1] as Waypoint).position,
        (list[index] as Waypoint).position,
      );
    if (!list.length) toDestination = distanceNm(r.position, flight.world.ils.runway.threshold);
    const eta = (miles: number) => zulu(now + (miles / speed) * 3600);
    // Climbing or on the ground the engines burn far more than the cruise will: plan on a cruise burn.
    const flowing = r.engines.reduce((sum, engine) => sum + engine.fuelFlow, 0);
    const burn = r.onGround || r.verticalSpeedFpm > 500 ? CRUISE_BURN_LB_PER_HOUR : flowing;
    const fuelAtDestination = r.fuelLb - burn * (toDestination / speed);
    const wind = windAt(flight.world.weather, r.position, r.altitudeFt);
    const crossTrack = guidance?.crossTrackNm ?? 0;
    const from = active > 0 ? list[active - 1]?.ident : flight.world.departure.airport;
    return {
      title: 'PROGRESS',
      page: [1, 1],
      rows: [
        { labelLeft: 'FROM', left: { text: from ?? '' } },
        {
          labelLeft: 'TO',
          labelCentre: 'DTG',
          labelRight: 'ETA',
          left: { text: to?.ident ?? '-----', colour: 'magenta' },
          centre: { text: String(Math.round(toGo)) },
          right: { text: eta(toGo) },
        },
        {
          labelLeft: 'NEXT',
          left: { text: next?.ident ?? '-----' },
          centre: { text: toNext === null ? '' : String(Math.round(toNext)) },
          right: { text: toNext === null ? '' : eta(toNext) },
        },
        {
          labelLeft: 'DEST',
          labelRight: 'FUEL',
          left: { text: flight.world.destination.airport },
          centre: { text: String(Math.round(toDestination)) },
          right: { text: thousands(Math.max(0, fuelAtDestination)) },
        },
        {
          labelLeft: 'WIND',
          labelRight: 'XTK ERROR',
          left: {
            text: `${String(Math.round(wind.direction) % 360 || 360).padStart(3, '0')}°/${Math.round(wind.speedKt)}`,
          },
          right: { text: `${crossTrack >= 0 ? 'R' : 'L'} ${Math.abs(crossTrack).toFixed(1)}NM` },
        },
        {
          labelLeft: 'TAS',
          labelRight: 'GS',
          left: { text: `${Math.round(r.tasKt)}KT` },
          right: { text: `${Math.round(r.groundSpeedKt)}KT` },
        },
      ],
    };
  },
  select: (_flight, _pageNumber, _side, _line, scratchpad) =>
    scratchpad ? { message: MESSAGES.invalid } : {},
};

// ——— NAV RAD ———

/** About what the four engines burn an hour in the cruise, for the estimate of the fuel at the destination. */
const CRUISE_BURN_LB_PER_HOUR = 24_000;

const FREQUENCY = /^(\d{3}(?:\.\d{1,2})?)(?:\/(\d{1,3}))?$/;
const COURSE = /^\/?(\d{1,3})$/;

function radioText(frequency: number): string {
  const station = STATIONS.find((one) => Math.abs(one.frequency - frequency) < 0.005);
  return `${frequency.toFixed(2)}M${station ? ` ${station.ident}` : ''}`;
}

const NAV_RAD: CduPage = {
  count: () => 1,
  view(flight) {
    const panel = flight.panel;
    const course = (radio: 0 | 1) =>
      String(Math.round(panel.nav[radio].course) % 360 || 360).padStart(3, '0');
    const destination = flight.world.destination;
    const runwayCourse = Math.round(
      toMagnetic(
        flight.world.ils.runway.headingTrue,
        variationAt(flight.world.ils.runway.threshold),
      ),
    );
    const ilsTuned = Math.abs(panel.nav[0].frequency - destination.localizer) < 0.005;
    const right = radioText(panel.nav[1].frequency).split(' ');
    return {
      title: 'NAV RADIO',
      page: [1, 1],
      rows: [
        {
          labelLeft: 'VOR L',
          labelRight: 'VOR R',
          left: { text: radioText(panel.nav[0].frequency) },
          right: { text: right.reverse().join(' ') },
        },
        {
          labelLeft: 'CRS',
          labelRight: 'CRS',
          left: { text: course(0) },
          right: { text: course(1) },
        },
        {
          labelLeft: 'ADF L',
          labelRight: 'ADF R',
          left: { text: '-----', small: true },
          right: { text: '-----', small: true },
        },
        {
          labelLeft: 'ILS - MLS',
          left: ilsTuned
            ? {
                text: `${destination.localizer.toFixed(2)}/${String(runwayCourse).padStart(3, '0')}°`,
                colour: 'green',
              }
            : { text: `PARK ${destination.localizerIdent}`, small: true },
        },
        {},
        {},
      ],
    };
  },
  select(flight, _pageNumber, side, line, scratchpad) {
    const radio = side === 'L' ? 0 : 1;
    const tuning = flight.panel.nav[radio];
    if (line === 1) {
      if (!scratchpad) return { scratchpad: tuning.frequency.toFixed(2) };
      const match = FREQUENCY.exec(scratchpad);
      const frequency = match ? Number(match[1]) : NaN;
      const course = match?.[2] === undefined ? tuning.course : Number(match[2]);
      if (!match || frequency < NAV_BAND.low || frequency > NAV_BAND.high || course > 360)
        return { message: MESSAGES.invalid };
      return { commands: [{ kind: 'tuneNav', radio, frequency, course }], scratchpad: '' };
    }
    if (line === 2) {
      if (!scratchpad)
        return { scratchpad: `/${String(Math.round(tuning.course)).padStart(3, '0')}` };
      const match = COURSE.exec(scratchpad);
      const course = match ? Number(match[1]) : NaN;
      if (!match || course > 360) return { message: MESSAGES.invalid };
      return {
        commands: [{ kind: 'tuneNav', radio, frequency: tuning.frequency, course }],
        scratchpad: '',
      };
    }
    return scratchpad ? { message: MESSAGES.invalid } : {};
  },
};

export const CDU_PAGES: Record<CduPageId, CduPage> = {
  RTE,
  LEGS,
  'DEP ARR': DEP_ARR,
  TAKEOFF,
  APPROACH,
  PROG,
  'NAV RAD': NAV_RAD,
};
