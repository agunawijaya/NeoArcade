# ADR 0024 — Flight 312: airport, navaid, terrain and map data

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Flight 312 (prompt 009); follows ADR 0015 (Long Haul's map)

## Context

The 3D world needs the real runways of Philadelphia and the six ILS
destinations (positions, headings, lengths, elevations), the sixteen VOR
stations the 1982 program names, terrain heights for the region from Lake
Michigan to Cape Cod, and coastlines, lakes, rivers and towns; the
en-route chart needs the same outlines. As in ADR 0015, nothing may be
fetched at runtime and every source must be one we may redistribute.

## Decision

- **OurAirports** (public domain; `davidmegginson.github.io/ourairports-data`)
  for runway ends, headings, widths and elevations, and for the navaids:
  each of the program's sixteen stations was identified by matching its
  position (and frequency) to an OurAirports VOR — all within 0.3 nm. The
  program's frequencies stay as the program had them; where a station has
  moved frequency since, `todayMhz` records the current one.
- **NOAA ETOPO1** (U.S. Government data, free to use and redistribute),
  through NOAA's ERDDAP service: elevation on a 2-arc-minute grid over the
  region (37–48° N, 68.5–90.5° W) and 1-arc-minute patches around each
  airport. The Great Lakes are set to their surface levels, since ETOPO1
  records their beds.
- **Natural Earth 1:10m** (public domain) for land, lakes, rivers, urban
  areas and towns, clipped to the region (Sutherland–Hodgman) and
  simplified (Douglas–Peucker).
- **Built once, committed.** `ports/flight-312/scripts/build-world.ts`
  downloads the sources into the system's temporary folder, prints the
  station identification, and writes `src/data/airport-data.ts`,
  `geography-data.ts` and `terrain-data.ts` (the grids gzip-compressed and
  base64-encoded, unpacked at start-up with the platform's
  `DecompressionStream`). The game never fetches anything.
- **The 1982 Rules keep the program's runway.** Under 1982 Rules,
  Philadelphia's runway is the program's 10,500 × 200 ft strip; the other
  levels use the real runways.

## Consequences

- The region reads as itself from altitude — the Hudson, Long Island, the
  lakes, the Appalachian ridges — at a resolution suited to a jet at
  altitude, not to low flying between hills.
- Rebuilding needs the network once (`npx tsx
  ports/flight-312/scripts/build-world.ts`); the generated files are
  reviewed and committed like code.
- Runway data is today's, not 1982's: lengths, lighting and markings follow
  the current runways and the FAA's current standards, not the airports as
  they were that February.
