# ADR 0020 — Rival Driver: two cars that block, and the same-tick rule

- **Status:** accepted; amended 2026-10-16 by the surge (decisions 8 to 13)
- **Date:** 2026-10-15
- **Context:** Donkey Dash (prompt 007, backlog DD-01; prompt 015, DD-03)

## Context

Rival Driver puts two cars side by side on a three-lane road that shifts,
at the same speed and on the same screen row. Each driver steers with two
buttons, left and right. A car may not move into the lane the other one
occupies, so one driver can box the other in, in front of a donkey or a
lane that is ending. The cars never collide. If both try for the same free
lane at the same moment, neither moves. A crash costs the car its progress
and it comes back after a short, visible respawn during which it does not
block. Progress is a race meter, like the original's car climbing the
screen. Playtesting by the owner added one more rule: two cars must never
be seen in the same lane, not even for a moment.

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
   right). Both are judged against where the cars were at the start of the
   step: a move into the lane the other car is in is refused (`bump: car`),
   even if that car is leaving it, and so are two moves into the same lane
   (`bump: tie`, and neither moves). A target off the open road is a bump
   too (`edge`), except towards a lane that is widening in beside the
   road and is already half there at the nose: the player can see it, and
   nothing stands in a lane before it opens, so the car may take it. Every
   press is carried out or refused in the step it is made, never later. The
   order in which the drivers are handled never matters, and two cars can
   never swap or share a lane. A refused move plays a bump, a puff and the
   blocking car's horn.
3. **Crash, off the road, back in a lane of its own.** Hitting a donkey or
   a barrier empties that car's meter and clean streak and takes it off the
   road for at least `CRASH_OUT_SECONDS` (2.5 s), while its halves fly and
   the race goes on. Off the road it takes up no lane, so it blocks nobody:
   that is the respawn during which it does not block. It comes back solid,
   with a hop and a puff, at the first moment when there is a lane that is
   open, not the other car's, not beside a row of donkeys, safe past every
   row in view (so it can stay put until a new row appears), and does not
   take away the other car's way past any of those rows. Of those lanes it
   takes the one with the most clear road ahead; if there is none, it waits
   a step and looks again. In the playtests it was back within 2.6 s half
   the time, and never later than 4.9 s.
4. **Labels, not just colours.** Each car carries a label in its driver's
   colour (YOU and CPU, or P1 and P2) and sits in a pool of that colour,
   matching the dot on its plate. The Chase camera follows the road rather
   than the two cars' middle, so a car only moves on screen when its own
   driver steers it.
5. **Traps are attributed by the engine.** A crash is a trap sprung by the
   other car if that car refused one of this car's moves in the last
   1.6 s, or if every lane that was safe at the row lay at or beyond the
   other car. A car that was blocked with trouble coming and still got
   past it has escaped a trap. Both counts go on the results screen and to
   the Arcade Pass.
6. **The planner promises each car its own way out.** Rival roads are
   planned with two-button steering, starting from every open lane, so
   every row and barrier is proved drivable from any lane a car may be in.
   A row of donkeys never fills every open lane. Only the other car can
   take a way out away.
7. **The meter is eight, not eleven.** Each donkey row passed cleanly fills
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
- **A see-through ghost**, back on the road at once, that neither blocks
  nor can be blocked and cannot crash for a moment. It was the first
  version, and in play it read as two cars stacked in one lane and made it
  hard to tell which car was yours. Replaced by the longer time off the
  road and the careful comeback above, which keep its effect on the game
  (the other car gets a stretch of road to itself) without the overlap.
- **Coming back sooner, with or without a short shield from donkeys.**
  Measured with the scripted players, a solid comeback after 1.3 s made the
  better driver's edge clearly smaller (58 % against Easy instead of 68 %
  over 160 matches), and a shield made no clear difference: once both cars
  are on the road, boxing in is constant, and the edge comes from the
  stretches when the rival is off it. 2.5 s off the road gives 66 %.
- **Keeping a press towards a lane that is not there yet**, and making
  the move when the lane opens. Tried after the owner found presses
  towards a widening lane refused. In play it moved the car up to 0.7 s
  after the press, when the road had moved on: it could land the car right
  in front of a donkey that was standing at the start of the new lane all
  along. Replaced by taking the lane at once from when it is half there.
- **A respawn that drops in anywhere.** A car that reappears beside you
  could trap you for free, or land in front of a donkey. Rejected for the
  rules in decision 3.

## Consequences

- The blocking rules are a small pure function of two lanes and two
  inputs, tested directly (`rival.test.ts`): either driver order, and
  whole matches between every CPU level and Easy, crashes and comebacks
  included, in which two cars never share a lane; every comeback is
  checked to be safe past every row in view.
- Two humans on one browser both count for the Arcade Pass; against the
  CPU only the human's actions count (ADR 0021).
- A crash costs as much time as in the first version: 2.5 s off the road,
  where it used to be 1.3 s off and 1.2 s as a ghost that could not fill
  its meter. Only now the car is out of the way for all of it, and comes
  back a little later when the road is busy.
- The Chase view needed a two-car layout so both cars fit; the fairness
  tests cover it.
- Rival Driver is the only mode with more than one button (two, then four
  with the surge), which the HOW-TO-PLAY guide and the game notes call
  out.

## Amendment: the surge (2026-10-16, prompt 015, DD-03)

### Context

The owner's example: three lanes, the CPU in the middle, the player on the
right, wanting the left lane. With side-by-side cars the CPU's block is
absolute. The owner wanted to "speed up just enough", cut across in front
of the CPU and drop back Level, and if the CPU moved left meanwhile, to be
unable to drop back there. Hitting a donkey on the way is a normal crash;
staying Ahead is allowed but riskier.

