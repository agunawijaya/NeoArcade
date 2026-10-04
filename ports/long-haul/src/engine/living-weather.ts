import type { Rng } from '@shared/rng';
import type { ConditionId } from './conditions';
import { streamFor } from './streams';

/**
 * Weather you can see coming. Career and the Daily Haul replace the original's
 * dice roll with systems that drift across the map: snow over the Rockies,
 * lake-effect squalls, Appalachian fog, Gulf rain. The road condition under
 * the rig is whatever system covers it, mapped onto the original's six
 * conditions and their risk weights, so the crash formula is unchanged.
 *
 * Positions are degrees of latitude and longitude and time is real hours
 * since departure. Only + − × ÷ are used, so every browser agrees on the
 * weather of a Daily Haul.
 */
export type SystemKind = 'snow' | 'rain' | 'storm' | 'fog';

export interface WeatherSystem {
  id: number;
  kind: SystemKind;
  /** Centre when it is born, in degrees. */
  lat: number;
  lon: number;
  /** Drift, in degrees an hour. Mostly eastward, with the westerlies. */
  dLat: number;
  dLon: number;
  /** Half-widths of its ellipse, in degrees. */
  rLat: number;
  rLon: number;
  /** Hour it forms (negative: already there when the trip starts) and how long it lasts. */
  born: number;
  life: number;
  /** Peak strength, 0–1. */
  strength: number;
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

/** December–February is winter, and so on. `month` is 0 for January. */
export function seasonOfMonth(month: number): Season {
  const wrapped = ((month % 12) + 12) % 12;
  if (wrapped === 11 || wrapped <= 1) return 'winter';
  if (wrapped <= 4) return 'spring';
  if (wrapped <= 7) return 'summer';
  return 'autumn';
}

interface Nursery {
  kind: SystemKind;
  name: string;
  south: number;
  north: number;
  west: number;
  east: number;
  /** Relative chance of a system forming here. */
  weight: number;
}

/** Where each season's weather tends to form. */
const NURSERIES: Readonly<Record<Season, readonly Nursery[]>> = {
  winter: [
    { kind: 'snow', name: 'Rockies snow', south: 37, north: 47, west: -116, east: -104, weight: 4 },
    {
      kind: 'snow',
      name: 'Plains blizzard',
      south: 39,
      north: 48,
      west: -106,
      east: -94,
      weight: 3,
    },
    {
      kind: 'snow',
      name: 'Lake-effect snow',
      south: 41,
      north: 44,
      west: -88,
      east: -76,
      weight: 3,
    },
    { kind: 'snow', name: 'Sierra snow', south: 38, north: 47, west: -123, east: -119, weight: 2 },
    { kind: 'snow', name: 'Northeast snow', south: 40, north: 44, west: -79, east: -70, weight: 2 },
    {
      kind: 'rain',
      name: 'Pacific storm',
      south: 40,
      north: 48,
      west: -125,
      east: -120,
      weight: 2,
    },
    { kind: 'rain', name: 'Gulf rain', south: 29, north: 34, west: -97, east: -82, weight: 4 },
    { kind: 'fog', name: 'Appalachian fog', south: 35, north: 41, west: -83, east: -77, weight: 3 },
    { kind: 'fog', name: 'Valley fog', south: 35, north: 40, west: -122, east: -119, weight: 2 },
    { kind: 'rain', name: 'Southern rain', south: 32, north: 37, west: -96, east: -78, weight: 3 },
  ],
  spring: [
    {
      kind: 'storm',
      name: 'Plains storms',
      south: 32,
      north: 42,
      west: -102,
      east: -90,
      weight: 4,
    },
    { kind: 'rain', name: 'Midwest rain', south: 37, north: 44, west: -96, east: -82, weight: 3 },
    { kind: 'rain', name: 'Gulf rain', south: 29, north: 34, west: -97, east: -82, weight: 2 },
    {
      kind: 'snow',
      name: 'Late Rockies snow',
      south: 37,
      north: 46,
      west: -113,
      east: -104,
      weight: 2,
    },
    { kind: 'rain', name: 'Pacific rain', south: 40, north: 48, west: -125, east: -120, weight: 2 },
    { kind: 'fog', name: 'Appalachian fog', south: 35, north: 41, west: -83, east: -77, weight: 2 },
    { kind: 'rain', name: 'Northeast rain', south: 38, north: 44, west: -80, east: -70, weight: 1 },
  ],
  summer: [
    {
      kind: 'storm',
      name: 'Gulf thunderstorms',
      south: 28,
      north: 34,
      west: -98,
      east: -80,
      weight: 4,
    },
    {
      kind: 'storm',
      name: 'Monsoon storms',
      south: 31,
      north: 37,
      west: -114,
      east: -104,
      weight: 2,
    },
    {
      kind: 'storm',
      name: 'Midwest storms',
      south: 37,
      north: 45,
      west: -100,
      east: -85,
      weight: 3,
    },
    {
      kind: 'storm',
      name: 'Florida storms',
      south: 25,
      north: 30,
      west: -83,
      east: -80,
      weight: 2,
    },
    { kind: 'fog', name: 'Appalachian fog', south: 35, north: 41, west: -83, east: -77, weight: 2 },
    { kind: 'fog', name: 'Coast fog', south: 34, north: 40, west: -123, east: -120, weight: 1 },
  ],
  autumn: [
    { kind: 'rain', name: 'Pacific rain', south: 40, north: 48, west: -125, east: -120, weight: 3 },
    {
      kind: 'snow',
      name: 'Early Rockies snow',
      south: 39,
      north: 47,
      west: -114,
      east: -104,
      weight: 2,
    },
    { kind: 'rain', name: 'Midwest rain', south: 37, north: 45, west: -98, east: -82, weight: 2 },
    { kind: 'fog', name: 'Appalachian fog', south: 35, north: 41, west: -83, east: -77, weight: 4 },
    { kind: 'rain', name: 'Gulf rain', south: 28, north: 33, west: -97, east: -82, weight: 2 },
    { kind: 'rain', name: 'Northeast rain', south: 39, north: 45, west: -80, east: -70, weight: 2 },
    { kind: 'fog', name: 'Valley fog', south: 35, north: 40, west: -122, east: -119, weight: 1 },
  ],
};

/** Systems forming per 240 hours across the country; about eight are alive at any time. */
const SYSTEMS_PER_SEASON: Readonly<Record<Season, number>> = {
  winter: 74,
  spring: 60,
  summer: 54,
  autumn: 64,
};

export interface SkyOptions {
  seed: number;
  season: Season;
  /** How many hours ahead to fill; a trip rarely lasts more than ten days. */
  hours?: number;
  /** Above 1, more and stronger systems (Hard). */
  scale?: number;
}

/** The weather for a trip: the same seed and season always give the same sky. */
export function skyFor({ seed, season, hours = 240, scale = 1 }: SkyOptions): WeatherSystem[] {
  const rng = streamFor(seed, 'weather', season);
  const nurseries = NURSERIES[season];
  const total = nurseries.reduce((sum, nursery) => sum + nursery.weight, 0);
  // Systems form over the whole window, plus the two days before it so the trip opens mid-weather.
  const count = Math.round(((SYSTEMS_PER_SEASON[season] * (hours + 48)) / 240) * scale);
  const systems: WeatherSystem[] = [];
  for (let id = 0; id < count; id++) {
    const nursery = pickNursery(nurseries, total, rng);
    systems.push(formSystem(id, nursery, rng, hours, scale));
  }
  return systems;
}

function pickNursery(nurseries: readonly Nursery[], total: number, rng: Rng): Nursery {
  let roll = rng.next() * total;
  for (const nursery of nurseries) {
    roll -= nursery.weight;
    if (roll < 0) return nursery;
  }
  return nurseries[nurseries.length - 1] as Nursery;
}

function formSystem(
  id: number,
  nursery: Nursery,
  rng: Rng,
  hours: number,
  scale: number,
): WeatherSystem {
  const fog = nursery.kind === 'fog';
  return {
    id,
    kind: nursery.kind,
    lat: rng.float(nursery.south, nursery.north),
    lon: rng.float(nursery.west, nursery.east),
    // Fog banks sit still; everything else rides the westerlies.
    dLat: fog ? 0 : rng.float(-0.06, 0.06),
    dLon: fog ? rng.float(-0.02, 0.02) : rng.float(0.3, 0.6),
    rLat: fog ? rng.float(0.8, 1.6) : rng.float(1.4, 3.2),
    rLon: fog ? rng.float(1.2, 2.6) : rng.float(2, 4.6),
    born: rng.float(-48, hours),
    life: fog ? rng.float(10, 30) : rng.float(18, 54),
    strength: Math.min(1, rng.float(0.55, 1) * (scale > 1 ? 1.1 : 1)),
  };
}

/** How strong a system is at an hour of its life: it builds, holds, then fades. */
export function systemStrength(system: WeatherSystem, hour: number): number {
  const age = hour - system.born;
  if (age < 0 || age > system.life) return 0;
  const grow = system.life * 0.2;
  const fade = system.life * 0.25;
  let envelope = 1;
  if (age < grow) envelope = age / grow;
  else if (age > system.life - fade) envelope = (system.life - age) / fade;
  return system.strength * envelope;
}

/** Where a system's centre is at an hour. */
export function systemCentre(system: WeatherSystem, hour: number): { lat: number; lon: number } {
  const age = hour - system.born;
  return { lat: system.lat + system.dLat * age, lon: system.lon + system.dLon * age };
}

/** 0 outside the system, rising to its full strength at the centre. */
export function intensityAt(system: WeatherSystem, lat: number, lon: number, hour: number): number {
  const strength = systemStrength(system, hour);
  if (strength === 0) return 0;
  const centre = systemCentre(system, hour);
  const x = (lon - centre.lon) / system.rLon;
  const y = (lat - centre.lat) / system.rLat;
  const distance = x * x + y * y;
  if (distance >= 1) return 0;
  return strength * (1 - distance);
}

const SEVERITY: Readonly<Record<ConditionId, number>> = {
  clear: 0,
  wet: 1,
  rain: 2,
  'light-snow': 3,
  fog: 4,
  blizzard: 5,
};

/** What one system does to the road at a given intensity. */
function conditionFrom(kind: SystemKind, intensity: number, hourOfDay: number): ConditionId {
  if (intensity <= 0) return 'clear';
  switch (kind) {
    case 'snow':
      if (intensity > 0.62) return 'blizzard';
      return intensity > 0.3 ? 'light-snow' : 'wet';
    case 'storm':
      return intensity > 0.28 ? 'rain' : 'wet';
    case 'rain':
      return intensity > 0.4 ? 'rain' : 'wet';
    case 'fog': {
      // Fog thickens before dawn and burns off by late morning.
      const morning = hourOfDay >= 2 && hourOfDay <= 10;
      return intensity * (morning ? 1.4 : 0.8) > 0.3 ? 'fog' : 'wet';
    }
  }
}

/** The road condition at a place and moment: the worst any system makes it. */
export function conditionAt(
  sky: readonly WeatherSystem[],
  lat: number,
  lon: number,
  hour: number,
  hourOfDay: number,
): ConditionId {
  let worst: ConditionId = 'clear';
  for (const system of sky) {
    const condition = conditionFrom(system.kind, intensityAt(system, lat, lon, hour), hourOfDay);
    if (SEVERITY[condition] > SEVERITY[worst]) worst = condition;
  }
  return worst;
}

/** The system responsible for the weather at a place, for naming it on the map and the CB. */
export function systemAt(
  sky: readonly WeatherSystem[],
  lat: number,
  lon: number,
  hour: number,
): WeatherSystem | null {
  let strongest: WeatherSystem | null = null;
  let best = 0;
  for (const system of sky) {
    const intensity = intensityAt(system, lat, lon, hour);
    if (intensity > best) {
      best = intensity;
      strongest = system;
    }
  }
  return strongest;
}

export function conditionSeverity(condition: ConditionId): number {
  return SEVERITY[condition];
}
