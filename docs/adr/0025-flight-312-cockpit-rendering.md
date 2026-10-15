# ADR 0025 — Flight 312: the flight deck in Canvas 2D, in panel units

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Flight 312 (prompt 009)

## Context

The prompt asks for a faithful, fully code-drawn classic jumbo flight deck
— captain's panel, centre panel, glareshield, first officer's side,
pedestal, overhead and flight engineer's station — accurate in layout,
dial faces, scales and needle ranges, interactive (knobs, levers, switches,
the mouse wheel), scaling from a phone to a widescreen, with day, dusk and
night lighting. It draws over the 3D world (ADR 0022) every frame.

The candidates were SVG (DOM nodes per tick and numeral, restyled every
frame), WebGL (text and fine strokes are hard to make crisp) and Canvas 2D.

## Decision

- **One Canvas 2D overlay** (`src/cockpit/cockpit.ts`), redrawn every frame
  for the current view, at the device's pixel ratio. Instruments are plain
  functions that draw at a centre and a radius (`flight-instruments.ts`,
  `engine-instruments.ts`) with a small kit of primitives
  (`canvas-kit.ts`: bezels, ticks, needles, counters, annunciators, knobs).
- **Panel units.** The main panel is laid out in units where the panel is
  100 tall and the core (captain's instruments and the centre panel) 290
  wide (`main-panel.ts`); the first officer's side fills whatever width is
  left, as it would from the captain's seat. Below 520 px of height or 900
  px of width a compact layout keeps the six instruments, the engines, the
  gear and flaps. The pedestal, overhead and engineer panels use a 160 × 100
  unit frame, with room left at the sides for the view buttons.
- **Regions, not DOM.** Each frame the drawing code pushes hit regions
  (`actions.ts`: clicks, knob turns, lever drags); pointer and wheel
  gestures become `CockpitAction`s that `game/controls.ts` applies to the
  panel. A drag that starts away from every control flies the aircraft.
- **Palettes for light.** `palette.ts` holds day, dusk and night colours
  (night: dark panels, cream integral lighting, a warm flood wash), chosen
  automatically from the sun or fixed in Settings.
- **Cached dial faces.** A dial's face — bezel, ticks, numerals, printed
  words — changes only with its size and the lighting, so `face()` draws it
  once into its own canvas and stamps it each frame; needles, bugs,
  counters and flags are drawn live. Compass cards are drawn once north-up
  and stamped turned. This took the cockpit from about 35% of the main
  thread to about 24% and the frame from 10.1 ms to 6.2 ms at 1440 × 900.

## Consequences

- Every instrument is a function you can call on a test page
  (`?lab=instruments` shows each at its key values) and read in a few
  dozen lines.
- Text is drawn by the browser's font engine, so dials stay crisp at any
  zoom; the double-click zoom redraws at the new scale instead of
  magnifying pixels.
- Accessibility lives in the DOM HUD and the keyboard, not in the canvas:
  every control on the panel also has a key.
- The accuracy is of layout, instrument design and behaviour from public
  reference material and general knowledge, drawn fresh; no photograph
  was traced and no manufacturer artwork copied. Where the real flight deck
  is denser than a screen can show (the overhead's full switch count, the
  engineer's panel), the port keeps the groups and their order and says so.
