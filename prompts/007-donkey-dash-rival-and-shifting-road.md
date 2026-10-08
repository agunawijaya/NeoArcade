# 007 — Donkey Dash: shifting road and Rival Driver

## Read first

1. `CLAUDE.md`, `docs/ARCADE-PASS.md`, `BACKLOG.md` (items DD-01, DD-02).
2. `ports/donkey-dash/docs/ARCHITECTURE.md`, `docs/games/donkey-dash.md`,
   `ports/donkey-dash/docs/IDEAS.md`, ADRs 0009, 0010 and 0011.
3. The engine: `engine/road.ts`, `sight.ts`, `planner.ts`, `hazards.ts`,
   `duel.ts`, `modes.ts`, `run.ts`, `autopilot.ts`, `fingerprint.ts`. Build
   on them; don't rewrite what works.

## Goal

Two owner-requested changes to Donkey Dash:

1. **Shifting road (DD-02), always on, in every mode.** The road is no
   longer a fixed pair of lanes: the open lanes slide sideways over time,
   so the player must change lanes because of the road, not only because of
   donkeys.
2. **Rival Driver (DD-01)**, a new mode: two cars on a three-lane road,
   same speed, side by side, unable to enter an occupied lane — so one
   driver can trap the other into a donkey or a closing lane. Two humans
   on one screen, or a human against a CPU rival.

## 1. Shifting road (all modes, no off switch)

- The road has a row of lane **positions** wider than the number of open
  lanes (e.g. W X Y Z for two lanes; five positions for three lanes — pick
  what reads best). The set of open lanes moves one position at a time:
  `XY → YZ → XY → WX …`; three lanes `WXY → XYZ …`. Consecutive layouts
  always share all but one lane.
- **Open before close:** the new lane opens first; the old lane closes a
  moment later. A closing lane is telegraphed with cones, chevrons, a
  "lane ends" sign and a merge arrow, at least one full fair-sight reaction
  window ahead (ADR 0010) in every camera view.
- Staying on a closed lane = hitting the barrier. It counts exactly like a
  donkey crash in each mode's scoring, with its own funny crash (cones
  flying, the barrier wobbling) — reusing the split-car signature.
- **One-button modes:** a press moves to the other open lane (two lanes)
  or cycles through the open lanes (three-lane stretches), always within
  the currently open set. Document the rule in HOW-TO-PLAY with a diagram.
- **Solvability:** the hazard generator and `planner.ts` must prove, for
  every generated stretch, that a safe path exists for a single car given
  donkeys **and** shifts within the reaction window. Add property tests
  over many seeds.
- **Classic Duel too** (owner decision): the 1981 rules and scoring stay,
  with the road shifting gently (lower shift frequency than other modes).
- Rendering: in Chase view the shifts read as real curves (the road bends
  toward the new lanes); in Classic and Isometric views the road visibly
  snakes across the landscape. Scenery follows the road edge.
- **Re-balance** Road Trip, Endless and Daily Road with the autopilot so
  difficulty curves stay as smooth as before. Introduce shifts gently in
  the first Road Trip legs.
- **Daily Road continuity:** the generator change alters what a seed
  produces. Bump the daily rules version, keep past results and streaks
  valid as records, and make sure the daily number keeps counting.

## 2. Rival Driver mode

| Topic | Rule |
|---|---|
| Road | Three open lanes, with the shifting road on top. |
| Cars | Two cars, always at the **same speed and the same screen row**, side by side. Progress is shown by a race meter per driver (like the original's car climbing the screen). |
| Controls | **Two buttons per driver**: move left / move right. Keyboard: driver 1 A/D, driver 2 ←/→ (rebindable); touch: two zones per player on each half of the screen; one gamepad each. This is the only mode that breaks the one-button rule — say so in HOW-TO-PLAY and in `docs/games/donkey-dash.md`. |
| Blocking | A move into the lane the other car occupies is refused (a short bump, a horn, a puff) and the car stays put. Cars never collide. |
| Same tick | If both cars try to enter the same free lane in the same tick, neither moves. |
| Donkeys | Never fill every open lane at once. The planner guarantees each car **on its own** always has a safe path; the only way to be trapped is by the other driver. |
| Crash | Hitting a donkey or a closing barrier: crash animation, the car loses its progress (back to the start of its meter, as in 1981), then re-enters in a free lane after a short, clearly shown respawn during which it does not block. |
| Round | First driver to fill the meter (the original's ~11 dodges, tune it) wins the round. Match: first to N rounds (default 3, settings 1–9). |
| Stats | Per match: dodges, crashes, **traps sprung** (crashes caused by blocking), longest clean streak. Shown on the results screen. |
| Views | All three camera views with the same fair reaction window. |

**CPU rival:** Easy / Normal / Hard / Brutal. It sees exactly what a human
sees (same sight window, a human-like reaction delay per level). Easy only
avoids danger; Normal sometimes blocks; Hard reads the road ahead and sets
deliberate traps; Brutal sets traps and escapes yours, but still makes
occasional human mistakes. Give each level a car look and a name. Test that
each level behaves as described (trap attempts per minute, crash rate)
over many seeded matches.

Menus: Rival Driver gets its own entry on the title screen with "vs Friend"
and "vs CPU". The Settings screen shows the two-button layout.

## 3. Arcade Pass and docs

- New badges in `pass.manifest.ts`, e.g. Lane Changer, Merge Master,
  Gotcha! (spring a trap), Slippery (escape three traps in one match),
  Rival Ready (beat the CPU on Hard), Road Rage (secret: lose to Easy).
  XP per the Pass caps.
- Update ABOUT (teaser for the shifting road and Rival Driver),
  HOW-TO-PLAY (lane rules, controls table, tips for trapping and escaping,
  CPU levels) and ARCHITECTURE (lane-position model, shift generator,
  solvability proof, two-car blocking resolution, CPU rival — Mermaid).
- ADRs: shifting-road model and solvability; two-car blocking and
  same-tick resolution; CPU rival design. Update ADR 0010 if sight changes.
- `docs/games/donkey-dash.md` diff log; `PORTS.md`; mark DD-01 and DD-02
  as Done in `BACKLOG.md` with the commit.

## Workflow

1. Engine: lane positions and shifts, barrier crashes, planner proofs —
   tests first; then two-car state, blocking, same-tick rule, respawn,
   race meter — tests; then CPU rival with behaviour tests.
2. Re-balance existing modes with the autopilot; record before/after
   numbers in `docs/games/donkey-dash.md`.
3. Rendering of shifts in all three views; Rival Driver HUD and results.
4. Art-direction loops (at least four): lane-closing approach and barrier
   crash in each view, Rival Driver mid-trap in each view, results screen,
   touch layout on phone landscape, light and dark, at 1440×900, 1024×768,
   844×390 → critique → fix.
5. Playtest via Playwright: full Rival matches CPU vs CPU at every level
   pairing, and scripted human vs CPU; tune until Normal feels fair and
   Brutal feels sharp, not cheating.
6. Tests (all three browsers for determinism), lint, build.

## Deliverables

Features above; docs, ADRs, screenshots in `media/`, Hall screens refreshed
if they changed; one commit: "Add the shifting road and Rival Driver to
Donkey Dash".

## Report at the end

What was built, final tuning numbers, deviations and why.

## Suggested run

Opus 5.5, effort **xhigh**: "Read prompts/007-donkey-dash-rival-and-shifting-road.md and do it."
