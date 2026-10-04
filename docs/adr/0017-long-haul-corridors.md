# ADR 0017 — Long Haul's road network: corridors as typed waypoint tables

- **Status:** accepted
- **Date:** 2026-10-04
- **Context:** Long Haul (prompt 006)

## Context

The original game has three routes, each a `DATA` table of waypoints: a
milepost, a name, the road leading there and a code saying what can happen
there (time zone, toll, construction, radar, scale, rock slide, reefer). The
career and the Daily Haul need a country: about twenty hubs, real
interstates between them, several sensible ways from one hub to another,
the same kinds of events along the way, and time zones and state lines that
come out right. It has to be data a person can read and correct, and it has
to stay correct as it grows.

## Decision

- **A corridor is an original-style table between two hubs**, typed in
  `src/data/corridors.ts`: an id, the two hubs, the roads it follows, the
  original's RH and RT factors (how strict the patrols, how hard on tyres),
  and rows of `[mile, place, road, codes]`. Codes are the original's (`4.75`
  is a radar trap with a 25 % chance), so the original's decoder reads them. A
  corridor can mark tolls or slides as one-way.
- **Places are shared.** Every row names a place in `src/data/places.ts`
  (with latitude, longitude, state, landscape and kind: hub, city, town,
  site or state line). The map, the side view's landscape, the postcards,
  the CB and the weather all key off the place.
- **Routes are joined, not authored.** `network.ts` treats corridors as
  edges between hubs; `routeOptions(from, to)` finds simple paths (no hub
  twice) no longer than 1.35 times the shortest, and `joinLegs` reverses
  corridors as needed, adds up the miles, inserts the time-zone changes
  from `src/data/zones.ts` wherever the zone differs between consecutive
  places, and names the state lines.
- **Tests keep it honest** (`network.test.ts`): every row's place exists and
  the miles increase; each leg's road miles are between 0.97 and 1.6 times
  the great-circle distance (plus 25 miles for short legs); the network is
  connected; a corridor is under 1,950 miles; Los Angeles to New York has
  options between 2,500 and 3,200 miles; crossing the country changes the
  clock by three hours each way.

## Consequences

- Nineteen hubs and thirty-four corridors cover the lower 48 from Seattle to
  Miami; the original routes stay their own tables (with corrections), so Single
  Haul is untouched by the network.
- Mileages are authored, checked against geography, not computed from GIS
  roads; they are close to what a road atlas of the early 1980s would give, which is the
  standard the game needs.
- Adding a corridor is adding a table and running the tests; adding a hub
  also means giving it goods for the job board.
