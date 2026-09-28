# 005 — Donkey Dash (port of IBM PC DONKEY.BAS, 1981)

## Read first

1. `CLAUDE.md` (rules, code style, three documents, Arcade Pass rule).
2. `docs/ARCADE-PASS.md`, `shared/*`, `docs/HALL-ARCHITECTURE.md`.
3. `ports/skyline-showdown/` as the reference for structure, tests and
   docs quality — follow its patterns, don't copy its code blindly.
4. The original in `sources/Donkey/`. **Note:** if the file there is a saved
   GitHub HTML page rather than plain BASIC, the program is inside it as the
   JSON array `"rawLines"`; read it from there. 132 lines of BASICA.

## Goal

Build **Donkey Dash** in `ports/donkey-dash/`: a one-button driving game
that keeps the soul of IBM's 1981 DONKEY.BAS (dodge donkeys by switching
lanes, Donkey vs Driver score) and turns it into a gorgeous, addictive
modern arcade game with a campaign, endless mode, a daily run and a
two-player "you are the donkey" duel.

Credit line (title screen, README, ABOUT): *"Inspired by DONKEY.BAS,
© IBM Corp. 1981, 1982."* ABOUT may tell the well-known story that Bill
Gates and Neil Konzen wrote it to show off BASICA on the first IBM PC —
clearly framed as the commonly told history.

## Hard rules

- Zero raster assets. Everything drawn in code; audio synthesized.
- **One button** is the core. Every mode must be fully playable with a
  single key, a single tap, or one gamepad button. (Menus may use more.)
- Engine first: pure TypeScript, seeded, deterministic, no DOM, tested.
  Reuse the cross-browser determinism approach from Skyline Showdown if it
  exists (prompt 004); otherwise verify it yourself in Chromium, Firefox and
  WebKit, because Daily Road depends on it.
- Arcade Pass integration per `docs/ARCADE-PASS.md`.
- Light and dark themes, reduced motion, keyboard/touch/gamepad, phone and
  desktop.

## 1. Engine — what the original does

Confirm against the source; the code wins, note differences in
`docs/games/donkey-dash.md`.

- Road with two lanes; the car sits in one of them; any key flips the lane
  instantly (x 105 ↔ 147 on a 320×200 CGA screen).
- Each wave, a donkey appears in a random lane just above the top and falls
  toward the car at a constant speed (6 px per tick from a random start
  between −32 and 0 down to y 124).
- Collision: donkey in the car's lane and its bottom reaches the car.
  → "BOOM!", **Donkey** scores 1, car goes back to the start.
- Every dodged donkey moves the car 4 px up the screen. Reaching the top
  (about 11 dodges in a row) → "Donkey loses!", **Driver** scores 1, reset.
- The crash animation splits the car and the donkey each into two halves
  that fly off toward the screen corners with easing. **Keep this as the
  signature moment** — reimagined, not traced.
- No end, no speed-up; ESC quits. The road's centre dashes scroll.

## 2. Game feel additions (all one-button)

- **Near miss:** switching out of a donkey's lane late earns more points,
  with tiers ("Close shave!", "Whisker!", "Hee-haw-some!"); consecutive
  near misses build a combo multiplier.
- **Rhythm:** donkeys arrive on the beat of the synth soundtrack; a lane
  switch on the beat gives a small bonus and a visual pulse. Never required.
- **Escalating hazards** (introduced gradually, each telegraphed): donkey
  pairs, a hesitant donkey that wobbles between lanes, a donkey herd with a
  single gap, mud that delays your switch slightly, three-lane stretches
  where one press cycles lanes, carrots to collect for bonus points.
- **Speed** rises smoothly in Endless and per stage in Road Trip.
- Donkeys have character: idle ear flicks, a blank unbothered stare, a
  synthesized "hee-haw" and little reactions when you dodge them.

## 3. Modes

| Mode | Rules |
|---|---|
| **Classic Duel** | Original rules and pacing: Donkey vs Driver, first to N (default 5). Modern visuals, original behaviour. |
| **Road Trip** | Campaign: 5 routes (e.g. Farm Lanes, Mountain Pass, Desert Highway, Foggy Night, Snow Road) × 3 legs; the last leg of each route is a "stubborn herd" boss run. 1–3 stars per leg (finish; finish without a crash; near-miss score target). Routes unlock by stars. |
| **Endless** | Keep driving, speed rises, 3 lives; score = distance + near misses. Local best scores table. |
| **Daily Road** | Seeded from the **UTC date**; same road and hazards for everyone; one scored run per day; spoiler-free shareable text (e.g. `Donkey Dash · Daily #37 🚗💨 2 🫏💥 · 1,840 m`), streaks and a calendar. If `shared/` already has daily/share helpers from Skyline Showdown, use them; if not, build them in `shared/daily` so both games can use them, with an ADR. |
| **Donkey vs Driver (2P)** | Local asymmetric duel. Player 1 drives (one button: switch lane). Player 2 **is the donkey**: one button toggles the lane where the next donkey will drop, and the donkey commits when it crosses a clearly drawn "commit line" partway down — so feints are possible but the driver always gets a fair window. Score like the original: a crash is a Donkey point, reaching the top is a Driver point. Swap roles each round. Keyboard: left and right halves of the keyboard; touch: screen split in two; two gamepads. |

