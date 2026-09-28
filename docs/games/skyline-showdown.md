# Skyline Showdown — notes on the original and a log of every change

Port of **QBasic Gorillas** (Microsoft Corporation, 1990), shipped as a
sample program with MS-DOS 5.0's QBasic. Reference source:
`sources/Gorillas/gorilla.bas` (1,135 lines). Line numbers below refer to it.

The port reimplements the behaviour from scratch. No code, `PLAY` melodies or
bitmap `DATA` were copied.

## How the original behaves

### Screen and scale

- EGA mode 9 when available (640 × 350), CGA mode 1 (320 × 200) otherwise
  (`InitVars`, l. 145–208). The port uses the EGA geometry as its world.
- `Scl()` (l. 1036) halves every size for CGA; in EGA it is the identity.

### The city (`MakeCityScape`, l. 689–808)

- Buildings go left to right from `x = 2` with a 2-unit step between them
  (`x = x + BWidth + 2`), until `x > ScrWidth - HtInc` (630).
- Width: `FnRan(DefBWidth) + DefBWidth` = 38–74, clipped to the screen.
- Height: `FnRan(RandomHeight) + NewHt` = 1–120 on top of a running *trend*
  `NewHt`, never below `HtInc` (10).
- Slope: `FnRan(6)`. 1 = upward (trend 15, +10 a building), 2 = downward
  (trend 130, −10), 3–5 = "V" (trend 15, +20 left of centre, −20 right of it;
  on screen this is a peak), 6 = inverted "V" (trend 130).
- Windows: columns every 10 units, rows every 15 from the roof down,
  4 × 7 units, and `FnRan(4) = 1` (one in four) are dark.

### Wind (l. 790–798)

`Wind = FnRan(10) - 5`, which is −4…+5. One round in three
(`FnRan(3) = 1`) a gust of `FnRan(10)` is added away from zero, where a wind
of 0 counts as "not positive" and is pushed left. So the range is −14…+15
and calm air (0) happens in one round in 15. A new wind is rolled every
round. The arrow at the bottom is `Wind × 3 × (ScrWidth \ 320)` pixels long.

### Placing the gorillas (`PlaceGorillas`, l. 816–838)

Player 1 on building `FnRan(2) + 1` (the 2nd or 3rd from the left), player 2
on `LastBuilding - FnRan(2)` (2nd or 3rd from the right). Each gorilla's
30 × 30 sprite is centred on the roof, using the building width *plus the
2-unit gap*, and stands on it.

### A throw (`DoShot`, l. 278; `PlotShot`, l. 902–1020)

- Angle and velocity are typed with `GetNum#` (l. 532): digits and one `.`,
  Backspace, Enter; a value above 360 is cleared and must be retyped. The
  velocity lands in an `INTEGER` (`DEFINT A-Z`), so it is rounded.
- Player 2's angle is mirrored: `Angle# = 180 - Angle#`.
- Path: `x = x0 + Vx·t + ½·(Wind/5)·t²`, `y = y0 − Vy·t + ½·g·t²`, with `t`
  growing by 0.1 each step and `Rest .02` between steps.
- Player 1 throws from the top-left of its sprite, player 2 from 25 units to
  the right (both 7 units above the head), with the raised arm on that side.
- Off-screen: `x ≥ 630`, `x ≤ 3` or `y ≥ 347` ends the throw as a miss.
  Above the top (`y ≤ 0`) nothing is checked and the banana keeps flying.
- Collisions are colour checks with `POINT` at two points on the leading
  edge. Background: fly on. Sun colour above the sun's height: the sun gets
  its shocked face, the banana flies through. Anything else explodes.
- `Velocity < 2` pre-loads a gorilla hit: the banana drops on the thrower.

### Explosions

- Building: circles of radius `ScrHeight / 50` = 7 are drawn in the
  explosion colour, then erased with the background colour, which leaves a
  permanent round hole (`DoExplosion`, l. 255).
- Gorilla (`ExplodeGorilla`, l. 459): a large elliptical blast, erased to
  background as well. Which gorilla was hit is decided by which half of the
  screen the banana was in.

### Rounds, turns and scoring (`PlayGame`, l. 845–893)

