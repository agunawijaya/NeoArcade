# ADR 0019 — Donkey Dash's shifting road: lane positions, and a proof for every road

- **Status:** accepted
- **Date:** 2026-10-15
- **Context:** Donkey Dash (prompt 007, backlog DD-02)

## Context

The owner asked for a road whose open lanes slide sideways over time, in
every mode and with no off switch, so that the player changes lanes because
of the road and not only because of donkeys. A lane that is about to end
has to be announced at least one full fair-sight window ahead (ADR 0010) in
every camera view, staying in it has to be a crash that scores like a
donkey crash, and the one-button modes must still work with one button.
Above all, the generator has to prove for every stretch it lays that a
single car with human reactions can get through, donkeys and shifts
together.

Before this change a lane was an index into the current road (0 or 1, and
2 on a three-lane stretch), and the planner's feasibility check only knew
about rows of donkeys and the press count between them.

## Decision

1. **Lanes are fixed positions; the road moves across them.** The band is
   four positions wide, W X Y Z (0 to 3). The road is open on a `Layout`
   of two or three neighbouring positions. Cars, donkeys, barriers, mud and
   markings all live in band coordinates, so nothing has to be renumbered
   when the road moves, and the views draw everything from one lateral
   scale. Three-lane stretches use the same four-wide band (W X Y or
   X Y Z) rather than a five-wide one: a wider band would make every road
   narrower on a phone screen for the sake of one more shift direction, and
   a three-lane road on four positions still moves one position at a time.
2. **One lane at a time, open before close.** A `LaneChange` at road
   position `at` gives the new layout, the lane that opens and the lane
   that closes. Consecutive layouts share all but one lane. The new lane
   widens in over 10 m before `at` and can be entered from `at`; from `at`
   the old lane can no longer be entered but can still be driven as far as
   its barrier, at least `CLOSING_DISTANCE` (= `SIGHT_DISTANCE`, 16 m)
   further on. The next change waits until this one has finished tapering.
3. **The barrier is a hazard.** It stands in the closing lane like a
   donkey, crashes a car that stays there through the same code path, and
   so counts as a crash in every mode's scoring: a life in the runs, a
   point to the Donkey in the duels, an emptied meter in Rival Driver. Its
   crash reuses the split-car signature, with the barrier rocking, cones
   flying and BONK! for BOOM!. Leaving the lane in its last moments earns
   the near-miss tiers; leaving it early is neutral.
4. **The telegraph.** The closing lane is painted with chevrons, two merge
   arrows, a line of cones over its last half and a "lane ends" sign where
   it starts to close; the first shift of a run is also introduced by a
   road sign and a caption. The markings start at `at`, which comes into
   view a full sight before the car reaches it, and the barrier is at least
   one more sight beyond, so every view shows the lane ending at least one
   reaction window before its barrier.
5. **One-button press rule.** A press moves one open lane to the right and
   wraps from the rightmost to the leftmost (with two lanes, simply the
   other one). From a closing lane a press merges into the open lane
   beside it. A press never targets a closing lane.
6. **The proof walks through time.** `engine/reach.ts` decides whether a
   player can get past an obstacle (a donkey row or a barrier) from every
   lane the obstacle before may have left them in, starting
   `REACTION_SECONDS` (0.3 s) after it could be known and after the mode's
   slack, pressing no more often than every `PRESS_SECONDS` (0.14 s, plus
   the mud delay). Because the road changes shape between two obstacles,
   the search may press (to wherever the real button sends the car at that
   road position) or wait until the next lane change. The planner places
   every row and every barrier through this check and moves it half a beat
   later until it passes. The duels use the same check to place their
   barriers. The autopilot and the CPU rival drive with the same search, so
   they find every way the proof found.
7. **Tested over many seeds.** Property tests rebuild the proof from the
   finished road for 40 seeds in five plans each, check that every change
   shares all but one lane and leaves a full sight before its barrier, and
   drive the roads with a 0.3 s autopilot without a crash.
8. **Classic Duel shifts gently.** The 1981 rules and scoring stay. From
   the second donkey of a climb, while the window is still at least 0.45 s,
   18 % of waves bring a shift, whose lane only starts closing once that
   wave's donkey is past; its barrier is placed by the same proof. About
   one wave in ten shifts.
9. **Daily Road continuity.** The generator change means a seed lays out a
   different road. Each Daily result now records the rules it was driven
   under (`DAILY_RULES` = 2; results without a number are rules 1). Old
   results stay as records, the streak carries on, and the road number
   keeps counting from the launch date.

## Alternatives considered

- **Lanes as indices into the current road.** Every shift would renumber
  the car, the donkeys and the mud, and a "lane 1" would mean different
  places a second apart. Rejected.
- **A closing lane that closes at once.** Simpler, but it would turn a
  shift into a hazard you can only react to, never plan for. Rejected for
  open before close with a full sight of warning.
- **Check feasibility by simulation.** Driving each candidate road with the
  autopilot would only prove that one driver got through, not that every
  lane the previous row may have left a player in has a way out. Rejected
  for the exhaustive search over lanes and moves, which is tiny with four
  lanes.

## Consequences

- `SIGHT_DISTANCE` and the reaction windows are unchanged. ADR 0010 is
  extended, not replaced: the layout tests now cover all four lane
  positions and Rival Driver's two-car chase layout.
- Every mode is a little different to drive, so Road Trip, Endless and the
  Daily Road were re-balanced with the scripted phone player; the numbers
  before and after are in `docs/games/donkey-dash.md`. Two Snow Road legs
  needed more slack to keep the curve smooth.
- The engine fingerprint changed, and with it every seed's road.
- A future change to the road's shape must keep "all but one lane in
  common": the press rule, the tapers and the lane-end markings rely on it.
