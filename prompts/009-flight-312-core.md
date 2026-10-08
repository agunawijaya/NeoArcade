# 009 — Flight 312, part 1: flight model, 3D world and the classic jumbo cockpit

Port of **JETSET** — "IFR flight simulator (Boeing 747)" by Jean Szymanski,
created 28 June 1981, revised 25 February 1982, instructions published in
BYTE magazine, November 1982. This is part 1 of 2; part 2
(`010-flight-312-glass-and-academy.md`) adds the glass cockpit, the flight
school, daily approaches and landing replays.

## Read first

1. `CLAUDE.md`, `docs/ARCADE-PASS.md`, `BACKLOG.md`.
2. `docs/HALL-ARCHITECTURE.md` and the catalog schema (if prompt 008 has
   run, set `category: simulation` and an `origin`; otherwise use genres).
3. ADRs 0015–0017 (Long Haul's public-domain map data — reuse the
   approach and, where useful, the data pipeline).
4. All three files in `sources/Jetset/` — they are **one program in two
   editions**, not three games:
   - `Jetset.bas` (1,061 lines): single-file edition, apparently the
     original TRS-80-style version (`SYSTEM "CLOCK OFF"`, `CLEAR 2000`,
     `RND(n)`). Takeoff module at line 10000, cruise/approach at line 23,
     joined by `GOTO 24`. Author spelled "Jean Szymanski", callsign
     "Air Canada 312", keys U/D pitch and C flare.
   - `Ajetoff.bas` (403 lines) + `Ajetcruz.bas` (673 lines): the **IBM PC
     BASIC conversion dated 30 October 1982**, split in two because of
     memory limits — the takeoff module ends with `CHAIN "OJETCRUZ"` into
     the cruise/approach module. Author spelled "Gene Szymanski", callsign
     "United 312", numeric-keypad controls (8/2 pitch, 6 flare), clock-seeded
     `RANDOMIZE`, thrust clamped to its lever range, and the post-takeoff
     checklist printed in the right order.
   Build **one port** from both editions. Diff them line by line and record
   every difference in `docs/games/flight-312.md` (table: topic, single-file
   edition, IBM edition, what the port does). Default rule: the IBM edition
   wins where it fixes a bug; the single-file edition is the reference
   otherwise. Note in particular: two VOR coordinates differ (stations 8 and
   10 — check which matches the real station and use that one); the IBM
   edition introduces its own bugs (`GL=GL(1)` instead of `G1=GL(1)` on
   line 1418; the missed-approach key no longer sets the missed-approach
   flag; the runway outline loop prints `RS$(1..4)` instead of `RS$(0..3)`;
   the "short of runway" threshold changed from 100 ft to 0). The author's
   first name differs between editions — ABOUT must say so honestly rather
   than pick one without evidence.

## Goal

Build **Flight 312** in `ports/flight-312/`: a jumbo-jet IFR flight that
keeps JETSET's structure — takeoff from Philadelphia, navigate by radio
beacons, fly an ILS approach through low cloud and land on a 10,500 ft
runway — inside a **faithful, fully code-drawn cockpit of the classic
four-engine jumbo (747-100/200 era, analog instruments, three-crew
flight deck)**, with a **3D out-the-window world**, and difficulty that
runs from arcade-friendly to procedure-accurate.

## Names and trademarks

- Title: **Flight 312**. Credit line (title screen, README, ABOUT):
  *"Inspired by JETSET, an IFR Boeing 747 simulator by J. (Jean/Gene)
  Szymanski (1981–82, BYTE magazine; IBM PC edition 1982)."* — adjust the
  name once ABOUT's research settles it. The word "Boeing 747" appears only in that
  credit and in ABOUT's history section.
- In the game the aircraft is "the jumbo" or a model designation you
  invent; no Boeing logos, wordmarks or livery. The originals' "Air Canada
  312" / "United 312" becomes flight 312 of an invented airline — check the name is not a
  real carrier.

## Hard rules

- Zero raster assets: cockpit, instruments, terrain, sky, clouds, runway
  textures and markings are all generated in code (SVG/Canvas for the
  cockpit, WebGL for the world; procedural textures only). Three.js (or a
  similar library from npm) is allowed for the 3D world; record it in an ADR.
- The cockpit must be **accurate in layout, instrument design and
  behaviour** — positions of panels and instruments, dial faces, scales,
  needle ranges, flag behaviour — based on public reference material and
  your own knowledge. Draw it yourself; never trace photos or copy
  manufacturer artwork or manual text.
- Engine first: flight model and navigation in pure TypeScript, fixed time
  step, seeded, deterministic, no DOM, fully tested. Rendering and audio
  read the state; they never change it.
