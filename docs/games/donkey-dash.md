# Donkey Dash — notes on the original and a log of every change

Port of **DONKEY.BAS**, "The IBM Personal Computer Donkey", Version 1.10,
© IBM Corp. 1981, 1982 (the copyright lines of the listing). Reference
source: `sources/Donkey/donkey.bas`, a saved GitHub page of
`pmachapman/basic-samples`, `BASICA/DONKEY.BAS`; the 132 lines of BASICA are
in its `rawLines` array. Line numbers below are the program's own.

The port reimplements the behaviour from scratch. No code, `DRAW` strings,
sprites or title screen were copied; the donkey and the car are new
drawings.

## How the original behaves

### Start-up (l. 1010–1299)

- A 40-column text screen: "IBM", "Personal Computer", a light-green
  (`COLOR 10`) double-line box (`CHR$(213)`, `205`, `184`, `179`, `212`,
  `190`) holding "DONKEY" and "Version 1.10", the copyright line and a yellow
  "Press space bar to continue". Esc quits.
- It refuses to run without the Color/Graphics Adapter ("HOLD IT!"), and
  without Advanced BASIC (`PLAY "p16"` must work).

### The playfield (l. 1410–1670)

- `SCREEN 1,0: COLOR 8,1`: 320 × 200, four colours, palette 1 (black,
  cyan, magenta, white) on a dark-grey background.
- A white frame round the screen, two cyan side panels (`LINE (6,6)-(97,195)`
  and `(183,6)-(305,195)`) with "Donkey" on the left and "Driver" on the
  right, their scores below, and "Press Space Bar to switch lanes" and
  "Press ESC to exit" on the right.
- The road runs down the middle between x 100 and 180, with centre dashes
  every 20 pixels at x 140.
- The car and the donkey are drawn once with `DRAW` and `PAINT`, then
  captured with `GET`: the car is 29 × 45 pixels seen from above, the donkey
  33 × 26 seen side on, with two pixels knocked out for eyes (`PRESET`).

### One wave (l. 1670–1770)

- `CY = CY - 4`: the car moves 4 pixels up the screen. If that takes it
  above y 60, the **Driver** wins the point (l. 1680 → 2230). The car starts
  at y 105, so the check fires on the twelfth climb: **eleven donkeys dodged
  in a row** reach the top.
- `DX = 105 + 42 * INT(RND * 2)`: the donkey's lane, x 105 or 147, 50/50.
- `FOR Y = (RND * -4) * 8 TO 124 STEP 6`: the donkey starts between 32
  pixels above the screen and its top edge (`Y` is an integer, so the start
  is rounded), and falls 6 pixels a step to y 124.
- Each step waits `SOUND 20000,1`: one tick of the PC timer, 18.2 a
  second (an inaudible tone used as a delay). So the donkey falls about
  109 pixels a second and a wave lasts (124 − start) / 6 ticks, 1.1 to 1.4 s.
- Each step reads a key. Esc quits; **any other key flips the car to the
  other lane at once** (`CX = 252 - CX`, x 105 ↔ 147) with a click
  (`SOUND 200,1`). `POKE 106,0` empties the keyboard buffer, so one press is
  one switch.
- The donkey is only drawn once its top edge is at y 3 or below.
- **Collision:** `IF CX = DX AND Y + 25 >= CY`: same lane, and the
  donkey's bottom edge has reached the car's top edge.
- `IF Y AND 3 THEN PUT (140,6),B%`: an XOR of a full-height stripe over the
  centre dashes makes them flicker as if the road were moving.

### Reaction time

The donkey is visible from y 3 and hits when `Y + 25 >= CY`, so the window
between seeing it and being hit is (CY − 28) pixels of fall: **73 pixels
(0.67 s) on the first donkey**, shrinking by 4 pixels every climb to **33
pixels (0.30 s) on the eleventh**. The climb up the screen is the original's
only difficulty curve, and it is steep.

### A crash (l. 2060–2220)

- "BOOM!" in the Donkey's panel; the Donkey scores (`SD = SD + 1`).
- Both sprites are cut in two with `GET`: the donkey at 17 pixels from its
  left, the car at 15.
- Seven steps (`FOR P = 6 TO 0 STEP -1: Z = 1/2^P`) move the halves: the
  car's left half to the bottom-left corner, its right half to the
  bottom-right, the donkey's halves to the top-left and top-right. Each
  step covers 1/64, 1/32 … 1/1 of the remaining way, so the halves creep,
  then leap. Each step plays a random low tone (`SOUND 37 + RND*200, 4`).
