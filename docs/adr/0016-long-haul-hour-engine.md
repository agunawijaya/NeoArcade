# ADR 0016 — Long Haul: an engine that settles an hour, with front ends that play it

- **Status:** accepted
- **Date:** 2026-10-04
- **Context:** Long Haul (prompt 006)

## Context

Trucker (early 1980s) is a turn-based game whose turn is an hour on the road: the
program asks for a speed, works out everything that happens in that hour
(a crash, a blowout, a patrol car, fuel, miles, waypoints) and prints it.
The remake has to keep those rules exactly, and also offer a continuous
real-time drive, a leg-by-leg mode close to the original's rhythm, and an
Easter-egg text mode that is the original's prompts, all on the same rules.
The Daily Haul needs every player who makes the same choices to get the
same trip, in every browser (ADR 0009).

## Decision

- **The engine settles one hour at a time.** `driveHour(trip, speed)`
  (`src/engine/hour.ts`) mutates a plain `Trip` object and returns the
  hour's events, in the original's order. Stops (`stop.ts`), the arrival
  (`arrival.ts`) and the start (`start.ts`) are separate functions with the
  same shape. No DOM, no clock, no rendering: the engine can drive thousands
  of trips a second for the balance scripts and tests.
- **Events are data.** Everything that happens is a `TripEvent` with the
  hour and mile it happened at, kept on the trip. Cards, sounds, map markers,
  the logbook, the CB, the text mode and the Arcade Pass all read the same
  events.
- **Randomness comes in named streams.** Every draw comes from
  `streamFor(seed, moment, key)`: the n-th hour, the scale at a given place
  on a given visit, the n-th truck stop. Luck at a moment does not depend on
  how many draws happened before it, so a driver who stops at Gallup and one
  who does not still meet the same scale at Amarillo, a CB tip about a
  radar trap can be true, and the planner can forecast.
- **Arithmetic that agrees everywhere.** The engine uses only operations
  every browser rounds the same way (ADR 0009); the blowout test squares
  both sides instead of taking the original's square root. A test greps the
  engine for forbidden functions, and a browser test compares a 450-line
  trace (whole trips, a year of dailies, career boards) with Node's.
- **Front ends play the hour back.**
  - *Real time and leg by leg* share `TripSession` (`src/game/session.ts`).
    It asks the engine for the hour, then `planHour` places each event at
    its moment inside the hour (a waypoint at its milepost, a blowout
    somewhere along the way), and the session plays the hour over about
    three seconds (or 0.6 s leg by leg), stopping at the events that are
    cards. A stop offer is a sign in real time and a question leg by leg;
    real time also asks when passing the stop would be risky.
  - *Text mode* (`src/ui/text-mode.ts`) calls the engine directly, one hour
    per typed answer, as the original did.

## Consequences

- The real-time drive is not a physics simulation: within an hour the rig
  moves at the hour's speed, and a change of throttle takes effect at the
  next hour, exactly as a new answer did in the original. The throttle shows the
  speed set for the coming hour.
- Because the engine settles the hour first, the screen knows what is
  coming within the hour and can stage it (a patrol car appearing in the
  mirror before the card).
- New front ends are cheap; changes to the rules are not, since the Daily
  Haul depends on them being identical for everyone on a given day.
