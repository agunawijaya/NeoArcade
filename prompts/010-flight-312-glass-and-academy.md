# 010 — Flight 312, part 2: glass cockpit, flight school, daily approach and replays

## Read first

1. `CLAUDE.md`, `docs/ARCADE-PASS.md`, `BACKLOG.md`.
2. Everything prompt 009 produced: `ports/flight-312/docs/*`,
   `docs/games/flight-312.md`, its ADRs and its final report. Build on the
   engine and cockpit framework; don't fork them.
3. `shared/daily` and how Skyline Showdown, Donkey Dash and Long Haul use it.

## Goal

Complete Flight 312 with a second, modern flight deck and the features
that make people come back: a **glass cockpit (747-400 era)** selectable in
Settings, a **flight school**, a **Daily Approach**, and **landing replays**
worth sharing.

## Hard rules

Same as 009: zero raster assets, no trademarks, accurate layout and
behaviour drawn from your own knowledge and public references (never
traced), deterministic engine, Pass integration, desktop first.

## 1. Glass cockpit (747-400 era)

Selectable in Settings ("Flight deck: Classic / Glass"), switchable before
each flight. Same engine, same world.

- **Two-crew layout**, no flight engineer station.
- **PFD:** attitude with flight director, speed tape with bugs and trend
  vector, altitude tape, vertical speed, heading, localiser and glideslope
  scales, flight mode annunciations.
- **ND:** map, VOR and approach modes with range selection, wind arrow,
  route line through the VORs, DME, track and heading.
- **EICAS:** upper (engine primary: EPR/N1, EGT, gear and flap position,
  alerts) and lower (secondary engine and system pages relevant to the
  game: fuel, gear, flight controls).
- **Mode control panel** on the glareshield: speed, heading, altitude,
  vertical speed, LNAV-style route following between the original's VORs,
  LOC and APP modes, autothrottle.
- **CDU:** a deliberately simplified flight-management page set — route
  (VOR to VOR), approach selection, performance (V-speeds from weight),
  progress. Clearly enough to fly the game's routes, not a full FMS.
- Same interaction model as the classic deck (click/drag, keys, gamepad,
  yoke), same night lighting, same zoomable clusters.
- **1982 Rules** level keeps the classic deck only (the glass deck shows a
  short note why).

## 2. Flight school

A lesson path from first takeoff to a crosswind landing in fog, taught by
an instructor voice (reuse part 1's speech system: Web Speech API, local
voices only, a voice distinct from ATC, always with on-screen text), about 12 lessons, each with a goal, a demo option where the test
pilot flies it first, live coaching cues, and a 1–3 star debrief.
Suggested arc: cockpit tour (classic and glass) → takeoff roll → rotation
and climb-out → turns and heading → tuning a VOR and tracking a radial →
DME and position → descent planning → ILS capture → flying the glideslope
→ flare and touchdown → crosswind landing → missed approach → full flight
check-ride. Lessons are data files, validated by tests and flown by the
test pilot in CI.

## 3. Daily Approach

Seeded from the UTC date via `shared/daily`: one destination, wind, cloud
base and visibility, starting 15 nm out. One scored attempt per day at the
player's chosen realism level (shown in the result). Score from
stabilised-approach criteria and the landing report (touchdown rate,
distance from the touchdown zone, centreline offset, flare quality).
Spoiler-free share text, e.g.
`Flight 312 · Daily Approach #12 · BOS ☁️ 300 ft · 💨 18 kt · 🛬 142 fpm · ★★☆`.
Streaks and calendar.

## 4. Landing replays

After every landing (or crash), an instant replay from cinematic external
cameras — tower, runway-side, chase, cockpit — with the approach path,
glideslope and touchdown point overlaid, plus a slow-motion touchdown. The
external aircraft is a code-drawn generic four-engine jumbo with an
invented livery. "Save replay" stores the last 10 replays locally
(engine inputs + seed, not video); a challenge link encodes a replay the
same way Skyline Showdown's links do.

## 5. Arcade Pass (part 2)

More badges: Glass Act (full flight in the glass deck), Student Pilot
(finish the first lesson), Check-Ride (pass the final lesson), Daily
Flyer (7-day Daily Approach streak), Kiss Landing (under 60 fpm), Crosswind
Ace, Night Owl (land at night), Weather Watcher (land in every cloud
condition). XP per the Pass caps.

## Workflow

1. Glass deck: PFD, ND, EICAS, MCP, CDU — each with a visual test page at
   key values; autopilot/autothrottle modes in the engine with tests.
2. Flight school data, instructor, debriefs; test pilot flies every lesson.
3. Daily Approach and share text.
4. Replay system and cameras; challenge links.
5. Art-direction loops (at least four): glass deck by day and night, a
   lesson in progress, daily result, replay cameras, at 1920×1080,
   1440×900, 1280×720 and 844×390 → critique → fix.
6. Tests (determinism in three browsers), lint, build, performance budget.

## Deliverables

- Features above; all three docs updated (ABOUT teaser for both decks and
  the school; HOW-TO-PLAY for glass controls, lessons, daily scoring,
  replays; ARCHITECTURE with Mermaid for the glass deck, lesson format,
  daily seeding and replay format).
- ADRs as needed; `docs/games/flight-312.md` diff log; screenshots;
  `PORTS.md`.
- One commit: "Add the glass cockpit, flight school, Daily Approach and
  replays to Flight 312".

## Report at the end

What was built, deviations and why, follow-up ideas.

## Suggested run

After 009 is done and its report reviewed. Opus 5.5, effort **xhigh**:
"Read prompts/010-flight-312-glass-and-academy.md and do it."