### Decision

8. **Two rows: Level and Ahead.** The drive's nose is the Level line. A
   car rides Level or Ahead, `AHEAD_DISTANCE` (4.9 m: a car length,
   4.5 m, and 0.4 m, so its tail clears a Level car's nose) further up
   the road. Nothing behind: a car behind would be both safer and freer,
   so everyone would sit there. Decision 1 now reads: one road, two cars,
   one speed; each car meets the road at its own nose (`noseOf`).
9. **Surging and dropping back take `SHIFT_SECONDS` (0.4 s).** The car
   moves linearly between the rows, keeps its lane and may not change it
   (`bump: busy`), and fills **both** rows of its lane meanwhile. Four
   buttons per driver: lane left, lane right, surge, drop back; a lane
   press wins over a surge or drop back in the same step.
10. **Blocking by cells.** The road is a grid of cells, a lane and a row;
    a settled car fills one, a shifting car two, a car off the road none.
    Each step each driver's buttons become one claim, a lane change into
    the next lane in the car's row or a shift into the other row of its
    lane, and both claims are judged against the cells held at the start
    of the step: into a cell the other car held, `bump: car`; into a cell
    the other car claims too, `bump: tie` and neither moves. So decision
    2 holds in two dimensions: order-free, no swap, no shared cell. A
    drop back into a Level cell the other car holds or is entering is
    refused: the owner's "door shut", and the car must change lane first.
    Both cars may ride Ahead; then they block each other as before, just
    further up the road.
11. **Ahead sees less, fairly.** Donkeys come into view at the same line
    for both cars, so a car Ahead has 4.9 m less road: 0.79 s at the start
    of a round, 0.584 s at the top speed of 19 m/s. That is the most the
    road proof allows: at top speed what is left must cover a reaction
    and **two** lane changes (0.3 + 2 × 0.14 = 0.58 s), since a row whose
    only gap is two lanes away is fair from an outer lane. The planner
    proves each row from every lane in both rows (decision 6 extended; see
    ADR 0010 for the views).
12. **The reward: a quarter more.** A donkey row passed cleanly while
    settled Ahead fills `AHEAD_DODGE` = 1.25 boxes of the meter instead
    of 1, shown by quarter notches and a "+¼" off the plate. A crash
    while Ahead or half way through a shift is an ordinary crash, and the
    comeback is always Level.
13. **Traps count every refused move.** Decision 5's "refused one of this
    car's moves" now includes a refused cut, surge or drop back; the
    geometric rule (every safe lane beyond the other car) applies only
    when the two cars share a row. A crash after a refused drop back is
    flagged `doorShut` (HUD: "Door shut!"; badge Door Shut).

### Tuning

Measured with the scripted players of `drive.playtest.ts` (100 matches
each side by side, a phone player who reacts in 0.42 s, up to 0.25 s
later at random, and slips out of boxes Ahead). Win rates against Easy /
Normal / Hard / Brutal:

| Ahead distance, bonus | Never rides Ahead | Rides Ahead whenever it can |
|---|---|---|
| 5.6 m, 1.5 (first try) | 55 / 39 / 9 / 2 % | 55 / 49 / 24 / 4 % |
| 4.9 m, 1.5 | 58 / 32 / 15 / 3 % | 74 / 68 / 35 / 6 % |
| 4.9 m, 1.0 | 54 / 30 / 23 / 8 % | 52 / 45 / 12 / 2 % |
| **4.9 m, 1.25 (chosen)** | 54 / 30 / 19 / 7 % | 55 / 50 / 16 / 1 % |

5.6 m broke the road proof at top speed (one press after a reaction, not
two), so the distance came down to 4.9 m, which made riding Ahead safer;
the bonus came down from 1.5 to 1.25 so that riding Ahead pays against
the levels that do not follow you there (Easy, Normal) and costs you
against those that do (Hard, Brutal). It is tempting, not dominant. The
same phone player who never surges, as before the surge, wins 63 / 39 /
25 / 7 % (it was 65 / 38 / 20 / 10 % before): the levels feel as they
did. Mixing surges in at quiet moments cost the scripted player more than
either extreme (45 / 27 / 15 / 2 %): a surge is a 0.4 s commitment, and
a donkey that appears meanwhile is nearer than it would be Level.

### Alternatives considered

- **A third row, behind.** Safer and freer than Level, so everyone would
  sit there. Rejected (owner decision).
- **Instant surges.** A car could hop into a gap and out again in one
  step, and nobody could ever shut a door. The 0.4 s, filling both rows,
  makes a surge a commitment a rival can read.
- **A longer Ahead, 5.6 m (a car length and a metre).** The first try:
  plainer on screen, but at top speed it left time for one lane change
  after a reaction, not two, and 17 seeds out of 30 had a row a car Ahead
  could not get past. Rejected for 4.9 m.
- **A half box per row Ahead.** Riding Ahead all the time then beat every
  level more often than staying Level. Rejected for a quarter.
- **A slot marker behind a car Ahead,** showing where it would drop back.
  The other car sitting in it already says the door is shut; the marker
  added clutter to every frame. Not added.

### Consequences

- `rival.test.ts` extends the invariants to cells: random presses over
  whole matches never put two cars in one cell or swap them, either
  driver order; the owner's example plays out step by step; the road
  proof runs for a car Level and a car Ahead.
- Every view draws a car Ahead true to scale beside the road (ADR 0010).
- The HUD's touch zones became a pad of four in each driver's corner.
