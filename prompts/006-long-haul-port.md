# 006 — Long Haul (port of Trucker by Hughes Glantzberg, GW-BASIC, early 1980s)

## Read first

1. `CLAUDE.md` (rules, code style, three documents, Arcade Pass rule).
2. `docs/ARCADE-PASS.md`, `shared/*` (including `shared/daily` if it exists).
3. `ports/skyline-showdown/` as the reference for structure and docs quality.
4. `sources/Trucker/trucker.bas` — read all 386 lines. The text uses IBM
   code page 437 box-drawing characters (title logo); decode accordingly.

## Goal

Build **Long Haul** in `ports/long-haul/`: a road-trip strategy game about
running a big rig across America. Keep Trucker's heart — every choice
(cargo, load, tires, route, speed, sleep, fuel) trades money against time
and risk — and turn the text prompts into a living map, a drivable road,
illustrated events, a CB radio full of voices, and a career that keeps you
on the road.

Credit line (title screen, README, ABOUT): *"Inspired by Trucker by Hughes
Glantzberg."* The original prints the author's 1980s street address — do
**not** reproduce it anywhere.

## Hard rules

- Zero raster assets. Map, landscapes, cab, events, postcards: all drawn in
  code. Audio synthesized.
- The US map uses **public-domain** geographic data only (e.g. Natural Earth
  or US Census cartographic boundaries), simplified at build time and stored
  as compact path data in the repo. Record the source and licence in
  `ARCHITECTURE.md` and an ADR. No map tiles, no runtime network calls.
- Engine first: pure TypeScript, hour-by-hour simulation, seeded and
  deterministic, no DOM, fully tested. All writing (CB chatter, event text,
  postcards, diner menus) is authored content shipped with the game — no AI
  calls at runtime.
- Arcade Pass integration; light and dark; reduced motion;
  keyboard/mouse/touch/gamepad; desktop first, playable on a phone.

## 1. Engine — what the original does

Confirm every formula in the source; where the code and this list differ,
the code wins and you note it in `docs/games/long-haul.md`.

- **Clock:** trip starts Monday 8 AM at the Los Angeles terminal; the cargo
  is due in New York by 4 PM Thursday. Simulation advances one hour at a
  time; each hour the truck covers `speed` miles.
- **Cargo:** 1 oranges (6.5¢/lb, spoil damage), 2 freight (5¢/lb, late
  penalty), 3 U.S. Mail (4.75¢/lb, no hurry). Load 25,000–50,000 lb.
- **Tyres:** wear factor `TC` starts 10; replacing worn tyres (new $200 /
  retread $100) lowers it. One spare.
- **Routes:** north (I-15/I-70/I-80, 2,710 mi, rough-weather factor 4),
  middle (I-40/I-44/I-70, 2,850 mi, factor 2), south (I-10/I-20/I-85/I-95,
  3,120 mi, factor 1) with their waypoint tables from the `DATA` lines.
- **Per hour:**
  - crash if `speed² × fatigue × weather > random × 10⁷`;
  - blown tyre if `√(miles + 100) × TC > routeFactor × 25,000 × random`;
  - speeding check when `speed > limit − routeFactor + 10`, ticket unless
    `(speed − limit + 2·routeFactor − 5)² < 900 × random`;
  - fuel burn `speed / (4.5 − 0.2·min(|55 − speed|, 12.5))` gallons
    (best economy at 55 mph); 200-gallon tank.
- **Speed cap:** 1.5 × current limit; minimum 20 mph.
- **Fatigue:** hours since sleep and the ratio of hours awake to hours slept
  give six states from "rested" to "EXHAUSTED"; daytime sleep counts half.
- **Weather:** per route and distance — clear, wet, rain, light snow, fog,
  blizzard — each with a risk weight (1, 3, 5, 5, 10, 50).
- **Waypoint events** (the integer part of each waypoint's code is the
  event, the fraction its chance or toll): time-zone change, toll,
  construction (35 mph), radar, weigh station (and the Louisiana overweight
  detour of 200 miles via Arkansas), Allegheny tunnel rock slide, reefer
  unit failure (oranges only).
- **Police:** escalating fines per offence; a fourth offence means jail and
  a revoked licence — game over.
- **Truck stop** every few hours: diesel at a random price, tyres, sleep.
- **Arrival:** payment by cargo, minus expenses and $85/day truck costs;
  oranges spoil with delays and reefer trouble; freight is late after a
  deadline. Running total of profit; bankrupt → rig repossessed.

**Original bugs — fix and document each:**

- Buying a tyre at a truck stop hits `STOP` (never finished). Implement it.
- Emergency fuel ($200) is added to the wrong variable (`ZC`), so it is
  never charged.
