# ADR 0023 — Flight 312: one engine, two flight models, four realism levels

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Flight 312 (prompt 009)

## Context

Prompt 009 asks for four realism levels: *1982 Rules* (the original
program's model and verdicts, bugs fixed), *Arcade* (forgiving), *Pilot* (a
real point-mass model of the classic jumbo) and *Captain* (Pilot plus
procedures). The original's model is not a simplification of a real one:
airspeed in the cruise is `800 − 100·thrust − 2·pitch`, thrust has seven
positions, pitch moves in key presses, and its success and failure rules
are written against those numbers. A real model cannot reproduce those
verdicts, and the original's model cannot fly a real ILS. Everything must
stay deterministic (seeded, fixed step, the same bits in every browser) and
testable without a DOM.

## Decision

- **Two models behind one readout.** `src/engine/program-model.ts` is the
  1982 program, step for step (its own integration, its wind bands, its
  ILS gate and glideslope of 2.82471°, its touchdown rules), with the bugs
  that break it fixed and listed. `src/engine/airframe.ts` is the real
  model: lift, drag (flaps, gear, speedbrake), four engines with spool-up
  (`engines.ts`), weight and fuel in seven tanks (`aircraft.ts`), trim,
  ground effect, the stall, the ground roll. `src/engine/readout.ts` turns
  either into the same `Readout`, so the cockpit, the radios, the warnings,
  the ATC and the reports never ask which one is flying.
- **The level picks the model and the rules.** `flight.ts` builds a flight
  from its setup: 1982 Rules runs `fly-program.ts`; the other three run
  `fly-airframe.ts` with the autopilot of the era (`afds.ts`). Arcade adds
  automatic trim, flaps that follow the speed, a wings-levelling hand,
  hints, the first officer on the radio and wider touchdown limits (900 /
  1,600 ft a minute against 600 / 1,200). Captain adds `procedures.ts` —
  speed limits for flaps and gear, 250 kt below 10,000 ft, altitude busts,
  clearances, checklist deadlines, the stabilised-approach gate at 1,000 ft
  and fuel balance — and strict readbacks in `atc.ts`.
- **Exact maths in the engine.** No `Math.sin`, `Math.exp` or friends in
  `src/engine` (a test scans for them): `exact-math.ts` computes them with
  fixed series so Chromium, Firefox and WebKit produce identical flights,
  which the determinism test checks bit for bit.
- **A scripted test pilot** (`test-pilot.ts`) flies whole flights through
  the same panel, keys and radio a player has, at every level and to every
  destination (`scripts/balance.ts`); its results are the balance numbers.

## Consequences

- The 1982 Rules level keeps the original's feel and verdicts exactly,
  including what is strange about them; the other levels are free to be
  realistic without bending to the program's arithmetic.
- Two models are more code to keep, but the shared `Readout` keeps the
  rest of the game single.
- The real model is tuned to public performance figures of the type
  (rotation and approach speeds by weight, climb rate, Mach 0.84 at FL350,
  fuel flow per engine), checked in `airframe.test.ts` with tolerances; it is
  a flight model for a game, not a certified one.
