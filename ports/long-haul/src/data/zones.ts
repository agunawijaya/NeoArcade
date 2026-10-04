import type { Place } from './places';

/**
 * Time zones, on standard time all year as the original kept them. A
 * state's zone is the one most of it keeps; the places where the line runs
 * through a state are listed by name.
 */
export type ZoneId = 'pacific' | 'mountain' | 'central' | 'eastern';

/** Hours behind Greenwich. */
export const ZONE_OFFSETS: Readonly<Record<ZoneId, number>> = {
  pacific: -8,
  mountain: -7,
  central: -6,
  eastern: -5,
};

export const ZONE_NAMES: Readonly<Record<ZoneId, string>> = {
  pacific: 'Pacific',
  mountain: 'Mountain',
  central: 'Central',
  eastern: 'Eastern',
};

const STATE_ZONES: Readonly<Record<string, ZoneId>> = {
  WA: 'pacific',
  OR: 'pacific',
  CA: 'pacific',
  NV: 'pacific',
  ID: 'mountain',
  MT: 'mountain',
  WY: 'mountain',
  UT: 'mountain',
  CO: 'mountain',
  AZ: 'mountain',
  NM: 'mountain',
  ND: 'central',
  SD: 'central',
  NE: 'central',
  KS: 'central',
  OK: 'central',
  TX: 'central',
  MN: 'central',
  IA: 'central',
  MO: 'central',
  AR: 'central',
  LA: 'central',
  WI: 'central',
  IL: 'central',
  MS: 'central',
  AL: 'central',
  TN: 'central',
  KY: 'eastern',
  IN: 'eastern',
  MI: 'eastern',
  OH: 'eastern',
  GA: 'eastern',
  FL: 'eastern',
  SC: 'eastern',
  NC: 'eastern',
  VA: 'eastern',
  WV: 'eastern',
  PA: 'eastern',
  MD: 'eastern',
  DC: 'eastern',
  DE: 'eastern',
  NJ: 'eastern',
  NY: 'eastern',
  CT: 'eastern',
  RI: 'eastern',
  MA: 'eastern',
  VT: 'eastern',
  NH: 'eastern',
  ME: 'eastern',
};

/** Places on the "wrong" side of their state's usual zone. */
const PLACE_ZONES: Readonly<Record<string, ZoneId>> = {
  'ontario-or': 'mountain',
  'coeur-d-alene': 'pacific',
  'el-paso': 'mountain',
  dickinson: 'mountain',
  'nd-border-i94': 'mountain',
  'ne-border-i76': 'mountain',
  gary: 'central',
  'bowling-green': 'central',
  chattanooga: 'eastern',
  knoxville: 'eastern',
  bristol: 'eastern',
  wendover: 'mountain',
};

export function stateZone(state: string): ZoneId {
  return STATE_ZONES[state] ?? 'central';
}

export function zoneOf(place: Pick<Place, 'id' | 'state'>): ZoneId {
  return PLACE_ZONES[place.id] ?? stateZone(place.state);
}