## 4. Three camera views (Settings)

Chosen on the settings screen, switchable any time from pause. Gameplay,
timing and hitboxes are identical in all three — each renderer is a separate
layer over the same engine state, behind one small `RoadView` interface.

- **Chase view:** pseudo-3D road in the OutRun tradition — camera behind and
  above the car, curves and hills, roadside fences, fields, trees,
  telegraph poles and distant mountains in parallax layers.
- **Classic view:** a top-down, slightly tilted diorama of the road that
  echoes the original's layout (road in the middle, score panels at the
  sides), but lush: soft shadows, grass swaying, dust, day-night lighting.
- **Isometric view:** a true isometric (2:1) diorama — the road runs
  diagonally across the screen like a tiny model world: blocky trees,
  fences, farmhouses, hay bales, a windmill, a river bridge; the car and
  donkeys as chunky isometric figures with proper depth sorting and soft
  contact shadows. Keep it readable: lanes clearly marked, the car always
  in the same screen region, hazards never hidden behind scenery (fade or
  cut away anything that would occlude the road).
- **Fairness:** all three views must show the same amount of time ahead
  (reaction window). Define it in one constant and test it for each view.

## 5. Art direction

- A warm countryside road trip at golden hour as the home look; each Road
  Trip route has its own palette, sky and weather (mountain mist, desert
  heat shimmer, night headlights and fireflies, falling snow).
- The car: a cute, chunky code-drawn hatchback with bounce, tilt on lane
  switch, headlights at night, dust puffs.
- The crash: time slows, car and donkey split into halves that spin away to
  the four corners with hay, sparks and a comic "BOOM!" — funny, never gory.
  The donkey is always fine (it pops back in the next round, dazed).
- The title screen nods to the original: a green double-line box with
  "DONKEY" that unfolds into the modern logo.
- Post-FX from `shared/fx`, including an optional CGA-palette + CRT filter
  (cyan/magenta/white) as a playful Easter egg setting.
- Sound: synthwave-country soundtrack loops per route, engine hum, lane
  whoosh, hee-haw, near-miss chime, crash.

## 6. Settings screen

Mode, camera view, difficulty for Endless/Daily-practice (Relaxed, Normal,
Frantic), points to win (Classic/2P), rhythm bonus on/off, hazards on/off
(Classic Duel defaults to off), CRT/CGA filter, theme, sound. Remember
choices via `shared/storage`.

## 7. Cosmetics and Arcade Pass

- Garage: 20–30 cosmetics (car bodies, colours, horn sounds, trails,
  donkey hats for the 2P donkey player). Cosmetic only.
- `ports/donkey-dash/pass.manifest.ts`: about 20 badges including counted
  and secret ones, e.g. Hee-Haw Hundred (dodge 100 donkeys), Zero Donkeys
  Harmed (finish a route without a crash), Whisker Master, Road Tripper,
  Daily Driver (7-day streak), Stubborn (lose 10 in a row to the donkey),
  Donkey Supreme (win 2P as the donkey). XP per the Pass caps.

## Workflow

1. Engine with tests: original rules, collisions, dodge counting, scoring,
   hazards, speed curves, near-miss tiers, 2P commit line, seeding.
2. Classic view renderer and UX end-to-end; then Chase view; then
   Isometric view.
3. Modes, settings, saves, Pass, cosmetics.
4. Art-direction loops (at least four): screenshots of title, settings,
   each mode, all three camera views (every route in each view), crash
   sequence in each view, 2P split screen, daily result, in light and dark,
   at 1440×900, 1024×768, 844×390 and 390×844 → critique → fix.
5. Playtest via Playwright with a scripted player: tune reaction windows so
   Normal feels fair on a phone, and Road Trip difficulty rises smoothly.
6. Hall integration: catalog entry, screens/cover per ADR 0005.

## Deliverables

- The game in `ports/donkey-dash/`, tests green, lint clean, build passes.
- `README.md` and the three docs in `ports/donkey-dash/docs/` (ABOUT,
  HOW-TO-PLAY, ARCHITECTURE with Mermaid), exactly as CLAUDE.md requires.
- `docs/games/donkey-dash.md` (original behaviour, diff log), ADRs as
  needed (camera abstraction, 2P donkey role, `shared/daily` if created).
- Screenshots in `media/`, `PORTS.md` row, Hall catalog entry.
- One commit: "Add Donkey Dash, a remake of DONKEY.BAS".

## Report at the end

What was built, deviations and why, tuning numbers, and follow-up ideas.

## Suggested run

After prompt 002 is done. Opus 5.5, effort **xhigh**:
"Read prompts/005-donkey-dash-port.md and do it."