- A pause (`FOR Y = 1 TO 2000`), then the screen clears and the car starts
  over at the bottom, in the left lane. Scores are kept.

### A point to the Driver (l. 2230–2250)

"Donkey loses!" in the Driver's panel, `SM = SM + 1`, a shorter pause, and
a fresh start. There is no end: the game goes on until Esc.

## What the port keeps

- One button that switches lanes instantly, on a road of two lanes most of
  the time (the road now shifts, see below; Rival Driver alone has more
  buttons, four).
- A donkey at a time in Classic Duel, a random lane, a random start above
  the screen, the same speed and the same wave length, on this scale: the
  engine's one fairness constant (`SIGHT_DISTANCE`, 16 m) is the original's
  77 pixels ahead of the car, so 1 pixel = 0.208 m and the donkey falls at
  22.7 m/s (`engine/constants.ts`, checked in `original.test.ts`).
- The climb: 4 pixels (0.83 m) per dodge, eleven dodges to win, and with
  it the shrinking reaction window, 0.67 s down to 0.30 s.
- Donkey vs Driver scoring, and the crash as the signature moment: halves
  to the four corners on the original's accelerating curve.
- The double-line box on the title, in CGA light green, unfolding into the
  new logo. An optional CGA filter (black, cyan, magenta, white) with a CRT.

## Diff log: every deliberate change

