# ADR 0020 — Rival Driver: two cars that block, and the same-tick rule

- **Status:** accepted
- **Date:** 2026-10-15
- **Context:** Donkey Dash (prompt 007, backlog DD-01)

## Context

Rival Driver puts two cars side by side on a three-lane road that shifts,
at the same speed and on the same screen row. Each driver steers with two
buttons, left and right. A car may not move into the lane the other one
occupies, so one driver can box the other in, in front of a donkey or a
lane that is ending. The cars never collide. If both try for the same free
lane at the same moment, neither moves. A crash costs the car its progress
and it comes back after a short, visible respawn during which it does not
block. Progress is a race meter, like the original's car climbing the
screen.

The rules have to be exact and order-free, because two people will argue
about them, and deterministic, because a seed and two input streams must
replay the same race in Node and in every browser.

## Decision

1. **One road, two cars.** A Rival match runs one `Drive` (road, speed,
   hazards) and two `RivalCar`s with their own lane, meter, state and
   stats. Both share the nose position, so "the same row" is true by
   construction, and every hazard is met by both cars at the same moment.
2. **Moves are resolved together.** Each step, each driver's input becomes
   a target with the two-button rule (`stepTarget`: one open lane left or
   right), from the lanes both cars were in at the start of the step. Then
   a move is refused if both cars are solid and the target is the other
   car's lane (`bump: car`), or both targets are the same lane
   (`bump: tie`, and neither moves). A target off the open road is a bump
   too (`edge`). Because both targets are computed before either car moves,
   the result does not depend on which driver is handled first, and two
   racing cars can never swap or share a lane. A refused move plays a bump,
   a puff and the blocking car's horn.
3. **Crash, out, ghost.** Hitting a donkey or a barrier empties that car's
   meter and clean streak and takes it off the road for 1.3 s, while its
   halves fly and the race goes on. It comes back as a see-through ghost
   for 1.2 s, in the open lane away from the other car with the most clear
   road ahead. A ghost cannot crash and does not block or get blocked, and
   it is waved across rather than through a barrier. It turns solid only
   on an open lane of its own.
4. **Traps are attributed by the engine.** A crash is a trap sprung by the
   other car if that car refused one of this car's moves in the last
   1.6 s, or if every lane that was safe at the row lay at or beyond the
   other car. A car that was blocked with trouble coming and still got
   past it has escaped a trap. Both counts go on the results screen and to
   the Arcade Pass.
5. **The planner promises each car its own way out.** Rival roads are
   planned with two-button steering, starting from every open lane, so
   every row and barrier is proved drivable from any lane a car may be in.
   A row of donkeys never fills every open lane. Only the other car can
   take a way out away.
6. **The meter is eight, not eleven.** Each donkey row passed cleanly fills
   one box; the first full meter takes the round. With two cars, eleven
   meant that a single slip near the top decided a round outright; eight
   keeps a round winnable after a crash. If both meters fill on the same
   row, it is a dead heat: from then on the planner lays only rows with
   one gap, and the first crash decides the round. Matches are first to N
   rounds, 1 to 9, default 3; each round gets a fresh road.

## Alternatives considered

- **Resolve driver 1, then driver 2.** Simple, but driver 1 would always
  win a race for the same lane. Rejected for simultaneous resolution.
- **Let the cars swap places** when each steers into the other's lane.
  It reads as the cars passing through each other. Rejected.
- **Collisions** (both cars spin out). The brief rules them out, and they
  would make a block cost the blocker as much as the blocked.
- **A respawn that blocks.** A car that reappears beside you could trap
  you for free. Rejected for the ghost.

## Consequences

- The blocking rules are a small pure function of two lanes and two
  inputs, tested directly (`rival.test.ts`), including whole matches
  between two Hard CPUs that check two racing cars never share or swap a
  lane.
- Two humans on one browser both count for the Arcade Pass; against the
  CPU only the human's actions count (ADR 0021).
- The Chase view needed a two-car layout so both cars fit; the fairness
  tests cover it.
- Rival Driver is the only two-button mode, which the HOW-TO-PLAY guide
  and the game notes call out.
