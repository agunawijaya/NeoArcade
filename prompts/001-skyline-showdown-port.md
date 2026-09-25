# 001 — Skyline Showdown (port of QBasic Gorillas, 1990)

## Read first

1. `CLAUDE.md` — rules, code style, and the **three required documents**.
2. `docs/adr/*`, `docs/HALL-ARCHITECTURE.md`, `shared/` — reuse, don't reinvent.
3. `sources/Gorillas/gorilla.bas` — read all of it. It is the behavioural
   reference. Do not copy its code, melodies (`PLAY` strings) or bitmap
   `DATA`; reimplement the behaviour.

## Goal

Build **Skyline Showdown** in `ports/skyline-showdown/`: a faithful-at-heart,
stunning-to-look-at remake of QBasic Gorillas. Two gorillas on rooftops
throw exploding bananas at each other across a city, adjusting angle and
power for wind and gravity. Register it in the Arcade Hall with an animated
code-drawn cover.

Credit line (title screen, README, ABOUT): *"Inspired by QBasic Gorillas,
© Microsoft Corporation 1990."* Don't use "Gorillas" as the title.

## Hard rules

- Zero raster assets. Everything drawn in code: Canvas 2D for the scene,
  `shared/fx` for bloom/vignette/CRT. Audio synthesized with `shared/audio`.
- Engine first: pure TypeScript, seeded RNG, no DOM, fully unit-tested
  before any rendering work begins.
- Stay inside `ports/skyline-showdown/`, `hall/catalog.json`,
  `hall/covers/`, `docs/games/`, `PORTS.md`. Touch `shared/` only for a
  clear, general-purpose improvement, and note it in the report.

## 1. Engine — what the original actually does

Confirm each point against the source; if anything here disagrees with the
code, the code wins and you note it in `docs/games/skyline-showdown.md`.

- **World:** original playfield 640×350 (EGA). Use a logical world of the
  same proportions and scale to the screen, so physics feels identical.
- **Skyline (`MakeCityScape`):** buildings left to right with 2-unit gaps;
  width = random 38–74; height = random offset + a trend value. Four slope
  patterns: upward, downward, "V" (most common, 3 of 6), inverted "V".
  Heights clamped so gorillas stay on screen. About 1 in 4 windows dark.
- **Original bugs to fix, not copy:** `CASE 4` in the slope loop is
  unreachable (caught by `CASE 3 TO 5`), and the inverted-"V" pattern never
  gets its own logic. Implement all four patterns as intended and document it.
- **Wind:** integer, random −5…+5 (can be 0); 1 in 3 rounds it is pushed
  further by another 1–10 in the same direction. New wind each round.
- **Placement:** gorilla 1 on building 2 or 3 from the left, gorilla 2 on
  building 2 or 3 from the right, centred on the roof.
- **Shot:** angle in degrees and velocity; player 2's angle is mirrored
  (180° − angle). Position over time:
  `x = x0 + vx·t + ½·(wind/5)·t²`, `y = y0 − vy·t + ½·g·t²` (screen y down),
  `t` advancing 0.1 per step. Keep this model; tune only step rate so a
  flight takes about the same wall-clock time as the original on EGA.
- **Leaving the field:** past left/right edge or below the floor = miss.
  Above the top edge the banana keeps flying (and comes back down).
- **Collisions:** building → explosion that **permanently carves a round
  hole** (radius ≈ field height / 50). Gorilla → gorilla explosion, round ends.
  Sun → no impact; the banana passes through and the sun's face turns shocked
  until the next throw.
- **Velocity < 2:** the thrower hits themself.
- **Scoring:** the thrower scores when the opponent is hit; if a gorilla hits
  itself, the **opponent** scores. First to N points wins (default 3).
  Turns alternate continuously across rounds.

## 2. New systems (all switchable in Settings)

- **Worlds (gravity):** Earth 9.8, Moon 1.62, Mars 3.71, Jupiter 24.79, and
  "Random each round". Each world has its own sky, palette and ambience.
- **CPU opponent:** Easy / Normal / Hard / Brutal. It plays like a person:
  first throw is an educated guess, later throws correct from where the last
  banana landed relative to the target. Difficulty controls correction
  quality and aim "hand shake". It must never solve the trajectory exactly.
  Add a short "thinking" pause and visible aim wind-up.
- **Power-ups:** a balloon carrying a crate occasionally drifts over the
  city (moves with the wind). Hit it with a banana to collect its power-up
  for your next turn. Max one held per player, one used per turn.
  - Golden Banana — double blast radius, can topple a roof section.
  - Tri-Banana — splits into three at the top of its arc.
  - Calm Air — wind is zero for this throw.
  - Bouncer — bounces once off a building wall before exploding.
  - Rooftop Shield — absorbs one hit on your gorilla.
  Each can be enabled/disabled individually.
- **Weather & time of day:** dusk → night → dawn across rounds; light rain,
  thin fog, distant lightning. Visual only — never changes physics.
- **Instant replay:** every gorilla hit replays in slow motion with a gentle
  camera push-in; skippable.