| # | Original | Port | Why |
|---|---|---|---|
| 1 | Steps of 6 pixels, 18.2 a second. | A fixed 60 steps a second, continuous motion at the same speed. | Smooth on modern screens; the collision moment moves by at most a sixtieth of a second. |
| 2 | A donkey that has passed the car can still hit it: the check has no lower bound, so switching into its lane before the wave ends is a crash. | A donkey is dangerous only while it overlaps the car (4.5 m of car plus 1.2 m of donkey). | It read as a bug: the donkey is visibly behind you. |
| 3 | The next wave starts only when the donkey reaches y 124. | Kept for Classic Duel and Donkey vs Driver (`duel.ts`, `endGap`). | Faithful pacing. |
| 4 | The donkey is only drawn once fully on screen, then pops in. | The same rule, as the fairness contract of all three camera views: a hazard appears at the sight line, nowhere else (`render/layout.test.ts`). | One constant decides how long you get to react, whatever the view. |
| 5 | The car climbs the screen. | Classic view: the same. Chase view: the crest of the hill comes closer instead. Isometric view: the road ahead is scaled so the end of the screen is always the sight line; beside and behind the car it is drawn at true scale, so a donkey looks past the car exactly when it is. | Each view shows the same reaction window (ADR 0010). |
| 6 | "BOOM!" in the panel; halves in 7 hops. | A comic BOOM! over the pile-up, a slow-motion beat, then the halves spin away on the same curve (`render/crash.ts`), with hay and sparks. | The signature moment, reimagined. |
| 7 | No end. | Classic Duel is first to N (default 5, from 1 to 11). | A match needs a finish; N is a setting. |
| 8 | Key clicks and timer beeps. | A synthesized soundtrack per route, a lane whoosh, a hee-haw, chimes, a crash. | Sound is new. |
| 9 | — | New modes: Road Trip (5 routes × 3 legs, stars), Endless (3 lives, speed rises), Daily Road (a fixed road per UTC day), Donkey vs Driver (a second player steers the donkey). | The brief. The original's rules live on in Classic Duel. |
| 10 | — | Near misses (three tiers), combos, carrots, a rhythm bonus, lives and a score, in the runs only. | Game feel; Classic Duel keeps the original score. |
| 11 | — | Hazards: pairs, hesitant donkeys, herds with a gap, mud, three-lane stretches, carrots; off by default in Classic Duel. | The brief; every pattern is checked to be drivable by a human (`planner.test.ts`). |
| 12 | Car at x 105/147, road 80 pixels wide. | Lanes 3.5 m wide; the car is 4.5 m long, a donkey 1.2 m deep. | Modern proportions for the new views; the duel's timings are unchanged. |
| 13 | Esc quits. | Esc pauses; the Hall button leaves. | A web page, not a program. |
| 14 | Requires the Color/Graphics Adapter and BASICA. | Runs anywhere with a browser. | — |
| 15 | Two fixed lanes. | The road shifts, in every mode, with no off switch: lanes are positions W X Y Z, two (or three) are open, and the open set slides one position at a time. The new lane opens first; the old one closes at a barrier at least one full sight (16 m) later, marked with chevrons, cones, a "lane ends" sign and merge arrows (`engine/road.ts`, `render/lanes.ts`). | Owner request (DD-02, prompt 007); [ADR 0019](../adr/0019-donkey-dash-shifting-road.md). |
| 16 | — | Staying in a closing lane hits its barrier: a crash exactly like a donkey's in every mode's scoring (a life, a point to the Donkey, an emptied Rival meter), with its own crash: the car splits as in 1981, the barrier rocks, cones fly, BONK!. Leaving the lane in its last 0.32 s is a near miss; earlier, a neutral pass. | Owner request; reuses the signature crash. |
| 17 | Two lanes, always. | Classic Duel shifts gently: from the second donkey of a climb, while the window is at least 0.45 s, 18 % of waves bring a shift, and the lane only starts closing once that wave's donkey is past. About one wave in ten; the 1981 rules and scoring are unchanged. | Owner decision. |
| 18 | — | Three-lane stretches open and close like any shift: one outer lane ends at a barrier (before, the middle lane merged right with no warning). | One mechanism for every change of the road's shape. |
| 19 | One key. | **Rival Driver**: two buttons per driver, left and right (four since #24). The only mode that breaks the one-button rule. | Owner request (DD-01): blocking needs a direction. |
| 20 | Eleven dodges in a row reach the top. | Rival Driver's race meter fills in **8** clean donkey rows; a crash empties it, as in 1981. Classic Duel keeps eleven. | With two cars, eleven let one slip near the top decide a round outright; eight keeps a round winnable after a crash, and CPU-against-CPU matches stay close between equal levels. |
| 21 | — | Rival Driver's rules: refused moves into the other car's lane, neither car moving when both go for the same lane in the same step, two cars never in one lane, a crashed car off the road for 2.5 s and back in a fair lane of its own, YOU/CPU or P1/P2 labels on the cars, a lane widening in beside the road can be taken once it is half there, and every press is carried out or refused at once, never later, traps attributed by the engine, dead heats settled by sudden death; a CPU rival at four levels. | [ADR 0020](../adr/0020-donkey-dash-two-car-blocking.md), [ADR 0021](../adr/0021-donkey-dash-cpu-rival.md). |
| 22 | — | Daily Road results record the rules they were driven under (`DAILY_RULES` 2). Results from before the shift are kept as records, marked on the calendar; the streak and the road number carry on. | The same seed now lays out a different road. |
| 23 | — | The autopilot, the planner and the CPU rival share one search (`engine/reach.ts`) that walks through time as the road changes shape. | One proof of fairness, used by everything that drives. |
| 24 | — | **Rival Driver's surge.** Each car rides Level or Ahead (4.9 m further up the road); surging or dropping back takes 0.4 s, during which the car keeps its lane and fills both rows of it. Blocking is by lane and row: a car Ahead can cut across a Level car's bonnet; a drop back into a Level spot the other car holds is refused ("door shut"); both cars may ride Ahead. A car Ahead sees 4.9 m less road (0.79 s down to 0.58 s) and a row passed Ahead fills 1.25 boxes of the meter. Crashes Ahead are ordinary crashes; the comeback is always Level. Hard and Brutal CPUs surge to slip past, take your lane, follow you Ahead and shut the door; Normal only to escape; Easy never. | Owner request (DD-03, prompt 015); [ADR 0020](../adr/0020-donkey-dash-two-car-blocking.md) and [ADR 0021](../adr/0021-donkey-dash-cpu-rival.md), amended. |
| 25 | — | Four buttons per Rival driver, W A S D and the arrow keys, rebindable; the gamepad's up and down surge and drop back; the touch zones became a pad of four arrows in each driver's corner. | Owner decision (DD-03). |
| 26 | — | A car Ahead is drawn where the engine counts it in every view: true scale beside it, a sight bracket in its colour from its nose to the sight line, headlights that end there, an ▲ AHEAD chip and quarter notches on its plate, dust kicked up by a surge and brake lights on a drop back. | The shorter sight and the bonus must be readable (ADR 0010, updated). |

## Where the brief and the source disagree (the source wins)

- **Start height.** The brief says "a random start between −32 and 0";
  the source agrees, but the value is rounded into an integer, so −32 itself
  can happen. The port rounds too.
- **Eleven dodges.** "About 11" in the brief; exactly 11 in the source (the
  check fires on the twelfth climb). The port uses 11.
- **The reaction window shrinks** as the car climbs. The brief does not
  mention it; it is the heart of the original's difficulty, so Classic Duel
  keeps it exactly.

## Timing

`SOUND 20000,1` waits one tick of the 18.2 Hz timer, so a step cannot be
shorter; on a 4.77 MHz PC the BASICA loop may have run a little longer. The
port assumes exactly one tick per step, the most faithful reading of the
code, which gives 109 pixels a second for the donkey.

## Tuning numbers

Every window is `SIGHT_DISTANCE / speed`: how long a donkey takes from the
moment it appears to the moment it would reach the car
(`engine/modes.ts`, `engine/routes.ts`, `engine/duel.ts`):

| | Start | Top speed approached |
|---|---|---|
| Classic Duel | 0.67 s (first donkey) | 0.30 s (eleventh) |
| Donkey vs Driver | 1.12 s; the donkey commits 0.45 s before the car | 0.51 s (eleventh) |
| Endless, Relaxed | 1.45 s (11 m/s) | 0.80 s (20 m/s) |
| Endless, Normal | 1.23 s (13 m/s) | 0.65 s (24.5 m/s) |
| Endless, Frantic | 0.97 s (16.5 m/s) | 0.59 s (27 m/s) |
| Daily Road | 1.23 s (13 m/s) | 0.73 s (22 m/s) |
| Road Trip | 1.45 s (Morning Chores, 11 m/s) | 0.76 s (Whiteout and The Summit Herd, 21 m/s) |
| Rival Driver | 1.14 s (14 m/s) | 0.84 s (19 m/s) |
| Rival Driver, riding Ahead | 0.79 s (14 m/s) | 0.58 s (19 m/s) |

Speeds rise by beat, `start + (max − start) × k / (k + ramp)`, so the top
speed is approached, never reached. `ramp` is the beat at which the speed
is halfway there: half the leg on a Road Trip, 360 beats in Endless on
Normal (420 on Relaxed, 220 on Frantic), 200 on the Daily Road.

The planner only builds a pattern if a player can clear the donkeys (or
barrier) before it, press as often as needed (0.14 s a press, 0.15 s more
in mud), wait for a lane to open if need be, and still see the next row
0.3 s before they must move, plus a slack of 0.22 to 0.30 s depending on
the route (0.26 s on First Snow and 0.32 s on The Summit Herd, see below).
A driver reacting in 0.3 s finishes every planned road without a crash
(`planner.test.ts`).

A lane that ends is always announced at least one full window before its
barrier: its markings start where it begins to close, which comes into
view a full sight ahead, and the barrier stands at least another 16 m on.

### The shifting road in each mode

| | First shift | How often, once going |
|---|---|---|
| Endless | beat 20 | weight 3, as often as a pair of donkeys |
| Daily Road | beat 16 | weight 3 |
| Road Trip, Farm Lanes | beat 40 (Morning Chores), 30, 24 | weight 1, then 2: the gentle start |
| Road Trip, other routes | beat 28 | weight 3 |
| Rival Driver | beat 8 | weight 3 of 11 |
| Classic Duel, Donkey vs Driver | the second donkey of a climb | 18 % of waves while the window is 0.45 s or more |

Measured with a quick autopilot over 12 seeds, a lane ends about 4.9 times
a minute in Endless and on the Daily Road, and a duel shifts in 9 % of its
waves (3.7 times a minute).

### Playtest results

`e2e/drive.playtest.ts` plays with a scripted phone player: 0.42 s to react,
at least 0.2 s between presses, and a one-in-four chance of hesitating a
little before each press.

| | Result |
|---|---|
| Endless, median run of 12 | Relaxed 303 s, Normal 151 s, Frantic 103 s |
| Daily Road, 20 roads | 11 finished |
| Road Trip, 10 attempts a leg | Every leg finished at least 6 times out of 10 (the Snow Road legs 8, 7 and 6); clean runs fall from Farm Lanes to Snow Road |

A keyboard player on a desktop is quicker than this, and gets further.

### Re-balancing for the shifting road (prompt 007)

The same scripted phone player drove the engine as it was before the road
shifted (the previous commit) and as it is now, on the same seeds, with
bigger samples than the playtest so that the comparison is not noise.

| | Before | After |
|---|---|---|
| Endless, 36 runs, median (mean) | Relaxed 266 s (290), Normal 164 s (184), Frantic 96 s (101) | Relaxed 288 s (307), Normal 156 s (177), Frantic 101 s (105) |
| Daily Road, 60 roads | 42 finished, 103 crashes | 43 finished, 104 crashes |
| The Summit Herd, 40 attempts | 27 finished, 79 crashes | 24 finished, 82 crashes |

Road Trip, 30 attempts a leg, legs finished (clean):

| Route | Leg 1, before → after | Leg 2, before → after | Boss, before → after |
|---|---|---|---|
| Farm Lanes | 30 (30) → 30 (30) | 30 (24) → 30 (25) | 30 (20) → 30 (25) |
| Mountain Pass | 30 (24) → 30 (23) | 30 (20) → 30 (25) | 29 (16) → 29 (15) |
| Desert Highway | 29 (14) → 29 (13) | 28 (14) → 29 (11) | 19 (5) → 27 (7) |
| Foggy Night | 29 (15) → 30 (16) | 26 (7) → 28 (11) | 29 (13) → 28 (7) |
| Snow Road | 26 (7) → 26 (5) | 21 (4) → 25 (6) | 19 (1) → 19 (2) |

What changed to get there:

- Shifts come in through the existing introduction tables, as a phrase
  with a weight like any hazard, so the old speed curves and rests stayed
  as they were. Endless and the Daily Road needed nothing else: their
  numbers are within the spread between samples.
- Farm Lanes introduces shifts late and rarely (Morning Chores at beat 40,
  weight 1), so the first leg stays a gentle start.
- On Snow Road the new road made First Snow and The Summit Herd harder
  than the curve allowed (The Summit Herd fell to 7 finishes in 30). Each
  leg can now override its route's slack: First Snow has 0.26 s and The
  Summit Herd 0.32 s instead of the route's 0.22 s, which brought both
  back in line.
- The Daily Road's 20-road playtest swings with the seeds (16 of 20 before,
  11 of 20 after, on different roads); over 60 roads the finish rate is
  the same.

