# ADR 0003 — Destructible terrain: shapes for the rules, a canvas for the pixels

- **Status:** accepted
- **Date:** 2026-09-25
- **Context:** Skyline Showdown (prompt 001)

## Context

In QBasic Gorillas an explosion erased a circle of pixels, and every later
collision read pixel colours with `POINT`. The city was its own collision
mask. A port needs the same permanent holes, but:

- the engine must be pure TypeScript with no DOM, testable in Node;
- the renderer draws at any resolution (a phone at 1.1× to a 4K screen at
  4×), so a pixel mask cannot be the source of truth;
- carving must stay cheap on a mid-range phone, with no per-pixel loops each
  frame;
- instant replays must rewind the city to how it looked before a throw.

## Decision

**The engine keeps terrain as geometry.** `Terrain` is the list of building
rectangles plus two kinds of damage: `craters` (circles) and `cuts`
(rectangles, the roof sections a Golden Banana knocks off). A point is
solid if it is inside a building and not inside any crater or cut
(`solidBuildingAt`). A banana is a 3-unit disc probed at its centre and four
edge points, which mirrors the original's leading-edge `POINT` checks.

Simulating a throw copies the damage lists (`copyTerrain`) and returns the
new terrain in the `ShotRecord`. The terrain from before the throw stays
intact, which is all a replay needs.

**The renderer keeps one offscreen canvas per round** (`City`), painted once
at the current resolution: facades, windows and rooftop props. Damage is
applied to it with compositing, never per pixel:

1. a scorch gradient is painted `source-atop`, so it only darkens building
   pixels around the hole;
2. the hole is cut with `destination-out`.

Craters and cuts are stored alongside, so a resize, or rewinding for a
replay, repaints the canvas from scratch and re-applies them in order.
Glowing, cooling edges are drawn each frame on top as a short-lived effect
(`Effects.drawEmbers`), not baked in. A window switching on or off repaints
only that window, and skips any window touched by damage.

## Consequences

- Collisions are exact and resolution-independent. Engine tests can check
  things like "the second banana flies through the first one's hole".
- The number of craters grows with the throws of a round, and every
  collision test walks the list. Rounds rarely pass a few dozen holes, and
  a round resets the city.
- Carving costs two fills per explosion. Per frame the city is one
  `drawImage`.
- A resize repaints the whole city (a few milliseconds). Replays repaint it
  twice.
- Holes are perfectly round. The original's EGA circles were slightly
  ragged, and a banana could occasionally slip through a one-pixel gap.
  That difference is accepted.