## 3. Settings screen (before the match)

Two presets plus manual control; last choice remembered via `shared/storage`.

| Setting | "Classic 1990" | "NeoArcade" |
|---|---|---|
| Players | Human vs Human | Human vs CPU (Normal) |
| CPU difficulty | – | Easy / Normal / Hard / Brutal |
| World | Earth | Earth / Moon / Mars / Jupiter / Random |
| Points to win | 3 | 3 (range 1–20) |
| Aiming | Type angle & velocity | Drag slingshot + keyboard |
| Power-ups | Off | On (each toggleable) |
| Weather & day cycle | Off | On |
| CRT filter | On | Off |

Also: player names (max 10 chars, like the original), sound/music volume.

## 4. Controls & UX

- **Drag aiming:** press on your gorilla, drag back, release. Angle and power
  are shown as numbers next to the arm. No trajectory prediction line — the
  only aid is a faint ghost trail of your own previous throw.
- **Keyboard:** ←/→ angle, ↑/↓ power (hold Shift for fine steps), Space/Enter
  to throw. **Classic input:** type numbers exactly like the original.
- Gamepad support via `shared/input`. Touch-friendly on phones, landscape
  preferred with a polite rotate hint in portrait.
- HUD: names, score, wind shown as an arrow **and** through the scene.
- Pause menu: resume, restart, settings, how to play, back to Hall.

## 5. Art direction — "a city that breathes at dusk"

- Layered parallax skyline: far silhouettes, mid buildings, the playable row.
  Buildings get procedural facades (window grids, ledges, water towers,
  antennas, rooftop details) generated from the seeded RNG. Windows flicker
  on and off over time as if people live there.
- **Wind is readable from the world:** clouds, chimney smoke, rooftop flags
  and rain all lean and drift with the wind's direction and strength.
- **Gorillas:** chunky, expressive vector characters with idle breathing,
  wind-up before the throw, reactions (face-palm on a bad miss, taunt, panic
  when a banana passes close), and a joyful victory dance.
- **Banana:** spins, leaves a soft light trail; subtle camera follow.
- **Explosions:** flash, particles, falling concrete debris; carved holes
  have charred, glowing edges that cool over a few seconds; nearby windows
  go dark. Gorilla hit: slow-mo, screen shake, big blast, then the dance.
- **The sun is the mascot:** smiles, blinks, follows the banana with its
  eyes, gasps "O" when hit. Each world has its own "sun" character
  (e.g. Earth glowing over the Moon's sky).
- Post-FX via `shared/fx`: soft bloom and colour grading; optional CRT.
- Title screen: an animated, cinematic establishing shot of the city with
  the logo; the credit line underneath.
- Sound: punchy synthesized throw, whoosh, explosion, sun gasp, crowd-free
  ambient city hum, and an original, short upbeat theme. Mutable.
- Performance: steady 60 fps on a mid-range phone; carved terrain uses an
  offscreen mask canvas, not per-pixel JS loops every frame.

## Workflow

1. **Engine** with Vitest: skyline patterns (all four), wind distribution,
   placement, trajectory determinism for a seed, collision order, carving,
   self-hit, scoring, power-ups, CPU convergence (e.g. Normal hits within
   a reasonable number of throws on average across many seeded matches;
   Easy slower; Brutal faster — but never 100% first-throw).
2. **Rendering & UX**, playable end-to-end with placeholder visuals.
3. **Art pass** — loop at least four times: Playwright screenshots of
   title, settings, aiming, mid-flight, building hit, gorilla hit, replay,
   victory, each world, at 1440×900, 1024×768 and 844×390 → critique as an
   art director (composition, contrast, readability, motion) → fix.
4. **Playtest pass:** play full matches vs CPU at every difficulty through
   Playwright; tune anything that feels unfair or dull.
5. Hall integration: catalog entry and animated cover in `hall/covers/`.
6. Documentation (below), then final `npm run build`, tests, lint.

## Deliverables

- The game in `ports/skyline-showdown/`, tests green, lint clean, builds.
- `ports/skyline-showdown/README.md` (short, per CLAUDE.md).
- `ports/skyline-showdown/docs/ABOUT.md`, `HOW-TO-PLAY.md`,
  `ARCHITECTURE.md` — exactly as specified in CLAUDE.md, Mermaid validated.
  In ABOUT, the facts about the original: QBasic Gorillas, Microsoft, 1990,
  shipped as a sample program with MS-DOS 5.0's QBasic.
- `docs/games/skyline-showdown.md` — original behaviour notes, the bugs
  found and how they were handled, and a diff log of every deliberate change.
- `docs/adr/` — any new decision (e.g. terrain carving approach, AI design).
- Screenshots in `ports/skyline-showdown/media/`.
- `PORTS.md` row updated to `done` (or the real status). No git commit.

## Report at the end

What was built, deviations and why, known limitations, and ideas that
were left out but would be worth a follow-up prompt.

## Suggested run

Claude Code in `E:\Projects\NeoArcade`, Opus 5.5, effort **xhigh**:
"Read prompts/001-skyline-showdown-port.md and do it."