- A blown tyre sets fatigue with `HL=HR+T+1` instead of `HL=HL+T+1`.
- The "warehouse closed at night" check uses `HR-INT(HR/24)` instead of the
  hour of day.
- The late-freight penalty is printed but never subtracted.
- The fatigue checks use `COS(HR/HS) < 2.3`, which is always true.
- "Midnight" is assigned to the wrong variable; `TIMEPUT` typo; the legal
  load limit text (40,000) and the weigh-station limit (60,000) disagree.
- Data typos in waypoint names (Flagstaff "in California", "Demoines",
  "New Lersey") — correct them.

## 2. Map scope

- **Single Haul:** the three original LA → NY routes, faithful.
- **Return trip:** NY → LA on the same three corridors, reversed, with time
  zones setting the clock back and deadlines recalculated.
- **Career contracts:** a network of about 15–20 major US freight hubs
  (e.g. Seattle, San Francisco, Los Angeles, Phoenix, Denver, Dallas,
  Houston, Chicago, Memphis, Atlanta, Miami, Charlotte, Washington D.C.,
  New York, Boston, Minneapolis, Kansas City) joined by real interstate
  corridors. Each corridor has waypoints with realistic mileages, speed
  limits, terrain, weather profile, tolls, weigh stations and event
  chances, in the same spirit as the original tables. Keep the data in
  typed files, validated by tests (connected graph, mileages plausible).

## 3. Two play rhythms (Settings)

Same engine, two front ends:

- **Real-time:** the hours roll (about 3 seconds per in-game hour, with 1×,
  2×, 4× and pause). A throttle lever / pedal sets speed at any moment.
  Events pause the clock and ask.
- **Leg by leg:** like the original — at each waypoint choose a speed, then
  watch the leg play out at high speed with its events, and decide again.

## 4. Two driving views (Settings)

Switchable from pause; identical information in both.

- **Cab view:** from the driver's seat — dashboard with speedometer, fuel
  gauge, clock, odometer, CB radio set; road through the windscreen with
  weather on the glass (rain streaks, wipers, frost, fog), headlights at
  night, mirrors that show flashing lights when the police are behind you.
- **Side diorama:** the rig crossing layered landscapes that change by
  region: Mojave desert, Arizona mesas, New Mexico high plains, Texas
  panhandle, Ozarks, Midwest farmland, Rockies, Appalachian tunnels,
  Pennsylvania Turnpike, the Manhattan skyline on arrival. Real sky by time
  of day, sunrise and sunset, stars, weather.
- **Fatigue is felt in both:** edges darken, slow "blinks" when tired,
  stronger as it worsens — always readable, softened under reduced motion.

### Where am I? — always-visible position tracking

The player must always know where the rig is, in every view and rhythm:

- **Route strip:** a slim bar across the top of the driving screen — the
  whole route from origin to destination as a line, every waypoint town as
  a tick with its name on hover/focus, the rig as a moving marker, the next
  waypoint and next truck stop highlighted, plus miles to go, ETA and the
  deadline (green when on time, amber when tight, red when late). Upcoming
  known events (toll, weigh station, construction) show as small icons.
