# ADR 0015 — Long Haul's map: Natural Earth, simplified at build time

- **Status:** accepted
- **Date:** 2026-10-04
- **Context:** Long Haul (prompt 006)

## Context

Long Haul needs a recognisable map of the United States: on the route
planner, in the full-screen map during a trip, in the mini-map and in the
atlas clipped to the cab's dashboard. The ports' rules (CLAUDE.md, ADR 0001)
allow no raster assets and no network calls at runtime, so the map has to be
vector data that ships with the game, and its source has to be one we may
use and redistribute without conditions.

## Decision

- **Source: Natural Earth**, the 1:50m *Admin 1 – states and provinces*,
  *Admin 0 – countries* and *lakes* layers, from the project's GeoJSON
  mirror (`nvkelso/natural-earth-vector`). Natural Earth is in the **public
  domain**: "No permission is needed to use Natural Earth. Crediting the
  authors is unnecessary." (naturalearthdata.com, terms of use). We credit
  it anyway, in `geography.ts`, the architecture document and here.
- **Built once, committed.** `ports/long-haul/scripts/build-map.ts`
  downloads the three layers into the system's temporary folder (once),
  keeps the 48 contiguous states plus D.C. and the Great Lakes, projects
  them with an **Albers equal-area conic** (standard parallels 29.5° and
  45.5°, origin 37.5° N 96° W, the classic choice for the lower 48), clips
  them to the frame (Sutherland–Hodgman), simplifies each ring
  (Douglas–Peucker, about half a map unit) and writes SVG path strings for
  the states, the lakes and the edges of Canada and Mexico, with a label
  position for each state, to `src/map/geography.ts`,
  formatted with Prettier. The result is about 41 KB in a 1000 × 616 unit
  frame. The game never fetches anything.
- **The same projection at runtime.** `src/map/projection.ts` holds the
  same constants (`ALBERS`, written by the script) and projects places,
  routes, weather systems and the rig into map units.
- **Painted, not imported.** `render/map-painter.ts` turns the path strings
  into `Path2D`s once and paints them in three palettes (paper by day, night,
  and the atlas page in the cab).

## Consequences

- The outline is accurate enough to read at a glance and small enough to
  ship; the 1:50m scale shows the Great Lakes, Chesapeake Bay and the Keys,
  not every island.
- Rebuilding the map needs the network once (`npx tsx
  ports/long-haul/scripts/build-map.ts`); the generated file is reviewed and
  committed like code.
- Places (`src/data/places.ts`) carry their own latitude and longitude; the
  interstates are not drawn from GIS data but from the corridor tables
  (ADR 0017), as straight-ish lines between their waypoints, which is what a
  road atlas of the early 1980s showed at this scale anyway.
