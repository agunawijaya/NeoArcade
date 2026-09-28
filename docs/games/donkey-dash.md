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

- Two lanes and one button that flips lanes instantly.
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
| 5 | The car climbs the screen. | Classic view: the same. Chase view: the crest of the hill comes closer instead. Isometric view: the road ahead is scaled so the end of the screen is always the sight line. | Each view shows the same reaction window (ADR 0010). |
| 6 | "BOOM!" in the panel; halves in 7 hops. | A comic BOOM! over the pile-up, a slow-motion beat, then the halves spin away on the same curve (`render/crash.ts`), with hay and sparks. | The signature moment, reimagined. |
| 7 | No end. | Classic Duel is first to N (default 5, from 1 to 11). | A match needs a finish; N is a setting. |
| 8 | Key clicks and timer beeps. | A synthesized soundtrack per route, a lane whoosh, a hee-haw, chimes, a crash. | Sound is new. |
| 9 | — | New modes: Road Trip (5 routes × 3 legs, stars), Endless (3 lives, speed rises), Daily Road (a fixed road per UTC day), Donkey vs Driver (a second player steers the donkey). | The brief. The original's rules live on in Classic Duel. |
| 10 | — | Near misses (three tiers), combos, carrots, a rhythm bonus, lives and a score, in the runs only. | Game feel; Classic Duel keeps the original score. |
| 11 | — | Hazards: pairs, hesitant donkeys, herds with a gap, mud, three-lane stretches, carrots; off by default in Classic Duel. | The brief; every pattern is checked to be drivable by a human (`planner.test.ts`). |
| 12 | Car at x 105/147, road 80 pixels wide. | Lanes 3.5 m wide; the car is 4.5 m long, a donkey 1.2 m deep. | Modern proportions for the new views; the duel's timings are unchanged. |
| 13 | Esc quits. | Esc pauses; the Hall button leaves. | A web page, not a program. |
| 14 | Requires the Color/Graphics Adapter and BASICA. | Runs anywhere with a browser. | — |

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

Speeds rise by beat, `start + (max − start) × k / (k + ramp)`, so the top
speed is approached, never reached. `ramp` is the beat at which the speed
is halfway there: half the leg on a Road Trip, 360 beats in Endless on
Normal (420 on Relaxed, 220 on Frantic), 200 on the Daily Road.

The planner only builds a pattern if a player can clear the donkeys before
it, press as often as needed (0.14 s a press, 0.15 s more in mud) and still
see the next row 0.3 s before they must move, plus a slack of 0.22 to
0.30 s depending on the route. A driver reacting in 0.3 s finishes every
planned road without a crash (`planner.test.ts`).

### Playtest results

`e2e/drive.playtest.ts` plays with a scripted phone player: 0.42 s to react,
at least 0.2 s between presses, and a one-in-four chance of hesitating a
little before each press.

| | Result |
|---|---|
| Endless, median run of 12 | Relaxed 302 s, Normal 178 s, Frantic 103 s |
| Daily Road, 20 roads | 13 finished |
| Road Trip, 10 attempts a leg | Every leg finished at least 7 times out of 10 (the Snow Road legs 10, 8 and 7); clean runs fall from Farm Lanes to Snow Road |

A keyboard player on a desktop is quicker than this, and gets further.