- Arcade Pass integration; light/dark for menus (the cockpit itself keeps
  its real colours, with a night-lighting mode); reduced motion respected
  (no camera shake, no turbulence wobble of the view).
- Desktop first (1280×720 and up). Phone landscape gets a simplified
  layout that is still playable.

## 1. What the original does (engine reference)

Confirm everything against the source; where it differs, the code wins
and you note it in `docs/games/flight-312.md`.

- **Start:** runway at 39.8667 N, 75.25 W (Philadelphia International),
  heading 075, 200,000 lb fuel, clock 07:59 → takeoff clearance 08:00.
  ATC brief: surface wind variable gusting 15, minimum ceiling, scattered
  at 20,000, broken at 30,000; maintain 075 to 3,000 then as filed.
- **Takeoff:** release brakes, full thrust, keep the alignment index centred
  against gusty crosswind (rudder only above 50 kt), flaps set before
  rotation, rotate at **≥ 150 kt** with pitch ≤ 10°, otherwise tail strike.
  Leaving the runway sides hits the lights; overrunning 10,500 ft ends in
  the marshes (and "you forgot the flaps" if they were up). Below 1,200 ft:
  gear up, flaps up, reduce thrust; above 1,800 ft with climb thrust the
  cruise module starts.
- **Cruise:** thrust lever in seven positions (max … idle … reverse), pitch,
  rudder-rate turns, fuel burn by thrust, winds aloft in eleven 4,000-ft
  bands with a wind-triangle drift, VLF Omega latitude/longitude, VHF nav
  receiver with frequency, radial, auto-OBS, CDI needle, TO/FROM flag, DME.
  Sixteen VORs with 1981 frequencies and positions (JFK, Robbinsville,
  Boston, Albany, Philipsburg, Buffalo, Sault Ste. Marie, Green Bay,
  Joliet and others — identify each from its coordinates and frequency and
  document the table); six of them define ILS approaches.
- **Approach:** within 10–12 nm of an ILS station, below 4,000 ft, on the
  right radial (±2.5°, then ±9°) the marker lights; heading within ±1° of
  the localiser with rudder neutral captures the ILS. Glideslope ≈ 2.82°;
  localiser and glideslope deviation shown as crosshairs; outer and middle
  markers; radar altimeter; crosswind drift on final.
- **Landing:** flare key, then touchdown checks: flare too high (stall,
  above 100 ft crash, above 80 ft hard), gear up (belly landing), short of
  the runway, off the side, rolling off the end, no flare (company
  violation), reverse thrust and braking; missed approach key. Each outcome
  prints a report with distance from threshold and centreline.
- **Quirks and bugs to fix and document:** thrust index can exceed its
  lever range; the takeoff gust variable `WS` is never assigned, so the
  computed crosswind never applies; `RANDOMIZE 57.2958` makes every flight's
  weather identical; the post-takeoff trim checklist prints steps in the
  order 1-3-2; a missing quote on line 3032; "CENERLINE"; airspeed in cruise
  is simply `800 − 100·thrust − 2·pitch`.

## 2. Flight model and realism levels (Settings)

One engine, four levels; the level is chosen per flight and shown on the
results:

| Level | Feel |
|---|---|
| **1982 Rules** | The original's simplified model and its success/failure rules, bugs fixed, inside the new cockpit. For purists and for the ABOUT story. |
| **Arcade** | Forgiving: flight director cues, auto-trim, auto-flaps and gear prompts, a ghost glidepath in the 3D view, generous touchdown limits, optional pause-and-hint. |
| **Pilot** | A real point-mass model (lift, drag, thrust, weight, flap and gear drag, ground effect, stall) tuned to public performance figures of the classic jumbo; V-speeds computed from weight and flaps; checklists offered but not enforced. |
| **Captain** | Pilot model plus procedures: flap detents and speed limits, checklists required, ATC clearances to follow, fuel planning, crosswind limits, stabilised-approach criteria, go-around if unstable. |

Validate Pilot/Captain against plausible public numbers (rotation and
approach speeds by weight, climb rate, cruise around Mach 0.84 at FL350,
fuel flow per engine) in tests with tolerances; document sources and the
numbers in `docs/games/flight-312.md`.

## 3. The classic cockpit (747-100/200 era)

Code-drawn, accurate, alive. Built as layered vector panels over the 3D
view, with a seated-pilot camera that can look around.

- **Captain's panel:** ADI with flight director bars, HSI with course and
  heading bugs, airspeed indicator with bugs, altimeter, vertical speed,
  RMI, radio altimeter, DME readouts, marker beacon lights, clock, the
  warning lights that matter (stall, gear, GPWS).