- **Mini-map:** a corner map showing the current region of the US map, the
  route, the rig's position and heading, nearby weather systems, and the
  day/night terminator. In the **cab view** it is diegetic: a folded paper
  road atlas clipped to the dashboard with a pin (period-correct — no GPS
  in the early '80s), with a pencil line for the route travelled. In the
  **side diorama** it is a clean overlay panel.
- **Full map on demand:** one key (M), a tap on the mini-map, or a gamepad
  button opens the full map screen (section 5) over the paused game, with
  the trip so far drawn as a trail (colour-coded by speed, with markers for
  stops, tickets, blown tyres and weather incidents). Close it to resume.
- At each waypoint the strip and mini-map pulse briefly and the town name
  slides in, with its postcard if it is the first visit.
- In **Leg by leg** mode, the leg about to be driven is highlighted on the
  strip and mini-map while the player picks a speed.

## 5. The map screen

The home of the game: a code-drawn United States with state outlines,
interstate corridors, waypoint towns, the rig moving along its route, a
moving day/night terminator, weather systems drifting across (Rockies
blizzards, Appalachian fog, Gulf rain), time-zone bands, and occasional
police markers. Zoom and pan. Route planning happens here: compare routes
by distance, tolls, weather risk and limits before you commit.

## 6. Stops, events and voices

- **Truck stops** as diner scenes: fuel pump with today's price, tyre shop,
  sleeper bunk or motel, a coffee (small fatigue relief, can't replace
  sleep). Each stop has a name and a little character.
- **Events** as illustrated cards with choices and consequences: police
  stop, radar, weigh station, construction, toll booth, rock slide, reefer
  failure, blown tyre, running dry, the Louisiana detour.
- **CB radio:** short chatter between drivers on the road — tips about
  radar ahead, weather, cheap diesel, closed weigh stations. Tips are
  **useful but not always right** (each speaker has a reliability the
  player can learn). Several hundred authored lines with trucker flavour,
  never mean-spirited. Original jokes stay ("DUMMY !!", "You'd make more
  money washing dishes!").
- **Postcards:** passing a waypoint town for the first time collects a
  code-drawn postcard with a two-sentence note about the place. An album
  shows the collection per route and region. Facts must be accurate and
  general; keep claims modest.
- **Arrival ledger:** an animated logbook and receipts — fuel, tyres,
  tolls, fines, truck costs, payment, profit — stamped GOOD WORK!! or with
  the dish-washing line.

## 7. Modes

| Mode | Rules |
|---|---|
| **Single Haul** | One trip LA → NY or NY → LA, original rules (bugs fixed). |
| **Career** | Pick contracts from a job board (cargo, origin, destination, pay, deadline, special conditions). Profit carries over; buy upgrades (bigger tank, fuel-efficient engine, sleeper cab, reliable reefer, better tyres, radar detector with a fine-print risk). Seasons change weather on the map: the northern routes in winter are a gamble. Reputation with shippers unlocks better contracts. Bankruptcy repossesses the rig; a career summary records the run. |
| **Daily Haul** | Same contract and weather seed for everyone (UTC date); one scored trip per day; spoiler-free share text with profit and days on the road; streaks. Use `shared/daily` if present, otherwise create it there with an ADR. |

## 8. Settings

Mode, play rhythm, driving view, units (miles/km display only — engine
stays in miles), difficulty (Easy: fewer events and gentler fines;
Normal: original odds; Hard: harsher weather and police), CRT/text-mode
filter Easter egg that shows the original-style green-on-black prompts,
theme, sound. Remembered via `shared/storage`.

## 9. Arcade Pass

`ports/long-haul/pass.manifest.ts` with about 25 badges, e.g.: Coast to
Coast (first delivery), Fresh Squeezed (oranges with zero damage), Smokey's
Best Friend (three tickets in one trip), Washing Dishes (average profit
under $250 — secret), Iron Bladder (600 miles without a stop), Night Owl,
Postcard Collector (all towns on one route), Holland Tunnel, Blizzard
Survivor, Rock Slide Napper, Million-Mile Club (career), Repossessed
(secret). XP per the Pass caps.

## Workflow

1. Engine with tests: every formula above, each event, each bug fix,
   payments, deterministic replays from a seed; then the corridor graph
   and data validation.
2. Map screen and route planning.
3. Real-time and leg-by-leg front ends; truck stops; event cards; ledger.
4. Cab view, then side diorama.
5. CB radio, postcards, career, daily, Pass, settings.
6. Art-direction loops (at least four): map (day/night, weather), each
   region in both views with the route strip and mini-map visible, the
   full-map overlay with a finished trip trail, each event card, diner, ledger, postcards, career
   board, in light and dark at 1440×900, 1280×720, 1024×768 and 844×390 →
   critique → fix.
7. Balance pass via Playwright and engine simulations: run thousands of
   seeded trips with simple strategies (cautious, balanced, reckless) and
   tune so careful play is reliably profitable, reckless play is exciting
   but costly, and Normal keeps the original's feel. Put the results table
   in `docs/games/long-haul.md`.

## Deliverables

- The game in `ports/long-haul/`, tests green, lint clean, build passes.
- `README.md` and the three docs in `ports/long-haul/docs/` (ABOUT,
  HOW-TO-PLAY, ARCHITECTURE with Mermaid), as CLAUDE.md requires. ABOUT
  states only what can be supported about the original (author, GW-BASIC,
  era); say "early 1980s" unless you can confirm a year.
- `docs/games/long-haul.md`: original behaviour, every bug and its fix,
  diff log, balance results.
- ADRs: map data source and licence, hour-tick engine with two front ends,
  corridor data model, `shared/daily` if created.
- Screenshots in `media/`, Hall catalog entry and screens, `PORTS.md` row.
- One commit: "Add Long Haul, a remake of Trucker".

## Report at the end

What was built, deviations and why, balance numbers, and follow-up ideas.

## Suggested run

After prompt 002. Opus 5.5, effort **xhigh**:
"Read prompts/006-long-haul-port.md and do it."