### Rival Driver tuning

`drive.playtest.ts` races every CPU level against every other over 16
matches (first to three, both sides of the road), and two scripted humans
against every level over 40: the phone player above, who also blocks when
a block is right there, and a quick keyboard player (0.34 s to react,
0.15 s between presses) who sets traps and holds the middle lane.

| Row beats column (since the surge) | Easy | Normal | Hard | Brutal |
|---|---|---|---|---|
| Easy | 63 % | 31 % | 25 % | 19 % |
| Normal | 81 % | 44 % | 19 % | 0 % |
| Hard | 75 % | 88 % | 63 % | 6 % |
| Brutal | 100 % | 100 % | 100 % | 50 % |

Before the surge the rows read 63 / 25 / 13 / 19, 69 / 31 / 25 / 6,
63 / 56 / 31 / 6 and 100 / 100 / 94 / 50 %.

Sixteen matches a pairing is a small sample (a level against itself
should be 50 %); the test only asks that two levels up wins clearly.

| Human against | Easy | Normal | Hard | Brutal |
|---|---|---|---|---|
| Phone player wins, since the surge | 63 % | 35 % | 20 % | 18 % |
| Phone player wins, before the surge | 65 % | 38 % | 20 % | 10 % |
| Quick player wins, since the surge | — | — | — | 45 % |
| Quick player wins, before the surge | — | — | — | 53 % |

