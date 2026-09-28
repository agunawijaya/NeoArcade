# ADR 0010 — Three camera views over one engine, with one fair sight line

- **Status:** accepted
- **Date:** 2026-09-28
- **Context:** Donkey Dash (prompt 005)

## Context

Donkey Dash offers three ways to look at the same road: a Chase view behind
the car (pseudo-3D, curves and hills), a Classic top-down view that echoes
the 1981 screen, and an Isometric model world. The player can switch at any
time from the pause menu. The game is about reaction time, so the choice of
view must never change what is fair: the same donkey must be visible for the
same time in every view, and hitboxes and timing must be identical.

A naive chase camera shows the road to the horizon, far more than a
top-down screen; an isometric view shows what fits on the screen's
diagonal. Left alone, each view would give a different reaction window.

## Decision

1. **The engine owns visibility.** `SIGHT_DISTANCE` (16 m, the original's
   77 pixels ahead of the car) in `engine/constants.ts` is the one fairness
   number. A hazard is revealed when its near edge comes within
   `revealGap(climb)` of the car's nose: `SIGHT_DISTANCE`, minus the duel's
   climb. Views draw revealed hazards only. The reaction window is
   `revealGap / speed`, whatever the view.
2. **One small interface.** Every view implements `RoadView`
   (`render/view.ts`): `draw(ctx, frame, viewport)` and a pure
   `layout(viewport, climb)` that says where things land on screen. A view
   gets a `Frame`, built once per display frame by `game/visuals.ts` from
   the engine state (interpolated, with eased animations), and writes
   nothing back.
3. **Each view places the sight line on a natural edge.** Classic: a
   hedgerow across the far end of the diorama; the car climbs the screen
   towards it as in 1981. Chase: the road rises to a crest exactly at the
   sight line, so donkeys come over the hill as they are revealed; in the
   duels the crest draws nearer with each climb. Isometric: the point where
   the road runs off the screen; the layout searches for the longest reach
   at which a donkey in any lane still fits.
4. **Views may stretch distance, never time.** Chase and Isometric map
   metres ahead onto the screen with a stretch factor, so the sight line
   lands where it should on any screen shape. Only the mapping changes;
   the time from sight line to car is the engine's.
5. **Nothing may hide a lane.** Isometric keeps tall props on the far side
   of the road; the near side gets only low ones. Chase culls roadside
   things right beside the camera. The HUD's top bar is part of the
   viewport contract (`insetTop`), and no view may put the sight line under
   it.
6. **Tested.** `render/layout.test.ts` checks every view at 1440×900,
   1024×768, 844×390 and 390×844, at every step of the climb: the view shows
   exactly `revealGap(climb)` ahead; a donkey on the sight line, in any lane
   of a three-lane road, is whole on screen and clear of the HUD; distance
   ahead maps steadily up the screen; and each view's edge (hedgerow, crest,
   screen edge) is the sight line.

## Consequences

- Adding a view means implementing `RoadView` and adding it to the layout
  test; the test decides whether it is fair.
- The Chase view's hills are camera-relative (the crest is always the same
  distance away), which is invisible in play but means the landscape beyond
  the crest is a backdrop, not road.
- Particles and scenery are placed in road coordinates and projected by
  each view, so they look right everywhere; screen-space effects (the crash,
  weather) are shared.
- The crash is drawn in screen space from each view's car and donkey boxes,
  so the four halves always fly to the screen's corners, as they did in 1981.