- `FOR i = 1 TO NumGames`: the match lasts exactly *N* rounds ("Play to how
  many total points"), then shows both scores. A draw is possible.
- `J = 1 - J` alternates throws forever, across rounds, starting with
  player 1.
- The sun's face is reset once the throw is over.
- The winner of a round does a four-beat victory dance (`VictoryDance`).

### Presentation

Title screen with a sparkle border and a short `PLAY` tune, a name and
options screen (names cut to 10 characters, defaults "Player 1" and
"Player 2", points default 3, gravity default 9.8), an optional gorilla
intro dance, and a "GAME OVER" score screen.

## Bugs found, and what the port does about them

| # | In the original | Port |
|---|---|---|
| 1 | `CASE 4` (the inverted-"V" rule) comes after `CASE 3 TO 5` and never runs (l. 731–742). | Fixed: each of the four patterns has its own rule. |
| 2 | Slope 6 has no branch at all, so the "inverted V" city is simply flat and tall. | Fixed: slope 6 now dips in the middle (the intended CASE 4 rule). |
| 3 | The too-tall check uses `MaxHeight`, which is never declared (so 0): a building that would reach the top shrinks to 20 units (l. 754). | Fixed: the height is capped so the roof stays 35 units below the top, leaving room for a gorilla. |
| 4 | `UpdateScores` compares `Results` (TRUE = −1) with `HITSELF` (1), which never matches, so a gorilla that hits itself scores the point (l. 874, 1112). The victory dance does go to the other gorilla, which shows the intent. | Fixed: a self-hit scores for the opponent. |
| 5 | `Rest` waits `MachSpeed × t / 500` seconds with `MachSpeed` measured by a busy loop (l. 1024), so a faster computer makes the game *slower*. | Replaced by a fixed rate of 28 steps a second (see below). |
| 6 | Names, scores and the wind arrow are drawn on the playfield in solid colours, so a banana that touches them explodes. | The HUD is not part of the city; only buildings, gorillas, the sun, balloons and the street matter. |
| 7 | The gorilla that was hit is chosen by screen half, not by what was hit. | The hit gorilla is the one whose body the banana touched. |
| 8 | At high velocity a banana can jump over a gorilla or a thin wall between two steps. | Collisions are checked every 2 world units along the path. The visible path is unchanged. |

## Where the brief and the source disagree (the source wins)

- **Wind range.** The brief says −5…+5; the code gives −4…+5 before gusts.
  The port keeps the code's roll.
- **Match length.** The brief says first to N; the code plays N rounds in
  total. Both exist in the port as a **Match format** setting: *Total
  points* (Classic 1990 preset, faithful) and *First to* (NeoArcade preset).
- **The shocked sun.** The brief says the face stays shocked until the next
  throw; the code resets it as soon as the throw ends. The port holds the
  gasp for about two seconds and always resets it when the next turn
  starts, which covers both.

## Timing

A typical throw of 70–100 steps took two to three seconds on period
hardware: `Rest .02` could only end on a 55 ms timer tick, plus drawing
time. The port plays **28 steps per second** (`STEPS_PER_SECOND`), so
flights take the same wall-clock time. The physics is unchanged.

## Diff log: every deliberate change

### Rules and physics

- **Worlds.** Gravity per world instead of a typed number: Earth 9.8,
  Moon 1.62, Mars 3.71, Jupiter 24.79, or random each round.
- **Wind per world.** The rolled wind is multiplied by the world's air:
  Earth ×1, Moon ×0 (no atmosphere), Mars ×0.4, Jupiter ×1.5. Without this,
  a normal breeze in lunar gravity pushes as hard as gravity pulls, and
  playtests found many Moon cities where no throw at all could hit.
- **Match format** setting (see above).
- **Fumbles** (velocity below 2) are an explicit rule: the banana drops on
  the thrower's head. The original got there by pre-loading the collision
  colour.
- **Gorilla blast.** A gorilla hit leaves a scorched 16-unit bowl, like the
  original's big erased ellipse.
- **Collisions** use shapes (building rectangles minus crater circles and
  cut-off roof sections, and three body boxes per gorilla) rather than
  pixel colours. The banana is a 3-unit disc.
- **Banana start point.** The banana starts at the raised hand, above the
  head on the throwing side (3.5 and 28.5 units into the gorilla's box),
  matching where the original drew it.
- **Off-screen edges** are measured at the banana's centre (6 units from
  each side); landing in the street (4 units below the roofs' base line)
  counts as a miss.

### New systems (all switchable)

- **CPU opponent**, Easy to Brutal. It makes an educated first guess, then
  corrects from where its banana came down, aiming between its best short
  and best long throws. It never simulates a throw. See
  `docs/adr/0004-cpu-opponent.md`.
- **Power-ups** carried by balloons that drift with the wind during throws:
  Golden Banana, Tri-Banana, Calm Air, Bouncer and Rooftop Shield. Each can
  be switched off.
- **Weather and time of day.** Dusk, night and dawn across rounds; rain,
  fog and lightning on Earth and Jupiter; dust haze on Mars; nothing on the
  Moon. Purely visual.
- **Instant replay** of every gorilla hit, in slow motion with a camera
  push-in. It can be skipped.
- **Aiming.** Slingshot drag, keyboard and gamepad as well as the classic
  typed numbers. Keyboard and gamepad aiming run from 0° to 180°; typed
  input still accepts 0–360.
- **Ghost trail** of your previous throw.
- **Aim assist** (setting, off in both presets): a dotted line shows the
  first third of the throw being aimed, wind included, but not where it
  lands. It answers the complaint that the CPU knows exact distances while
  a person judges by eye.
- **Hidden aim guide** against the CPU: press C while aiming to see the
  exact path of the throw being aimed, turning green with a crosshair when it
  would hit. A practice aid, deliberately left out of the menus and the
  player's guide.

### Presentation

- **Light and dark themes.** The original had one look. A Theme setting
  (Auto, Light, Dark; Auto follows the device) adds a light theme with a
  daytime palette for every world. Night rounds stay dark. It is a personal
  preference, stored apart from the match rules.
- Everything is redrawn in code: layered parallax skyline, procedural
  facades, flickering windows, rooftop props (non-solid scenery, as the
  original had nothing on its roofs), vector gorillas with moods, a sun
  mascot per world (the Sun, Earth, Phobos, Io), explosions with fire,
  debris and cooling scorch marks, post-processing bloom and an optional
  CRT filter.
- An original synthesised theme and sound effects. The `PLAY` strings were
  not used.
- The HUD is DOM, not pixels on the playfield (see bug 6).
- Names default to "Player 1" / "Player 2" and are cut to 10 characters, as
  before. A CPU with a default name is shown as "CPU".

### World Tour, rivals, wardrobe and badges (prompt 003)

None of this changes a Quick Match: its rules, cities and CPU play exactly
as before, and old `?seed=` links replay the same cities.

- **Main menu.** Title → World Tour · Quick Match · Wardrobe · Badges ·
  Settings · How to play · Back to Hall. "Match settings" is now **Quick
  Match**; the new **Settings** holds what both modes share (aiming, aim
  assist, names, theme, CRT, sound).
- **World Tour.** Fifteen stages in four chapters (Earth, Moon, Mars,
  Jupiter), first to 2, bosses first to 3, no balloons. Three stars per
  stage (win; within a throw budget; never hit), capped at one with aim
  assist. Chapters open with a star total (10, 17, 24) and the previous
  boss. Stages, rivals and chapters are data (`src/tour/`).
- **Stage twists** as engine data (ADR 0007): gusts, a patrol drone, a
  supertall tower, a jet stream, a hidden wind gauge, a hillside, springy
  ground, a dust devil and lightning. Two differ from the suggestions in
  the brief:
  - The Moon's "craters in the street that launch debris" became **springy
    ground**: in a city packed with buildings the street is only exposed in
    2-unit gaps, so a street-based twist almost never triggered.
  - **Gusts** shift the wind by 2–5 notches (scaled by the world) instead
    of re-rolling it. Re-rolling made gust stages long lotteries in
    playtests; a shift keeps the wind changing every throw but readable.
  - New York mixes the drone and gusts; Jupiter's lightning is telegraphed
    a full throw ahead and never strikes a gorilla's roof or its
    neighbours.
- **Rivals** (ADR 0008): ten characters, each a CPU level plus a play style
  (favourite angle, correction, rattle, wind sense), a colour, an outfit
  and a few lines. Beaten rivals can be picked in Quick Match. Their
  personalities come from how they play and what they say, never from
  where they are from.
- **CPU and gusts / hidden wind.** When the wind gauge is hidden the CPU
  reads 40 % of the wind. After a gust it corrects from its last throw,
  allowing for the change, instead of guessing afresh.
- **Drone height.** The drone flies above the roofs under its rail where
  it can, rather than at a fixed height, so it never sits inside a tower.
- **"So close!"** after every miss: a pin where it landed, the distance in
  metres (a gorilla is 2 m), short, long, over or blocked, and for people a
  comment that never repeats twice running.
- **Wardrobe.** Sixty cosmetic items in eight slots for each player: fur,
  headwear, eyewear, neckwear, banana skin, trail, explosion, victory dance.
  The classic look is the default outfit (the head bandana in the player's
  colour). Cosmetics never change hitboxes, physics or information; the
  Golden Banana always looks golden.
- **Arcade Pass.** A manifest of 28 badges, the wardrobe items badges and
  levels unlock, and profile stats; XP for matches, wins, stages, stars and
  rivals; unlock toasts held during turns and shown between rounds.
- **City kits.** Each tour city has its own facades, tints, rooftop props,
  silhouettes and horizon; each stage fixes its light and weather.
- **Instant replay** now shows at most the last 2.5 seconds of flight before
  a hit, so slow lunar arcs don't take half a minute to replay.

## Known differences that stay on purpose

- Rooftop props (water towers, antennas, chimneys, flags, billboards,
  domes) never stop a banana, and neither does anything a gorilla wears.
- Carving is exact geometry, so holes are perfectly round and edges never
  "leak" a pixel the way EGA circles could.