Neither scripted human surges, so these compare like with like: the
levels play as they did. (Forty matches is a small sample; over 100 the
phone player beats Brutal 7 % of the time, see below.)

A match against the CPU takes about two minutes. Normal is a fair fight
for a casual player; Brutal beats a casual player nine times in ten but
loses half its matches to a quick one who holds the middle, which is what
"sharp, not cheating" asks for.

Against Easy over 32 matches (`rival.test.ts`), per minute of racing,
since the surge:

| | Trap attempts | Crashes | Surges | Rows passed Ahead | Wins against Easy |
|---|---|---|---|---|---|
| Easy | 0 | 3.1 | 0 | 0 % | 21 of 32 |
| Normal | 0.6 | 2.9 | 1.6 | 4 % | 23 of 32 |
| Hard | 1.8 | 2.0 | 3.2 | 15 % | 30 of 32 |
| Brutal | 1.5 | 1.6 | 4.1 | 14 % | 32 of 32 |

Before the surge they were 0, 0.5, 1.6 and 0.8 trap attempts and 3.1, 2.8,
2.6 and 2.0 crashes a minute. Brutal tries fewer traps than Hard because
it spends its quiet moments in the middle lane, where it is safest, rather
than hunting for a block. Against a player who rides Ahead much of the
time, Hard and Brutal surge six or seven times a minute and spring about
two and a half times as many door-shut traps as Easy does by chance.