- **Centre panel:** four columns of engine instruments (EPR, N1, EGT, N2,
  fuel flow), landing gear lever with lights, flap position indicator.
- **Glareshield:** the autopilot/flight director mode panel of the era
  (heading, altitude hold, VOR/LOC, ILS approach, vertical speed) — usable
  from the Pilot level up; disabled under 1982 Rules.
- **Pedestal:** four thrust levers with reversers, flap lever with detents,
  speedbrake, parking brake, VHF nav/comm radios with frequency knobs,
  the INS/Omega display that echoes the original's VLF Omega readout.
- **First officer's side** mirrors the essentials; **overhead panel** and
  the **flight engineer's station** are drawn faithfully; the engineer panel
  shows live fuel quantities per tank (Captain level may require fuel
  balancing; otherwise read-only).
- **Interaction:** click/drag knobs, levers and switches; mouse wheel on
  knobs; keyboard shortcuts for everything (plus an optional
  "1982 keys" map in two flavours — single-file edition: F/S thrust, , and .
  rudder, U/D pitch, W gear, L flaps, V freq, R radial, A auto-OBS, Q
  reverse, M missed approach, C flare, B brakes; IBM PC edition: the same
  but numeric keypad 8/2 for pitch and 6 for flare); gamepad and joystick/yoke via the Gamepad API (pitch/roll on
  stick, throttle on trigger or axis, rudder on twist or bumpers).
- **Views:** preset head positions (main panel, pedestal, overhead,
  engineer, look left/right, out the window), smooth transitions, and a
  zoom on any instrument cluster for small screens.
- **Lighting:** day, dusk and night cockpit lighting with flood and
  integral instrument lighting; real night flights glow.

## 4. The 3D world outside

- The departure airport and every ILS destination built as 3D scenes:
  runways with correct markings, edge/centreline/touchdown-zone lights,
  approach lighting system, VASI (period-correct), taxiways in simplified
  form. Runway positions and headings from public-domain data (e.g. FAA or
  OurAirports); record source and licence in an ADR. Keep the original's
  10,500 × 200 ft runway at Philadelphia for 1982 Rules.
- Terrain: stylised, generated from public-domain coastline and elevation
  data at low resolution (rivers, coasts, the Great Lakes, Appalachian
  ridges), with procedural fields and towns; it must read as the real
  region from altitude.
- **Weather is the drama:** low ceiling and fog from the ATC brief — on
  approach you are in grey until breaking out near minimums to see the
  approach lights. Cloud layers at the original's altitudes, rain on the
  windscreen, wipers, gusts that move the nose.
- Sky with sun position by real time of day, dawn departure at 08:00,
  night when flights run long.
- An external chase camera exists only for the results replay (part 2
  expands it).

## 5. Navigation and maps

