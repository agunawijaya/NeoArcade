# ADR 0030 — Flight 312: the glass deck, one engine with a small flight management computer

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Flight 312 part 2 (prompt 010)

## Context

Prompt 010 adds a second flight deck, the two-crew glass cockpit of the
747-400 era, "same engine, same world", selectable before each flight, with
a PFD, an ND, the upper and lower EICAS, a mode control panel with LNAV,
LOC and APP and an autothrottle, and a deliberately simplified CDU: route,
approach, performance and progress. The classic deck's autopilot (ADR 0023)
has no route following, and its speed mode does not manage thrust. The 1982
Rules have no autopilot at all.

## Decision

- **The deck is part of the setup.** `FlightSetup.deck` is `classic` or
  `glass`; the 1982 Rules always fly the classic one. It is engine state,
  because the glass deck changes what the engine does, and so a replay
  needs it.
- **A flight management computer in the engine, kept small.** `fms.ts`
  holds the route (the program's VOR stations, from the briefing's plan),
  the destination's ILS loaded after it as three fixes on the final (CF at
  15 nm, FF at 6 nm, the runway), edits that wait as a modification until
  EXEC, a direct-to, the takeoff and approach speeds accepted from the
  weight, LNAV's guidance (great-circle legs, cross-track error, an
  intercept up to 45°, the next leg 1.5 nm before the waypoint) and the ILS
  tuned automatically inside 50 nm. There is no VNAV: climbs and descents
  are flown with the mode control panel, and the docs say so.
- **Two new modes in the same autopilot.** `afds.ts` gains the `route` roll
  mode (LNAV, armed on the ground, engaged above 50 ft) and flight level
  change: the speed on the elevator while the autothrottle sets climb
  thrust or idle, levelling off at the altitude in the window. Leaving the
  speed mode ends a level change. In the speed mode, climbing to a higher
  window the path never goes below a climb; this also stops the classic
  deck's IAS mode from diving to buy speed.
- **No flight engineer.** The glass deck's fuel system opens the crossfeed
  when the symmetrical tanks drift 2,000 lb apart and closes it once level;
  the engineer's view is not offered.
- **The screens read a model, like the classic dials.** `cockpit/glass/`
  works out a `GlassModel` once a frame (`glass-model.ts`) and draws it in
  Canvas 2D: `pfd.ts`, `nd.ts`, `eicas.ts`, the panel layout, the mode
  control and EFIS panels (`glass-panel.ts`), the pedestal with the CDU
  (`glass-pedestal.ts`, `cdu.ts`). What the screens show — the map's range
  and mode, the lower EICAS page, the minimums — is the cockpit's own state,
  not the flight's. The CDU turns its keys into crew commands (ADR 0029);
  it takes the keyboard through a hidden text field while it has the focus,
  so typing an ident never moves a lever.

## Consequences

- The test pilot flies the glass deck on LNAV and climbs in level change,
  so the balance runs and the determinism trace cover the new code; every
  destination lands at every level on both decks
  (`scripts/balance.ts all all flight glass`).
- Displays are drawn, not traced, from public descriptions of the -400's
  EFIS and EICAS; where the game simplifies (four lower EICAS pages, six
  CDU pages, one CMD for three autopilots) the behaviour notes list it.
- The classic deck's speed mode no longer descends to accelerate when its
  altitude window is above: a deliberate change to part 1, recorded in the
  diff log.