### The surge (prompt 015)

Three numbers decide how the surge plays: how far Ahead is
(`AHEAD_DISTANCE`), how long a surge or drop back takes
(`SHIFT_SECONDS`, 0.4 s, as the brief asked), and what a row Ahead is
worth (`AHEAD_DODGE`).

The distance has a ceiling: the road proof. At the top speed of 19 m/s a
car Ahead must still have time for a reaction and two lane changes
(0.3 + 2 × 0.14 = 0.58 s) after a row comes into view, because a row whose
one gap is two lanes away is fair from an outer lane. 16 m of sight
less 4.9 m leaves 11.1 m, 0.584 s. The first try, a car length and a
metre (5.6 m, 0.547 s), left time for only one lane change, and 17 of the
30 seeded roads in `rival.test.ts` had a row a car Ahead could not get
past. 4.9 m is a car length and 0.4 m: the tail of a car Ahead still
clears the nose of a Level car.

The bonus was tuned with a scripted phone player (0.42 s to react, up to
0.25 s later at random, slipping out of boxes Ahead) over 100 matches
against each level, riding Ahead never, at quiet moments 30 % of the time,
or whenever it can:

| Distance, bonus | Rides Ahead | Easy | Normal | Hard | Brutal |
|---|---|---|---|---|---|
| 5.6 m, 1.5 | never | 55 % | 39 % | 9 % | 2 % |
| 5.6 m, 1.5 | always | 55 % | 49 % | 24 % | 4 % |
| 4.9 m, 1.5 | never | 58 % | 32 % | 15 % | 3 % |
| 4.9 m, 1.5 | always | 74 % | 68 % | 35 % | 6 % |
| 4.9 m, 1.0 | always | 52 % | 45 % | 12 % | 2 % |
| 4.9 m, 1.25 | never | 54 % | 30 % | 19 % | 7 % |
| 4.9 m, 1.25 | 30 % | 33 % | 14 % | 10 % | 4 % |
| **4.9 m, 1.25 (chosen)** | always | 55 % | 50 % | 16 % | 1 % |

At 4.9 m riding Ahead is safer than at 5.6 m, and with half a box extra
it beat every level more often than staying Level: dominant. With a
quarter it pays against Easy and Normal, who do not follow you up there,
and costs you against Hard and Brutal, who do and who shut doors behind
you: tempting, not dominant. Surging at random quiet moments is the worst
of the three; a surge is a 0.4 s commitment, and a donkey that appears
meanwhile is nearer than it would be Level.

The same phone player who never surges, as everyone did before, now wins
63 / 39 / 25 / 7 % against Easy / Normal / Hard / Brutal over 100
matches (65 / 38 / 20 / 10 % over 40 in the playtest before the surge):
the levels feel as they did. The quick player who holds the middle beats
Brutal 37 % of the time over 100 matches (53 % over 40 before the surge):
The Baron got a little sharper, since it now surges out of the boxes that
player used to catch it in, but it is still beaten one match in three.

### Rival Driver comebacks (after the owner's playtest)

The first version brought a crashed car back after 1.3 s as a see-through
ghost for 1.2 s: it could not crash, and it neither blocked nor could be
blocked, so it could sit in the other car's lane. In play that read as two
cars stacked in one lane, and it was hard to tell which car was yours. Now
two cars never share a lane, and each car carries a YOU/CPU (or P1/P2)
label in its driver's colour. The comeback was measured with the phone
player against Easy and Normal over 160 matches each before settling:

| Comeback | Phone player beats Easy | Beats Normal |
|---|---|---|
| The first version: 1.3 s off the road, 1.2 s as a ghost | 68 % | 44 % |
| Ghosts that block and are blocked (still able to overlap at a barrier) | 59 % | 42 % |
| Back solid in a fair lane after 1.3 s | 58 % | 43 % |
| Off the road for 2.5 s, back solid in a fair lane (chosen) | 66 % | 46 % |

What matters is the stretch when the rival is off the road: with both
cars on it, boxing in is constant and the better driver's edge shrinks. So
the crashed car stays off for as long as the ghost used to last, then
comes back in a lane that is open, not the other car's, safe past every
row in view, and not one the other car needs. A short shield from donkeys
after coming back was tried too and made no clear difference. Half the
time the car is back within 2.6 s, and never later than 4.9 s.
