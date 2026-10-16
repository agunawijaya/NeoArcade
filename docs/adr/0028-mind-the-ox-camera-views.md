# ADR 0028 — Mind the Ox's two camera views: side and diorama

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Mind the Ox (prompt 011); follows
  [ADR 0010](0010-camera-views-and-fair-sight.md) (several views over one
  engine, one fair sight line)

## Context

Mind the Ox is a side-scroller like the 1984 game, and the prompt asks for
a second, three-dimensional way to see the same strip of battlefield: a
"diorama" from slightly in front and above, with depth, shadows on the
ground, clouds to fly through and the land receding. Gameplay stays 2D,
and the camera must never hide what the side view shows. The player can
switch between them at any time (Tab, the pause card, Settings).

## Decision

1. **One `ViewRenderer` interface** (`render/view.ts`), as in Donkey Dash:
   `render(frame, viewport)`, `fieldOfView(viewport, cameraX)`,
   `resize`, `setFilter(cga)` and `dispose`. Both views paint the same
   `Frame` (`game/visuals.ts`: the world, the camera's x, each plane's roll
   and propeller, the particles, the splats, the liveries) and write
   nothing back to the engine.
2. **The same field of view.** The side view fits the whole height of the
   world (the ground to the ceiling) between the instrument panel and the
   world strip, as 1984 did; the width follows from the screen.
   `SideCamera.fieldOfView` is the one definition of what is on screen.
   The diorama's camera (`render/diorama/camera.ts`) stands in front of the
   line of play and above it, looking straight ahead with an off-axis
   frustum, so that the line of play itself (z = 0) lands on screen exactly
   where the side view puts it: same window, same scale, insets respected.
   Everything behind the line recedes up the screen and shrinks; nothing
   is ever drawn in front of the line of play except see-through clouds and
   fog. Both views therefore return the side view's field of view, and the
   strip map's bracket is right in either.
3. **three.js for the diorama**, loaded only when first chosen (a dynamic
   import; the side view never pulls it in). three.js was already a
   dependency (Flight 312, [ADR 0022](0022-flight-312-three-and-rendering-split.md)).
   Materials are three flat tones per surface, like gouache, rather than
   physically based shading; the sun (or moon) casts real shadows of the
   planes onto the fields.
4. **Shared screen-space touches.** The glare of the flight into the sun,
   the paper grain and the splats on the goggles are painted by the same
   functions in both views. The diorama paints them on a transparent canvas
   layered over the WebGL one; only the CGA filter flattens the two into
   one picture, so the GPU is not asked to read back every frame otherwise.
5. **Engine facts are drawn from the engine.** Searchlight beams on a night
   raid come from `engine/sight.ts`, not from a view's own animation, so
   what looks lit is lit in both views. Fog banks are the map's own spans.
   Craters change the terrain mesh where the engine's heights changed.
6. **Split screen.** Two players get two panes, stacked, each its own view
   instance with its own camera and goggles (`render/stage.ts`); in the
   diorama that means two WebGL contexts, which every browser we target
   allows.

## Consequences

- A third view would implement the same interface and pass the same field
  of view test.
- The diorama costs a larger download (three.js, about 600 KB, loaded on
  demand) and more GPU; the side view remains the default and the light
  path on phones.
- Scenery is built once per map from the map's seed (`render/scenery.ts`),
  so both views place the same poplar at the same spot.
