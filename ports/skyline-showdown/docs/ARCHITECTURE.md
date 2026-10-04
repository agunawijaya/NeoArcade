# Skyline Showdown — architecture

The game has three layers. A pure **engine** decides everything and never
touches the DOM, and computes the same bits in every browser. A **game**
layer runs turns, input, the CPU and playback. The modes' rules and data
live beside it, just as pure: the World Tour in **tour/** and
**wardrobe/**, Trick Shot in **tricks/**, the Daily Skyline in **daily/**
and challenge links in **challenge/**. The **render** and **ui** layers
make it visible and audible. Shared pieces (`@shared/*`) handle input,
audio, the loop, randomness, storage, daily seeds and sharing,
post-processing and the Arcade Pass.

## Module overview

```mermaid
flowchart TB
  subgraph engine["engine/ (pure, seeded, exact, tested)"]
    match[match.ts]
    shot[shot.ts]
    twists[twists.ts]
    targets[targets.ts]
    exact[exact-math.ts]
    version[version.ts]
    ai[ai.ts]
    skyline[skyline.ts]
    rest["worlds, wind, gorillas,<br/>terrain, powerups"]
  end
  subgraph modes["tour/, wardrobe/, tricks/, daily/, challenge/ (pure data and rules)"]
    stages[tour: stages, rivals, progress, save]
    items[wardrobe: items, unlocks]
    tricks[tricks: puzzle, packs, judge, progress, validate]
    daily[daily: daily, book]
    challenge[challenge: link, challenge]
  end
  subgraph game["game/"]
    session[session.ts]
    shots[shot-session.ts]
    plays["trick-play.ts,<br/>challenge-play.ts"]
    setup[setup.ts]
    soclose[so-close.ts]
    reporter[pass-reporter.ts]
    playback[playback.ts]
    input["aim, typed-entry,<br/>controls, aim-guide"]
    title[title-show.ts]
  end
  subgraph render["render/"]
    scene[scene.ts]
    kits[kits.ts]
    city[city.ts]
    backdrop[backdrop.ts]
    hazards[hazards.ts]
    gorilla[gorilla.ts]
    outfit[outfit.ts]
    effects[effects.ts]
    targetart[targets.ts]
    menuart["preview, city-preview, twist-diagram,<br/>tour-map-art, wardrobe-art"]
  end
  subgraph ui["ui/"]
    hud[hud.ts]
    screens["title, tour map, stage card, results,<br/>trick map, puzzle card, trick panel,<br/>daily screen and results, challenge screens,<br/>wardrobe, badges, Quick Match, Settings, overlays"]
  end
  main[main.ts] --> session
  main --> plays
  main --> setup
  main --> screens
  main --> stages
  main --> daily
  main --> challenge
  main --> reporter
  main --> pass["@shared/pass"]
  setup --> stages
  setup --> daily
  setup --> kits
  session --> match
  session --> ai
  session --> soclose
  session --> playback
  session --> input
  session --> scene
  session --> hud
  plays --> shots
  plays --> tricks
  plays --> challenge
  shots --> match
  shots --> playback
  shots --> scene
  tricks --> match
  daily --> match
  daily --> shareddaily["@shared/daily"]
  challenge --> tricks
  challenge --> daily
  challenge --> version
  match --> twists
  match --> shot
  match --> skyline
  shot --> twists
  shot --> targets
  shot --> exact
  stages --> items
  reporter --> pass
  scene --> targetart
  scene --> city
  scene --> backdrop
  scene --> hazards
  scene --> gorilla
  scene --> effects
  city --> kits
  backdrop --> kits
  gorilla --> outfit
  screens --> menuart
  menuart --> gorilla
```

## Folder tree

```
ports/skyline-showdown/
├── index.html              page shell; the game mounts into #game
├── favicon.svg             code-drawn icon
├── pass.manifest.ts        badges, Pass-unlocked cosmetics and stats for the Arcade Pass
├── playwright.config.ts    browser tests for this port (smoke, determinism-*, screens, playtest)
├── README.md
├── docs/                   ABOUT, HOW-TO-PLAY, this file
├── media/                  screenshots used by the docs and the Hall
├── dev/puzzles/            the Puzzle Lab: dev server only, never built
│   ├── index.html, lab.ts, lab.css   a puzzle in the real renderer, its problems and solution map
│   └── solution-map.ts     every aimable throw tried and sorted: miss, solve, stylish solve, self-hit
├── e2e/
│   ├── helpers.ts          fake-clock stepping (on any date), mirrored matches, throw search
│   ├── game.spec.ts        smoke: title, throws vs CPU, pause, typed win, balloon, settings, theme
│   ├── tour.spec.ts        smoke: map and card, a flawless Jakarta win, So close, wardrobe, badges, rivals in Quick Match
│   ├── modes.spec.ts       smoke: a puzzle solved after a retry, a daily played and resumed, challenge links
│   ├── engine.determinism.ts  the determinism probe in Chromium, Firefox and WebKit against Node
│   ├── determinism-probe.ts   engine trace, puzzle solutions, a year of dailies, challenge links
│   ├── art.screens.ts      screenshots of every state, world, city and viewport
│   ├── modes.screens.ts    Trick Shot, the daily and challenges, both themes, desktop and phone
│   ├── cpu.playtest.ts     full matches against every CPU level, checked against the rules
│   └── tour.playtest.ts    the whole World Tour played by a stand-in player, checked against the rules
├── test/
│   ├── fixtures.ts         hand-built cities for engine tests
│   └── tour-sim.ts         the stand-in "decent human" and the pacing model for tuning
└── src/
    ├── main.ts             wiring: screens, sessions, saves, challenge links, the Pass, the loop
    ├── settings.ts         settings, presets, validation, match options
    ├── theme.ts            light, dark or auto: stored, resolved, followed live
    ├── styles.css          HUD, menus and screens, as colour tokens for both themes
    ├── styles/modes.css    Trick Shot, the daily and challenges, on the same tokens
    ├── engine/
    │   ├── constants.ts    world size, step time, radii, the sun
    │   ├── exact-math.ts   sines, cosines and square roots from + − × ÷ only (ADR 0012)
    │   ├── worlds.ts       gravity and wind scale per world
    │   ├── skyline.ts      the city: slope patterns (and the tour's hillsides), hand-built cities, windows
    │   ├── wind.ts         the original's wind roll
    │   ├── gorillas.ts     placement, hitboxes, throwing hand, the offstage gorilla
    │   ├── terrain.ts      buildings minus craters and cuts; collision
    │   ├── powerups.ts     kinds, balloons and their drift
    │   ├── twists.ts       the World Tour's stage modifiers
    │   ├── targets.ts      Trick Shot's crates, bells and hoops
    │   ├── shot.ts         the throw simulation: segments, zones, collisions, events
    │   ├── match.ts        rounds, turns, scoring, twists between throws, solo rounds, rebuilt rounds
    │   ├── fingerprint.ts  a hash of seeded matches to the last bit
    │   ├── version.ts      the engine version, the rules of each, the pinned fingerprint
    │   └── ai.ts           the CPU opponent: levels and play styles
    ├── game/
    │   ├── session.ts      one match: phases, people, CPU, reactions, So close, replay, challenge offers
    │   ├── shot-session.ts one throw at a time from a fixed moment: puzzles and challenges
    │   ├── trick-play.ts   a puzzle visit: attempts judged, solves saved and reported
    │   ├── challenge-play.ts  a challenge: their shot, your throws, the verdict, a reply
    │   ├── play-context.ts what every mode's play needs from the page
    │   ├── setup.ts        a Quick Match, a tour stage or a daily as players, rules and scenery
    │   ├── so-close.ts     how close a miss came, and what to say about it
    │   ├── pass-reporter.ts  what the Arcade Pass hears: stats, badges, XP
    │   ├── playback.ts     plays a finished shot back in time
    │   ├── aim.ts, human-aim.ts, typed-entry.ts, controls.ts, aim-guide.ts
    │   ├── reactions.ts    what the city does at each shot event
    │   └── title-show.ts   the title screen's establishing shot
    ├── tricks/
    │   ├── puzzle.ts       the puzzle format and buildPuzzle
    │   ├── packs.ts        the four packs; packs/*.ts hold six puzzles each
    │   ├── judge.ts        solved or not, the rule, the style goal, how close
    │   ├── validate.ts     everything that can be wrong with a puzzle, the solution replayed
    │   ├── progress.ts     stars, pack gates, the Trick Shot save
    │   └── describe.ts     goals, rules and failures in words
    ├── daily/
    │   ├── daily.ts        the day's city from the UTC date, attempts, the share line
    │   └── book.ts         the day's result and the attempt in progress, kept honestly
    ├── challenge/
    │   ├── link.ts         the binary layout, base64url and checksum
    │   └── challenge.ts    a round rebuilt from a link, and both shots judged
    ├── tour/
    │   ├── stages.ts       four chapters, fifteen stages: data
    │   ├── rivals.ts       ten rivals: level, style, outfit, colour, lines
    │   ├── progress.ts     stars, unlocks, recording a result
    │   └── save.ts         the tour save, versioned with migrations
    ├── wardrobe/
    │   ├── items.ts        sixty items in eight slots, outfits
    │   └── unlocks.ts      what can be worn right now
    ├── render/
    │   ├── stage.ts        canvas, resize, post-processing
    │   ├── camera.ts       fit, follow, push-in, shake
    │   ├── scene.ts        one round's visuals in draw order
    │   ├── kits.ts         each city's kit: facades, tints, rooftops, silhouettes, horizon
    │   ├── city.ts         offscreen facades, windows, rooftops, carving
    │   ├── rooftop-props.ts  tanks, dishes, billboards, domes, solar panels, rods, gardens
    │   ├── backdrop.ts     sky, stars, parallax skylines and horizons, street
    │   ├── atmosphere.ts   clouds, smoke, flags, rain, fog, lightning
    │   ├── hazards.ts      the drone, jet stream, dust devil, lightning, springy roofs, heat haze
    │   ├── sky-body.ts     the mascot: Sun, Moon, Earth, Phobos, Io
    │   ├── gorilla.ts      vector gorillas, moods, dances, looks
    │   ├── outfit.ts       hats, glasses, neckwear, banana skins, trails
    │   ├── effects.ts      fire, sparks, debris, smoke, embers, explosion styles
    │   ├── palette.ts      colours per world, time of day and theme
    │   ├── targets.ts      crates, bells, hoops and landing pads, and how they react
    │   ├── city-preview.ts a still picture of a round, with throws drawn over it
    │   ├── preview.ts      a gorilla on its own rooftop, for the menus
    │   ├── twist-diagram.ts  the stage card's little animated diagrams
    │   ├── tour-map-art.ts the World Tour map
    │   └── wardrobe-art.ts item thumbnails and silhouettes
    ├── ui/
    │   ├── hud.ts          plates, wind, twist, throws, aim, typed panel, speech, So close, challenge offer
    │   ├── title-screen.ts the main menu, with the daily's reminder
    │   ├── tour-map.ts, stage-card.ts, results-screen.ts
    │   ├── trick-map.ts, puzzle-card.ts, trick-panel.ts   Trick Shot's packs, card, goals and solve card
    │   ├── daily-screen.ts, daily-results.ts   today's daily, the calendar, the results
    │   ├── challenge-screens.ts  making, receiving and judging challenges
    │   ├── share-box.ts    text to send: Copy and the share sheet
    │   ├── wardrobe-screen.ts, badges-screen.ts
    │   ├── settings-screen.ts  Quick Match
    │   ├── preferences-screen.ts  Settings
    │   ├── overlays.ts     pause, victory, rotate hint
    │   ├── form.ts         segmented choices, toggles, sliders
    │   ├── menu-nav.ts     gamepad and arrow keys in menus
    │   ├── dom.ts, icons.ts
    └── audio/sounds.ts     every sound patch and song
```

## Screens

```mermaid
stateDiagram-v2
  [*] --> title
  [*] --> intro: page opened on a #c= link
  title --> tour: World Tour
  title --> daily: Daily Skyline
  title --> tricks: Trick Shot
  title --> quick: Quick Match
  title --> wardrobe
  title --> badges
  title --> settings
  tour --> card: choose a stop
  card --> tour: Map
  card --> match: Play
  quick --> match: Start match
  daily --> match: Play today's (or Continue, or Practice)
  tricks --> puzzlecard: choose a puzzle
  puzzlecard --> puzzle: Play
  puzzle --> solved: solved
  solved --> puzzle: Try again or Next puzzle
  solved --> tricks: Packs
  intro --> challenge: Watch their shot
  challenge --> verdict: your throw lands
  verdict --> challenge: Try again
  verdict --> maker: Send a reply
  match --> results: tour stage over
  match --> victory: Quick Match over
  match --> dailyresults: daily over
  match --> maker: Challenge a friend (during a replay)
  dailyresults --> match: Practice
  dailyresults --> daily: Daily
  solved --> maker: Challenge a friend
  results --> card: Next stop
  results --> match: Retry
  results --> tour: Map
  victory --> match: Rematch
  victory --> quick: Match settings
  match --> pause: Esc
  pause --> match: Resume
  wardrobe --> title
  badges --> title
  settings --> title
  tour --> title
  quick --> title
  daily --> title
  tricks --> title
```

`main.ts` owns the screens. The title city keeps playing behind every menu
except the map, which covers the page, so the city rests while it is open.
A challenge link in the address (`#c=…`) is read when the page opens, and
again if one is pasted into a tab that already has the game.

## The loop and the match state machine

`main.ts` runs `@shared/loop` at a fixed 60 steps a second. Each step
updates the menus and either what is being played (a `Session` for a
match or a daily, a `ShotSession` for a puzzle or a challenge), or the
title show and whichever animated screen is open (map, stage card,
wardrobe preview). Each display frame renders the stage once.

```mermaid
stateDiagram-v2
  [*] --> intro: round starts (new city, banner, a rival's hello)
  intro --> aim: 2 s
  aim --> throw: a person lets go or types Enter, or the CPU finishes its wind-up
  throw --> flight: banana leaves the hand (the engine resolves the whole shot)
  flight --> settle: miss (So close, then gust or lightning)
  settle --> aim: next player's turn
  flight --> impact: gorilla hit (slow motion, shake)
  impact --> replay: 1.5 s
  impact --> celebrate: reduced motion
  replay --> celebrate: replay ends or is skipped
  celebrate --> intro: next round
  celebrate --> over: match won or drawn
  over --> [*]
```

The whole throw is simulated the moment the banana leaves the hand
(`takeTurn` → `simulateShot`). The `ShotRecord` holds every banana's path
and every event, each stamped with its step. `ShotPlayback` walks that
record at `STEPS_PER_SECOND` and hands events to `reactTo`, which triggers
effects, sounds, carving and moods. Nothing on screen can change the
outcome. The instant replay plays the last 2.5 seconds of flight before the
hit (all of it for a short throw), so a slow lunar arc doesn't take half a
minute to replay.

```mermaid
sequenceDiagram
  participant Player
  participant Session
  participant Engine as match.ts / shot.ts
  participant Playback
  participant Scene
  participant HUD
  Player->>Session: release / Enter / CPU plan
  Session->>Engine: takeTurn(angle, velocity, power-up)
  Engine-->>Session: TurnResult (shot, scorer, hazards during the throw, between throws)
  Session->>Session: onThrow → PassReporter
  loop every frame
    Session->>Playback: advance(dt)
    Playback-->>Session: banana positions, events reached
    Session->>Scene: bananas, drone position, carve, explode, moods
  end
  alt miss
    Session->>HUD: So close: pin, distance, verdict, comment
    Session->>Scene: lightning strike, then the next mark
    Session->>HUD: a gust's new wind
  else hit
    Session->>Session: impact, replay, celebrate
  end
```

### One throw at a time: puzzles and challenges

`ShotSession` plays single throws from a fixed moment. The match it is
given is never changed: every throw is `previewTurn`, so a retry only puts
the scene back (craters, windows, targets, moods) and a player can retry
at once with R, the pad's X, or a tap once the miss has landed.

```mermaid
stateDiagram-v2
  [*] --> intro: banner (1.3 s)
  intro --> watch: a challenge: the challenger's shot plays
  watch --> aim: shot over (or skipped), scene put back, "Your turn"
  intro --> aim: a puzzle
  aim --> throw: let go, Space or Enter
  throw --> flight: previewTurn resolves the whole shot
  flight --> missed: judged a miss (distance, the rule it broke)
  missed --> aim: 1.4 s, or R / a tap
  flight --> waiting: solved (a puzzle) or judged (a challenge)
  waiting --> aim: Try again
  flight --> aim: R mid-flight
```

## Engine rules and formulas

- **World:** 640 × 350 units, y down, street at y = 335 (`constants.ts`).
- **Throw:** degrees measured from the thrower's side, mirrored for player 2
  (`worldAngle`). Velocity is rounded to a whole number, both clamped to
  0–360.
- **Flight:** each banana is a chain of ballistic segments. Within a
  segment, `x = x₀ + vx·τ + ½·p·τ²` and `y = y₀ + vy·τ + ½·g·τ²`, where
  τ = (step − segment start) × 0.1 and `p` is the sideways push: the wind
  over 5, or the air of a zone the banana is in (below). A bounce, a split,
  or crossing into or out of a zone starts a new segment from the current
  position and velocity, so paths stay continuous and exactly repeatable.
- **Checks per step:** off the sides (x ≤ 6 or x ≥ 634) or into the street
  (y ≥ 339) ends the throw as a miss. Above the top edge nothing is
  checked. Otherwise the path is walked in 2-unit hops, checking in order:
  sun (pass through, once), balloon (pass through, collect), the drone,
  Trick Shot targets (a crate or bell stops the banana and is spent; a
  hoop is flown through), each gorilla's three hitboxes, then terrain.
- **Exact arithmetic:** the launch and a Tri-Banana's split take their
  sines and cosines from `sinCosDegrees`, collision spacing its root from
  `squareRoot`, and distances that are only compared are compared squared
  (`exact-math.ts`, ADR 0012). Angles are kept to 0.01° and velocities to
  whole numbers (`normaliseThrow`), exactly what a challenge link carries.
- **Terrain:** solid = inside a building rectangle and outside every crater
  and cut (ADR 0003).
- **Explosion:** crater radius 7, or 14 for a Golden Banana. A golden blast
  that reaches the roof removes the roof section above it (±1.6 × radius
  wide), and hits any gorilla standing there or inside the blast.
- **Gorilla hit:** a 16-unit crater at its centre; the thrower scores, or
  the opponent does on a self-hit.
- **Fumble:** velocity below 2 drops the banana onto the thrower.
- **Balloon:** drifts `wind × 0.06` units per step (±0.12 when calm), only
  while a banana is in the air. A 30 % chance per turn when none is out.
- **Match:** `firstTo` ends at N; `total` ends when the scores add up to N,
  and a draw is possible. Turns alternate forever. Each round draws from its
  own seeded generator, so a city never depends on earlier throws, and
  `createRound(number, seed, options)` rebuilds any round from its seed.
- **Solo rounds:** with `solo`, the thrower keeps the turn and the other
  gorilla is a still target (the daily, Trick Shot's dummy); `throwLimit`
  ends the match undecided after that many throws without a point.
  `matchFromRound` starts a match from a round built elsewhere (a puzzle,
  a rebuilt challenge) with whoever's turn it was and what they held.

## Determinism and the engine version

A Daily Skyline and a challenge link must fly the same in every browser.
Engines disagree on the last bits of `Math.sin`, `cos` and `hypot` (Chromium
on about one sine in thirty; Firefox and WebKit on about a third of all `hypot`s), and
with the old engine every browser's matches drifted from Node's within a
few dozen steps. So the simulation keeps to exact arithmetic (above), a
test scans its files for anything else, and `e2e/engine.determinism.ts`
runs `determinism-probe.ts` (406 checks: seeded matches on every world and
twist, every puzzle's reference solution and verdict, 366 dailies, links of
every kind) in Chromium, Firefox and WebKit against Node, bit for bit
([ADR 0012](../../../docs/adr/0012-skyline-determinism.md)).

`engine/version.ts` records `ENGINE_VERSION`, the rules each version played
by, and `RULES_FINGERPRINT`, the engine fingerprint of today's rules, which
`version.test.ts` checks. A change that moves the fingerprint is a change
of rules: it needs a new version with new rules, and it changes today's
daily and retires older links ([ADR 0014](../../../docs/adr/0014-skyline-challenge-links.md)).

## The stage-modifier model

A World Tour stage is data (`tour/stages.ts`): a city, its world, its kit,
a list of **twists**, a rival, points, a throw budget and a light. The
engine interprets the twists (`engine/twists.ts`) at four fixed points of a
match; nothing else in the game knows how a twist works. The reasons are in
[ADR 0007](../../../docs/adr/0007-stage-modifiers.md).

```mermaid
flowchart LR
  stage["Stage data<br/>twists: drone, gusts…"] --> options["MatchOptions.twists"]
  options --> round["createRound<br/>hillside slope · supertall tower<br/>hazardsFor · first lightning mark"]
  round --> shot["simulateShot<br/>airAt zones · drone stops bananas<br/>springy ground bounces"]
  shot --> between["playBetweenThrows<br/>drone travels · dust devil wanders<br/>gust shifts wind · lightning strikes"]
  between --> shot
  round --> view["render/hazards.ts<br/>draws exactly that data"]
  between --> view
```

| Twist | Rule |
|---|---|
| `gusts` | After every throw that doesn't end the round, the wind shifts by 2–5 notches either way (× the world's wind scale), staying within the rolled range. |
| `drone` | A 26 × 11 body on a rail between the gorillas (45 units clear of each), flying 16 units clear of the roofs beneath it wherever that fits below y = 48. It moves back and forth only while a banana flies (1/140 of its round trip per step, triangle wave), and carries on from there next throw. A banana touching it stops, without harming the city. |
| `supertall` | The building nearest the middle rises to 48–56 units from the top. |
| `jetStream` | A band from y 28 to 72 with its own wind of 11–15 (× the world's wind scale, at least half), either way, which replaces the ground wind inside it. |
| `hiddenWind` | Physics unchanged; the HUD hides the gauge and the CPU reads 40 % of the wind. |
| `hillside` | A steep slope, rising or falling (24 units a building), so the gorillas stand far apart in height. |
| `bouncy` | Every banana bounces once off the first building it hits (on top of a Bouncer's bounce). |
| `dustDevil` | A column 34 wide from the street up to y 70 that adds a push of 2.6–3.4 either way inside it. It wanders up to 36 units between throws, staying between the gorillas. |
| `lightning` | A roof is marked a throw ahead, never a gorilla's or one next to it. After a throw that doesn't end the round it's struck, leaving an 18-unit bowl, and the next roof is marked. |

Everything is rolled from the round's generator *after* what a twist-less
round rolls, so Quick Match cities (and old `?seed=` links) are unchanged.

## Rival styles

A rival is a CPU level plus a play style (`engine/ai.ts`, [ADR 0008](../../../docs/adr/0008-rival-styles.md)).
The style shifts how the level plays: a favourite angle and its spread, a
correction multiplier (over 1 overshoots and swings back), a rattle that
widens the hand shake with every point against it, and a wind-sense
multiplier. `DEFAULT_STYLE` is the Quick Match CPU, unchanged.

| Rival | Level (Quick Match) | Style | Tour stops (level there) |
|---|---|---|---|
| Drizzle | Easy | lobs at 58°, slow to correct | Jakarta, Tranquility Flats (Normal) |
| Glitch | Easy | flat at 32°, keen on the wind | Tokyo, Dust Basin (Normal) |
| Summit | Normal | sky-high 68°, creeps | Dubai, Storm Harbor |
| Mirage | Easy | tight spread, careful, little wind | Cairo, Red Canyon (Hard) |
| Tempo | Easy | overcorrects ×1.7 | Rio, Copernicus Rim (Normal) |
| The Landlord | Normal | rattle 0.9 | New York |
| Orbit | Hard | lobs at 62°, patient | Earthrise Heights |
| Rust | Normal | flat at 34°, overshoots ×1.25 | Olympus Summit |
| Thunder | Hard | pushes ×1.1, reads storms | Red Spot Ring |
| Colossus | Brutal | adapts, rattle 0.35 | The Eye |

Two AI rules came with the tour: a **hidden wind** is read at 40 %, and
after a **gust** the CPU corrects from its last throw allowing for the
change (it estimates the new wind's extra push over the last flight time)
instead of starting over.

## Trick Shot

A puzzle is data (`tricks/puzzle.ts`), one small typed file per pack in
`tricks/packs/`. `buildPuzzle` turns it into an ordinary round, so a
puzzle flies by exactly the rules of a match.

```mermaid
classDiagram
  class Pack {
    id, name
    idea: the one thing it teaches
    blurb, colour
    puzzles: 6 × Puzzle
  }
  class Puzzle {
    id, name, brief, hint
    world, wind
    city: CitySpec
    stand: building, facing
    targets: TargetSpec[]
    rule?: sun | bounceTwice | allBananas
    powerUp?: golden | tri | calm | bouncer
    hazards?: drone, jetStream, dustDevil, bouncy
    par: attempts for star 2
    style: StyleGoal (star 3)
    solution: angle, velocity
    timeOfDay?
  }
  class CitySpec {
    seed
    pattern? (rolled like a match)
    blocks? [width, height][] (built by hand)
  }
  class TargetSpec {
    dummy on a building
    crate / bell / pad on a building, along its roof
    hoop at x, y
  }
  class StyleGoal {
    bullseye within m
    sun · quick under s · sky · clean · bonk
  }
  class BuiltPuzzle {
    round: Round
    thrower
    targets: PlacedTarget[]
    start(): MatchState
  }
  Pack "1" *-- "6" Puzzle
  Puzzle *-- CitySpec
  Puzzle *-- TargetSpec
  Puzzle *-- StyleGoal
  Puzzle ..> BuiltPuzzle : buildPuzzle
```

- **Targets.** A dummy is the second gorilla, standing still. A crate or a
  bell is an engine target that stops the banana; a hoop is an engine
  target flown through; a pad is painted on a roof and is reached by a
  blast within 2 m of its middle. A puzzle with no dummy puts the second
  gorilla `OFFSTAGE`, out of reach and out of sight.
- **Judging** (`tricks/judge.ts`) reads the recorded shot: every target
  reached, then the rule (a sun event; two bounces; a Tri-Banana that
  split with every banana ending on a target), a self-hit failing first.
  The style goal counts only on a solving throw. Distances are compared
  squared, so the verdict is the same in every browser.
- **Stars and gates** (`tricks/progress.ts`): solve it; solve it within par
  attempts in one visit; meet the style goal. The best is kept. Pack 1 is
  open; each next pack opens once four puzzles of the one before are
  solved. The save is `neoarcade:skyline-showdown:tricks`, versioned and
  sanitised on load.
- **Validation** (`tricks/validate.ts`): text lengths, the city fitting,
  someone able to stand where they stand, targets on real roofs, rules that
  need a power-up having it, a style goal that suits the target, and last
  the stored **reference solution** replayed: it must be aimable (0–180°
  in tenths, power 1–200) and solve the puzzle with style.
  `tricks.test.ts` runs this on all 24; the determinism probe replays them
  in every browser.
- **The Puzzle Lab** (`dev/puzzles/`, at
  `/ports/skyline-showdown/dev/puzzles/` on the dev server only) shows a
  puzzle in the real renderer with its reference path, the validator's
  complaints, and the solution map: every throw a player could aim, tried,
  as solves, stylish solves and self-hits. Click the map to see a throw.
  The share of the grid that solves is how hard a puzzle is.

## The Daily Skyline

```mermaid
flowchart LR
  date["UTC date<br/>2026-10-14"] --> daily["@shared/daily<br/>number: 16<br/>seed: FNV-1a('skyline-showdown:2026-10-14')"]
  daily --> rng["createRng(seed)"]
  rng --> world["world<br/>Earth · Moon · Mars · Jupiter"]
  rng --> twist["one light twist<br/>allowed on that world"]
  rng --> roundseed["round seed"]
  roundseed --> round["createRound(1, round seed)<br/>city · wind · gorillas · hazards"]
  world --> round
  twist --> round
  round --> match["solo match<br/>throwLimit 10, no power-ups"]
  match --> attempt["the scored attempt<br/>every throw kept in daily-run"]
  attempt --> log["daily log: one result a day<br/>streaks · calendar"]
  attempt --> share["share line<br/>no angles, no powers"]
```

The day's city comes from the date alone, so everyone on Earth gets the
same one; the page shows the next one's arrival in local time
([ADR 0013](../../../docs/adr/0013-skyline-daily-seeding.md)). Daily #1 is
2026-09-29. The daily plays as an ordinary `Session` with a daily setup:
the target never throws, the HUD counts throws out of ten, aim assist is
off. `DailyBook` keeps the day's result in the shared daily log and the
throws of an unfinished attempt under `daily-run`; coming back replays them
(`resumeDaily`), so the scored attempt can be left but never restarted.
After it, practice runs are unlimited, not recorded, and can make
challenge links. The results screen redraws every throw of the attempt
over a still picture of the city (`render/city-preview.ts`).

## Challenge links

```mermaid
flowchart LR
  hit["a person's hit, replaying<br/>(or a solve, or your challenge throw)"] --> draft["Challenge<br/>version · source · wind · throws · nickname?"]
  draft --> bytes["bytes: version · kind and flags<br/>source fields · wind · throws<br/>[nickname] · FNV-1a checksum"]
  bytes --> text["base64url after #c="]
  text --> friend["friend opens the link"]
  friend --> decode["decode: characters, checksum,<br/>every field, nothing left over"]
  decode --> version{"engine version"}
  version -->|"same rules"| rebuild["challengeStart(source)<br/>then every earlier throw again"]
  version -->|"other rules or newer"| kind["a kind explanation"]
  rebuild --> check{"wind as the link says?"}
  check -->|"no"| kind
  check -->|"yes"| watch["their shot plays"]
  watch --> yours["your throw from the same moment"]
  yours --> judge["matched · beaten · lost<br/>copycat within 1.5 units"]
  judge --> reply["a reply link"]
```

`challenge/link.ts` packs a challenge into bytes and back; `challenge.ts`
rebuilds the round and judges. Sources: a Quick Match round (seed, round,
world choice, power-ups, who threw first, what each side held), a tour
stage round, a Trick Shot puzzle, or a daily's practice. Every earlier
throw of the round is thrown again, so craters, gusts, the drone and
balloons are exactly as the challenger found them. Both shots are previews
of that moment. The layout, the checks and the version rules are in
[ADR 0014](../../../docs/adr/0014-skyline-challenge-links.md). A nickname
travels only if typed into the challenge maker.

## World Tour progress and saves

`tour/progress.ts` is pure. `starsFor` turns a result into stars (win;
within the throw budget; never hit; aim assist caps at one).
`recordStage` folds a result into the save, keeping the best, and reports
what changed: new stars, a first win, a rival's first defeat, chapters
opened, the tour complete. A stage opens when the one before it in its
chapter is won; a chapter opens with its star total and the previous boss
beaten.

The tour's own save lives at `neoarcade:skyline-showdown:tour`, apart from
the Arcade Pass:

```mermaid
flowchart LR
  raw[("localStorage<br/>neoarcade:skyline-showdown:tour")] --> load["loadTour"]
  load -->|"older version"| steps["TOUR_MIGRATIONS<br/>n → n + 1, in order"]
  steps --> sanitise
  load -->|"current"| sanitise["sanitise: field by field,<br/>unknown stages, rivals and items dropped"]
  load -->|"unreadable or newer"| fresh["emptyTour()<br/>(a newer save is left on disk)"]
  sanitise --> save["TourSave v1<br/>stages, rivalsBeaten, outfits"]
  save --> main["main.ts"]
  main -->|"recordStage · wardrobe change"| raw
```

| Field | Meaning |
|---|---|
| `version` | 1. Bump `TOUR_VERSION` and add a step to `TOUR_MIGRATIONS` when the shape changes. |
| `stages[id]` | `{ stars, won, bestThrows, plays }` for every stage played. |
| `rivalsBeaten` | Rival ids, in roster order. |
| `outfits` | Player 1's and player 2's outfits: one item id per slot. |

What can be *worn* is decided when a match starts (`wearableOutfit`): an
item that is no longer unlocked (after a Pass reset, say) falls back to
that slot's default without touching the save.

## Arcade Pass

The port reports to the Arcade Pass through `game/pass-reporter.ts`
(`docs/ARCADE-PASS.md` explains the Pass itself). `main.ts` calls
`openArcadePass().forGame(manifest)` once, mounts the shared unlock toasts,
and creates a `PassReporter` for each match player 1 plays (a daily too);
a CPU-only match reports nothing, and player 2 is always a guest. The new
modes report through three functions: `reportDaily` when a scored daily
ends, `reportSolve` from `TrickPlay` on every solve, and `reportChallenge`
from `ChallengePlay` on every verdict. Puzzle and challenge throws are
previews and count towards no throw stats.

```mermaid
flowchart LR
  session["Session"] -- "onThrow(result, round)" --> reporter["PassReporter"]
  main["main.ts"] -- "matchOver · stageRecorded" --> reporter
  main -- "reportDaily (scored daily over)" --> pass
  trick["TrickPlay"] -- "reportSolve" --> pass
  challenge["ChallengePlay"] -- "reportChallenge" --> pass
  wardrobe["Wardrobe"] -- "reportWardrobeChange" --> pass
  reporter -- "stat · progress · unlock · award" --> pass["GamePass<br/>(pass.manifest.ts)"]
  pass -- "badge / level events" --> toasts["unlock toasts"]
  session -- "turn starts: hold" --> toasts
  session -- "point scored: flush" --> toasts
  main -- "results, victory, menus: flush" --> toasts
  pass -- "isUnlocked(item)" --> unlocks["wardrobe unlocks"]
```

| XP | For |
|---|---|
| 10 | playing a match to the end |
| 30 | winning a Quick Match |
| 40 (60 for a boss) | winning a tour stage |
| 15 | each new star |
| 100 | a rival's first defeat |
| 20, and 30 more for a hit | a scored Daily Skyline |
| 20 | a Trick Shot puzzle solved for the first time |
| 10 | each new Trick Shot star |
| 25 | winning a challenge (the first win on each link) |

Badges pay their tier's XP; the Pass's daily cap applies to everything.
The **stats** on the profile: matches played and won, rounds won, direct
hits, bananas thrown and craters carved (counted in `throwMade`), longest
hit in metres (a maximum), sun hits, and tour stars and rivals beaten (set
from the save in `stageRecorded`); dailies played and the best daily
streak (`reportDaily`), puzzles solved and Trick Shot stars (`reportSolve`),
and challenges won (`reportChallenge`).

Where each badge is earned (all in `PassReporter`, for the Pass's owner):

| Badge | Tier | Where | When |
|---|---|---|---|
| First Banana | bronze | `countPoint` | the owner scores a point |
| Hat Trick | bronze | `countPoint` | three points in a row in one match |
| Sharpshooter | bronze | `hitLanded` | a hit with the owner's first throw of a round |
| Tri-Hard | bronze | `hitLanded` | a hit with a Tri-Banana |
| Calm Before the Storm | bronze | `hitLanded` | a hit thrown under Calm Air |
| Dressed to Impress | bronze | `reportWardrobeChange` | anything changed in the wardrobe |
| Early Bird | bronze | `reportDaily` | a scored daily played to the end |
| Matched! | bronze | `reportChallenge` | a challenge matched or beaten |
| Singing in the Rain | bronze | `stageRecorded` | Jakarta won |
| Old Friends | bronze | `matchOver` | a Quick Match won against a rival already beaten on the tour |
| Sunburn | silver, counted to 10 | `throwMade` | every banana through the sun |
| Demolition | silver, counted to 100 | `throwMade` | every crater carved |
| Moonshot | silver | `hitLanded` | a first-throw hit on the Moon |
| Uphill Battle | silver | `hitLanded` | a hit on a gorilla standing 5 m or more higher |
| Long Distance | silver | `hitLanded` | a hit from 32 m or more away |
| Bank Shot | silver | `hitLanded` | a hit by a banana that bounced |
| Comeback Kid | silver | `matchOver` | a win after trailing by two points |
| Drone Whisperer | silver | `stageRecorded` | Tokyo won without the drone catching one of the owner's bananas |
| Globetrotter | silver | `stageRecorded` | New York won |
| Eviction Notice | silver | `stageRecorded` | New York won without being hit |
| Red Planet Regular | silver | `stageRecorded` | Olympus Summit won |
| On a Roll | silver | `reportDaily` | a daily streak of seven days |
| Hole in One | gold | `reportDaily` | a scored daily hit with the first banana |
| Puzzle Master | gold | `reportSolve` | all 24 puzzles solved |
| Show-off | gold | `reportSolve` | all 72 Trick Shot stars |
| Rival Collector | gold | `stageRecorded` | all ten rivals beaten |
| Three-Star General | gold | `stageRecorded` | all 45 stars |
| Eye of the Storm | gold | `stageRecorded` | The Eye won |
| Brutal Honesty | gold | `matchOver` | a Quick Match won against the plain Brutal CPU |
| Untouchable | gold | `stageRecorded` | any boss stage won without being hit |
| Oops | secret | `throwMade` | the owner hits themselves |
| Butterfingers | secret | `throwMade` | the owner fumbles a banana onto their own head |
| Total Eclipse | secret | `hitLanded` | a hit by a banana that went through the sun |
| Drone Delivery | secret | `throwMade` | three bananas fed to the drone in one match |
| Copycat | secret | `reportChallenge` | a challenge throw that comes down where the challenger's did |

Badge and level wardrobe items are listed in the manifest's `cosmetics`
(the rest unlock from stars and rivals in the game's own save), and
`wardrobe.test.ts` checks they match `wardrobe/items.ts` exactly.

Toasts are held (`hold()`) whenever a turn starts (a puzzle attempt and a
challenge throw included), so nothing covers the playfield while someone
aims; they are flushed when a point is scored, on the results, victory,
daily results, solve and challenge verdict screens, and on every menu
screen.

## "So close!"

`game/so-close.ts` judges a miss the way the CPU judges its own: where the
arc was heading at the target's height (`landingX`). The distance is the
nearest the banana came to the target, less half a gorilla, at
`METRES_PER_UNIT = 2 / 30` (a gorilla is 2 m tall). The verdict is
**blocked** when a building or the drone stopped an arc that was heading
within 30 units of the target and would have gone 40 further, **over** when
it passed above the target's head and would have landed beyond it, and
**short** or **long** otherwise. `commentFor` picks a line from the pool for
the verdict and distance, never the previous one. The session shows people
the full callout and the CPU just the pin and label, and fades it when the
next turn starts.

## Rendering pipeline

1. `Stage` owns a Canvas 2D *scene canvas* at device resolution, and a
   `@shared/fx` post-process (bloom, vignette, per-palette colour grading,
   optional CRT) whose output canvas is what is on screen.
2. `Camera` maps the world so it fits the screen with the street at the
   bottom, adding follow, push-in and shake.
3. `Scene.draw` paints back to front: sky gradient and stars → sky body →
   far lightning → far skyline and horizon (parallax ×0.6) → clouds →
   middle skyline (×0.3) → fog → jet stream → **the city canvas** →
   embers → rooftop life → street → heat haze, springy roofs, dust devil,
   lightning mark, drone and bolt → ghost trail → balloon → gorillas → turn
   marker → aim guide → aim line → bananas and trails → effects → rain.
4. Static layers (city, both skylines, cloud sprites) are painted once per
   round and resolution into offscreen canvases. Per frame they cost one
   `drawImage` each.
5. **Kits.** A tour city is painted from its kit (`render/kits.ts`): its
   facade styles, the hues its facades lean towards (keeping their
   lightness, so night stays night), its neon, its rooftop props, how often
   roofs carry antennas, chimneys and flags (Cairo has many, to read the
   hidden wind by), its distant silhouettes and its horizon (peaks,
   pyramids, dunes, mesas, crater rims). Quick Match uses `classicKit`,
   the look the game always had. A stage also fixes its time of day and
   weather.
6. **Looks.** Each gorilla gets a `GorillaLook` (fur, accent, outfit). The
   accent is the player's colour (orange, cyan) or a rival's own, and
   flows to the name plate, aim readout, guide, shield and toasts.
7. **Themes.** The dark theme uses the dusk, night and dawn palettes; the
   light theme swaps dusk and dawn for a `day` palette per world. `main.ts`
   sets `data-theme` on the page from the choice and the scene, light only
   while the city is lit. `styles.css` keeps every colour in tokens.

## Where every visual "asset" lives

| What | Code |
|---|---|
| Sky gradients, horizon glow, stars, Jupiter's bands and Red Spot | `render/backdrop.ts` (`drawSky`, `drawCloudBands`) |
| Distant skylines and horizons (towers, spires, domes, needles, minarets, deco, masts, houses; peaks, pyramids, dunes, mesas, crater rims) | `render/backdrop.ts` (`paintSkyline`, `paintSilhouette`, `paintHorizon`) |
| City kits | `render/kits.ts` |
| Playable buildings: facade styles, windows, neon signs | `render/city.ts` |
| Rooftop props: water towers, tanks, dishes, billboards, helipads, domes, solar panels, lightning rods, gardens | `render/rooftop-props.ts` |
| Crater scorch and holes, knocked-off roofs | `render/city.ts` (`carveCrater`, `knockOff`) |
| Clouds, chimney smoke, flags, antenna lights, rain, fog, far lightning | `render/atmosphere.ts` |
| The drone and its rail, jet stream, dust devil, lightning mark and bolt, springy roofs, heat haze | `render/hazards.ts` |
| The Sun, Moon, Earth, Phobos, Io and their faces | `render/sky-body.ts` |
| Gorillas: skeleton, moods, dances, faces, shield | `render/gorilla.ts` |
| Hats, glasses, bandana, scarf, bow, cape, medal; banana skins; trails | `render/outfit.ts` |
| Explosion styles (pixels, confetti, fireworks, stars, paint) | `render/effects.ts` (`flourish`) |
| Balloons and crates | `render/scene.ts` (`drawBalloon`, `POWER_UP_COLOURS`) |
| Trick Shot's crates, bells on their gallows, neon hoops and painted landing pads, splintering, ringing and lighting up | `render/targets.ts`, with splinters in `render/effects.ts` |
| The target reticle over a dummy or a daily's target | `render/scene.ts` (`drawTargetMarker`) |
| Still pictures of a round (puzzle card, daily card, daily results with every throw) | `render/city-preview.ts` |
| Crate, bell and hoop sounds | `audio/sounds.ts` |
| Fire, sparks, debris, smoke, fur, flashes, rings, embers | `render/effects.ts` |
| Palettes for 4 worlds × dusk, night, dawn and day | `render/palette.ts` |
| The World Tour map: globe, Moon, Mars, Jupiter, route | `render/tour-map-art.ts` |
| Rival portraits and the wardrobe preview | `render/preview.ts` |
| The stage card's twist diagrams | `render/twist-diagram.ts` |
| Wardrobe thumbnails and silhouettes | `render/wardrobe-art.ts` |
| Badge emblems (banana, skyline, drone) | `pass.manifest.ts`, drawn by `@shared/pass` |
| Post-processing (bloom, vignette, grading, CRT) | `@shared/fx`, set up in `render/stage.ts` |
| HUD, menus, icons | `ui/*.ts`, `styles.css`, `ui/icons.ts` |
| Sound effects, the theme, city hum, victory jingle | `audio/sounds.ts` (synth patches for `@shared/audio`) |

## How settings flow

```mermaid
flowchart LR
  storage[("localStorage<br/>neoarcade:skyline-showdown:settings")] --> sanitise[sanitiseSettings]
  sanitise --> quick[Quick Match screen]
  sanitise --> prefs[Settings screen]
  quick -->|Start match| saved[store.set] --> storage
  prefs -->|every change| saved
  quick --> qsetup[quickMatchSetup]
  stage[(stage data)] --> tsetup[tourSetup]
  sanitise --> tsetup
  tour[("tour save: outfits,<br/>rivals beaten")] --> qsetup
  tour --> tsetup
  qsetup --> session[Session]
  tsetup --> session
  theme[("localStorage<br/>neoarcade:skyline-showdown:theme")] <--> themePref[ThemePreference]
  themePref --> page[data-theme on the page]
  themePref --> session
  mix[("arcade-wide audio mix")] <--> quick
  mix <--> prefs
```

The same `Settings` object feeds every mode. Quick Match uses all of it;
the tour uses aiming, aim assist, player 1's name and the CRT filter, and
takes its rules, rival, kit, light and weather from the stage. The daily,
Trick Shot and challenges use the aiming method (and the daily player 1's
name); aim assist stays off there, because their results are compared
with other people's.

## Tests

| Layer | Where | What |
|---|---|---|
| Engine | `src/engine/*.test.ts` | Slope patterns and hillsides; the wind; placement; the closed-form path; determinism; collisions; carving; balloons; every power-up; targets; turns and scoring; solo rounds, throw limits and rebuilt rounds; CPU convergence at each level; every twist (`twists.test.ts`); every rival style (`ai-styles.test.ts`); exact maths and the scan for anything inexact (`exact-math.test.ts`); the pinned fingerprint (`version.test.ts`) |
| Trick Shot | `src/tricks/tricks.test.ts` | Four packs of six; every puzzle valid and its reference solution replayed; judging (targets, rules, the no-split loophole, self-hits); stars, par, pack gates, the save |
| Daily | `src/daily/daily.test.ts` | Same everywhere on a UTC date; numbering; the first 120 dailies each winnable in one throw; worlds and light twists; ten throws; resuming; the share line, and that it gives nothing away |
| Challenges | `src/challenge/challenge.test.ts` | Round trips for every source; length; no name unless typed; every single-character corruption caught; base64url; nicknames cleaned; rebuilding the very shot; damaged, older and newer links; matched, beaten, lost, copycat |
| Tour | `src/tour/*.test.ts` | The stage list and roster; stars; unlocks; recording results; the save and its migrations; **tuning** against the stand-in player |
| Wardrobe | `src/wardrobe/*.test.ts` | 40–60 items, free defaults, unlock rules, and the match with the Pass manifest |
| Game | `src/game/*.test.ts`, `src/settings.test.ts` | Playback (and joining late); aiming; typed input; So close; the Pass reporter against an in-memory Pass; match setups |
| Browser | `e2e/game.spec.ts`, `e2e/tour.spec.ts`, `e2e/modes.spec.ts` | Real flows against the production build, on a stepped fake clock |
| Determinism | `e2e/engine.determinism.ts` | The determinism probe in Chromium, Firefox and WebKit, line by line against Node |
| Screenshots | `e2e/art.screens.ts`, `e2e/modes.screens.ts` | Every state, world, tour city and viewport, and the new modes in both themes, reached by actually playing |
| Playtests | `e2e/cpu.playtest.ts`, `e2e/tour.playtest.ts` | Whole matches and the whole tour, with Node replaying the same match to check the page after every throw |

### Tuning the tour

`test/tour-sim.ts` is the stand-in player: the Normal CPU's judgement
typing exact numbers, against each stage's real rival, with the real engine,
making its calls in the page's order. Time is estimated from the session's
pacing plus 8 seconds of aiming per throw and 25 seconds of menus per stage.
`playTour` replays each stage until it's won and, when a gate needs more
stars, replays its weakest stage. On 120 seeds per city the decent player
wins Jakarta 88 %, Tokyo 79 %, Dubai 65 %, Cairo 87 %, Rio 66 % and New York
68 %; later stages sit between about 30 % (the final boss) and 75 %. A
journey takes a median of about 40 minutes for Earth (most between 27 and
55) and about 2½ hours for the whole tour. `tuning.test.ts` keeps it there:
every stage winnable, Earth's cities friendly, Earth in 25–50 minutes and
the tour in 1½–5 hours.

Run everything with `npm test`, then
`npx playwright test -c ports/skyline-showdown --project=smoke`
(or `screens`, or `playtest`), and
`npx playwright test -c ports/skyline-showdown --project='determinism-*'`
once Playwright's Firefox and WebKit are installed
(`npx playwright install firefox webkit`).

## How to extend

- **Add a puzzle.** Add it to its pack's file in `tricks/packs/` with a
  reference solution, then open the Puzzle Lab on the dev server to see it,
  read the validator and tune it against the solution map: the widest
  stylish run makes a comfortable solution, and the share of the grid
  that solves says how hard it is. `tricks.test.ts` must pass. Adding or
  changing a shipped puzzle changes what old links to it mean, so it is a
  rules change (below).
- **Add a pack.** Write `tricks/packs/<id>.ts` with six puzzles that teach
  one idea, add it to `PACKS`, and add its puzzles to the tests' count.
- **Add a target kind.** Add it to `engine/targets.ts` (its shape, whether
  it stops a banana), to `TargetSpec` and `placeTarget` in
  `tricks/puzzle.ts`, to `judge.ts`, and draw it in `render/targets.ts`.
- **Add a daily twist.** Add it to `LIGHT_TWISTS` (and `TWIST_WORDS`) in
  `daily/daily.ts`. That changes the dailies from the day it ships, so ship
  it between days as a rules change.
- **Change how bananas fly.** Do it with exact arithmetic only. If the
  fingerprint moves, add a version to `RULES_BY_VERSION` with new rules,
  bump `ENGINE_VERSION` and pin the new `RULES_FINGERPRINT`; run the
  determinism project in all three browsers.

- **Add a stage.** Add a record to `STAGES` in `tour/stages.ts` (id,
  chapter, city, kit, twists, the twist's name and sentence, rival, points,
  throw budget, light and weather) and its stop to `STOPS` in
  `render/tour-map-art.ts`. `tour.test.ts` checks the shape of the tour;
  run `tuning.test.ts` and adjust the budget until about half of the stand-in
  player's wins earn the budget star.
- **Add a twist.** Add a kind to `TwistKind` in `engine/twists.ts` and hook it
  in at one of the four points (city, round start, flight, between throws),
  with tests in `twists.test.ts`. Draw it in `render/hazards.ts` from the
  engine's data, and give it a diagram in `render/twist-diagram.ts`.
- **Add a rival.** Add them to `RIVALS` in `tour/rivals.ts`: a level, a
  style, a colour, an outfit from the wardrobe, and lines about what they do
  (never where they come from). Put them on a stage.
- **Add a city look.** Add a kit to `KITS` in `render/kits.ts`; new props go
  in `render/rooftop-props.ts`, new silhouettes and horizons in
  `render/backdrop.ts`.
- **Add a wardrobe item.** Add it to `WARDROBE` in `wardrobe/items.ts` and
  draw it in `render/outfit.ts` (or `effects.ts` for an explosion, a pose in
  `gorilla.ts` for a dance). If a badge or a level unlocks it, add it to
  the manifest's `cosmetics` too; the wardrobe test insists.
- **Add a badge.** Add it to `pass.manifest.ts` (the build checks the
  manifest) and award it from `PassReporter`, with a test in
  `pass-reporter.test.ts`.
- **Add a power-up.** Add a kind and its text in `engine/powerups.ts` and
  its effect in `engine/shot.ts`. Give it a colour in `render/scene.ts`, an
  icon in `ui/icons.ts`, and a line in HOW-TO-PLAY. Add an engine test.
- **Add a world.** Add it to `WORLDS` in `engine/worlds.ts`, palettes in
  `render/palette.ts`, a sky body in `render/sky-body.ts`, and weather rules
  in `rollWeather`.
- **Tweak the CPU.** Change `CPU_LEVELS` (`engine/ai.ts`), then run
  `npm test`: `ai.test.ts` keeps the levels in order, and the tuning test
  shows what it did to the tour.
- **Aim assist and the hidden aim guide.** Both come from `AimGuide`
  (`game/aim-guide.ts`), which asks `previewTurn`: the same simulation as
  `takeTurn`, without changing the match. Aim assist draws the first third
  (`ASSIST_SHARE`); the hidden guide (C, at any point of a match against
  the computer: a CPU or rival in Quick Match and on the tour, or the Daily
  Skyline's target; left out of the menus and the player's guide on purpose)
  draws it all. Either marks the
  match as assisted, which caps a tour stage at one star.