- VOR/ILS data from the original (1982 world). An en-route chart screen
  drawn in the style of a period IFR chart (but not imitating any
  publisher's trade dress): VORs with compass roses, radials, airports,
  the flown track and wind arrows. Opens over the paused sim.
- Destinations: every ILS-equipped station in the table, with a flight
  plan prepared on the briefing screen (route by VOR radials, distance,
  fuel, expected winds).

## 6. Modes in part 1

| Mode | Content |
|---|---|
| **Flight 312** | The full flight: briefing, takeoff from Philadelphia, cruise, approach and landing at the chosen destination. Time acceleration 1×–16× in cruise (never below 2,000 ft AGL). |
| **Takeoff** | Practice the takeoff and climb-out to 3,000 ft. |
| **Approach** | Start 15 nm out on any ILS, choose weather and wind. |

Every ending produces an **accident/incident report** in the spirit of the
original's messages (rewritten, not copied): what happened, where, the
numbers, and one line of advice. Successful landings get the landing
report: touchdown rate, distance from threshold, centreline offset.

## 7. Sound

Synthesized: four-engine spool-up and whine, wind noise rising with speed,
gear and flap motors, trim wheel clicks, marker beacon tones (outer/middle
at their real pitches and patterns), stall warning, GPWS-style altitude
callouts via the Web Speech API when available (fallback: on-screen text
and tones).

### ATC voices (owner decision: browser speech, option A)

Air traffic control **speaks**, not only subtitles, using the browser's
built-in **Web Speech API** (`speechSynthesis`). Pre-recorded voice clips
are out of scope for now (tracked as FL-03 in `BACKLOG.md`).

- **Who talks:** Clearance Delivery, Tower, Departure, Center, Approach,
  then Tower again at the destination — each controller a different voice
  (pick distinct local voices and vary pitch and rate), handing the flight
  over with real frequencies the player tunes on the comm radio.
- **What they say:** realistic US phraseology modelled on FAA Order
  JO 7110.65 (public domain): the original's clearance ("cleared as filed,
  maintain heading 075 to 3,000"), takeoff clearance, wind checks,
  handoffs, altitude and heading assignments, approach clearance for the
  ILS, landing clearance, go-around instructions. Numbers spoken the
  aviation way ("tree thousand", "niner", headings digit by digit,
  "one one eight point seven"). Write the phrase set as data, with tests
  that every phrase renders to correct spoken and written forms.
- **Radio feel:** Web Speech output cannot be routed through Web Audio, so
  approximate the radio: a Web Audio mic-key click and short static burst
  before each transmission, a squelch tail after, low cockpit/engine
  ducking while someone speaks, and a faint static bed while the frequency
  is busy. Never overlap two transmissions; queue them.
- **Pilot side:** at Pilot and Captain levels the player answers with a
  short readback chosen from options (Captain: a wrong or missing readback
  gets "say again" or a correction). At Arcade and 1982 Rules the first
  officer reads back automatically (spoken in a separate voice).
- **Privacy and consistency:** use **local voices only**
  (`voice.localService === true`); some browsers offer "online" voices that
  send text to a third-party server — never use those. Prefer English
  voices; if none are installed, fall back to subtitles plus radio clicks
  and tell the player once, politely.
- **Settings:** ATC voice on/off, voice volume separate from engine and
  effects, subtitles on/off (default on), speaking rate (slow/normal/fast).
- **Deterministic engine:** ATC decisions and timings live in the engine
  and are tested; speech is just a renderer of those events and must never
  affect simulation timing.

Document the ATC system in ARCHITECTURE (event flow from engine to speech
queue, Mermaid) and the phraseology in HOW-TO-PLAY (a short glossary of
what controllers say and what it means).

## 8. Arcade Pass (part 1)

Badges such as: Wheels Up (first takeoff), Greaser (touchdown under 100
fpm), Breakout (land in minimum-ceiling fog), Marshlands (secret: overrun
the runway), Tail Strike, Belly Flop (secret: land gear up), Go-Around
(a correct missed approach), 1982 Ace (full flight under 1982 Rules),
Captain's Hat (full flight at Captain level). Part 2 adds more.

## Workflow

1. Engine: 1982 Rules model with tests reproducing the original's
   outcomes; nav data and VOR/ILS logic; then the Pilot/Captain flight
   model with performance tests; deterministic seeds for weather.
2. Scripted autopilot "test pilot" that flies complete flights at each
   level — proves every destination is flyable and gives balance numbers.
3. 3D world (airports, lights, weather) behind a debug camera.
4. Classic cockpit, instrument by instrument, each with a visual test page
   showing it at key values (e.g. ADI at ±30° bank, altimeter at 10,000 ft).
5. Modes, briefing, reports, settings, Pass, Hall entry.
6. Art-direction loops (at least five): captain's panel by day and night,
   pedestal, overhead, engineer station, takeoff roll, breakout on final
   with approach lights, touchdown, each destination, reports, at
   1920×1080, 1440×900, 1280×720 and 844×390 → critique against your
   knowledge of the real flight deck → fix.
7. Performance: steady 60 fps at 1440×900 on a mid-range laptop GPU;
   document the budget.

## Deliverables

- The game in `ports/flight-312/`, tests green (determinism in Chromium,
  Firefox, WebKit), lint clean, build passes.
- README and the three docs (ABOUT with the JETSET/BYTE history;
  HOW-TO-PLAY with controls tables for keyboard, mouse, gamepad/yoke, every
  realism level, a step-by-step first flight, tips for takeoff, navigation
  and landing; ARCHITECTURE with Mermaid: engine, flight models, nav, 3D
  world, cockpit rendering, where each drawn asset lives).
- `docs/games/flight-312.md`: original behaviour, VOR table identified,
  bugs and fixes, performance validation numbers, diff log.
- ADRs: 3D library and rendering split, flight-model levels, airport and
  terrain data sources and licences, cockpit rendering.
- Screenshots in `media/`, Hall catalog entry and screens, `PORTS.md` row.
- One commit: "Add Flight 312 part 1, a remake of JETSET".

## Report at the end

What was built, how the cockpit's accuracy was checked, performance
numbers, deviations and why, and anything part 2 must know.

## Suggested run

Opus 5.5, effort **xhigh**: "Read prompts/009-flight-312-core.md and do it."
