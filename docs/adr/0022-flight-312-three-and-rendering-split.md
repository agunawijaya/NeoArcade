# ADR 0022 — Flight 312: Three.js for the world, Canvas 2D for the flight deck

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Flight 312 (prompt 009)

## Context

Flight 312 needs two very different pictures at once. Outside the
windscreen: a 3D world hundreds of miles across — terrain, coastlines, six
airports with their markings and thousands of lights, cloud decks, a sky
with the real sun — seen from a cockpit that moves at 500 knots and lands on
a runway 200 ft wide. Inside: a flight deck of round analog instruments,
sharp at any size, that a player reads at a glance and clicks, drags and
turns. The ports' rules (CLAUDE.md, ADR 0001) allow no raster assets; the
prompt allows "Three.js (or a similar library from npm)" for the world and
asks for an ADR.

## Decision

- **The world is Three.js** (`three` 0.186, MIT licence), one
  `WebGLRenderer` in `src/world/world-view.ts`. Three.js is the most widely
  used WebGL library, ships its own TypeScript types (`@types/three`), and
  gives us what we would otherwise write: the scene graph, cameras, buffer
  geometry, `ShaderMaterial`, fog, the logarithmic depth buffer. We use it
  as a thin layer: almost everything visible is our own `ShaderMaterial`
  with GLSL in `src/world/shaders.ts` (atmosphere, Earth curvature, noise,
  decals); no loaders, no post-processing, no textures from files.
- **Big world, small numbers.** Positions are kept in a flat local frame
  (`src/world/frame.ts`) centred near the eye and moved every 25 km, so
  32-bit floats never lose the runway. The Earth's curvature is applied in
  every vertex shader relative to the camera (`CURVE_GLSL`), so the horizon
  falls away correctly from 35,000 ft and nothing ever sits on a seam
  between two different curves. A logarithmic depth buffer covers 1 m to
  400 km without z-fighting; runway paint and lights are pulled a little
  toward the eye in their shaders instead of floating above the concrete.
- **The flight deck is Canvas 2D** over the WebGL canvas (ADR 0025), and the
  HUD — radio subtitles, readback choices, buttons — is plain DOM above
  both. Each layer does what it is best at: depth and light in WebGL, crisp
  vector dials and hit-testing in Canvas, accessible text and buttons in
  the DOM.
- **Rendering only reads.** The engine (`src/engine`) never imports a
  renderer; `FlightSession` hands each layer the flight's state once a frame.

## Consequences

- One dependency, tree-shaken in the build; it is the only runtime library
  the port adds.
- WebGL is required. Without it the game says so before a flight starts
  (`canDrawTheWorld` in `main.ts`); there is no 2D fallback for the world.
- The world's look lives in our shaders, so Three.js upgrades rarely touch
  it; the `#include` chunks we rely on (`common`, `logdepthbuf_*`,
  `colorspace_fragment`) are the only coupling.
- Frame budget (measured; see `docs/games/flight-312.md`): about 95 draw
  calls and 200k triangles on final at Kennedy. The Canvas cockpit was the
  larger CPU cost until static dial faces were cached (ADR 0025).
