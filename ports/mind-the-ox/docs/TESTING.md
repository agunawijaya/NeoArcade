# Testing Mind the Ox

Two ways to check the game: fly it yourself in a browser, and run the
automated tests. Run every command from the repository root. Examples are
for PowerShell; in bash, set environment variables with `NAME=value` before
the command instead of `$env:NAME = 'value'`.

## 1. Fly it

### Development server

```powershell
npm run dev
```

Open **http://localhost:5173/ports/mind-the-ox/**. The Hall is at
http://localhost:5173/hall/. Code changes reload the page as you save.

### The production build

To fly exactly what gets shipped, including the Mind the Ox card in the
Arcade Hall:

```powershell
npm run build
npm run preview
```

- The Hall: **http://localhost:4173/**
- The game: **http://localhost:4173/mind-the-ox/**

### On a phone

```powershell
npm run dev -- --host
```

Open the "Network" address it prints from a phone on the same Wi-Fi and add
`ports/mind-the-ox/` to the end. Turn the phone sideways: the on-screen
stick sits bottom left, the weapon buttons bottom right.

### Handy addresses

| Add to the address | What it does |
|---|---|
| `?seed=81` | The same battlefield every time, for Classic, Dogfight and Two players (the campaign's maps and the Daily Sortie's are fixed anyway). |
| `?pilot=bot` | Hands the first plane to the scripted pilot (`src/engine/bot.ts`): it takes off, bombs, fights and goes home by itself. Combine with a seed to watch a whole game the same way twice. |
| `?play=classic` | Starts Classic 1984 at once, as the Hall's Continue playing row does. |
| `?play=campaign`, `?play=at-sea`, `?play=sortie`, `?play=dogfight`, `?play=daily`, `?play=two-player` | Opens that mode's screen. |
| `?play=campaign&item=supply-road`, `?play=at-sea&item=the-raid` | Opens that chapter's or mission's briefing, as the Hall does for one left part way. |
| `?sortie=cbs1dn0-2n5` | Opens Custom Sortie with that sortie's choices and seed, as a shared link does. |

### What to try

- **Controls.** W and S (or ↑ and ↓) bring the nose up and down, D and A
  (or → and ←) open and close the throttle, F flips the plane over, Space
  fires, B drops a bomb, H flies home, Esc or P pauses, Tab switches the
  camera. Give an arrow another job in Settings: it should do only that
  job from then on. In Settings, pick the 1984
  key table: X and Z throttle, comma and slash the nose, full stop flips,
  Space guns, B bombs, H home. Rebind a key and check it sticks.
- **A first sortie.** Take off from your strip, bomb a target, fight the
  pilot who comes up, then fly home slowly, level and throttled back: the
  plane should roll to a stop and refuel (fuel, rounds, then a bomb every
  twenty moves). Try a nose-first landing too: it should crash.
- **Stall.** Climb steeply with the throttle closed until the plane stalls.
  It drops, tumbles every half second, and recovers once the nose points
  straight down and speed returns. Fly into the ceiling to stall there.
- **Birds and oxen.** Fly through a flock: it scatters into birds, and a
  bird in the face splats the goggles (dimmer at night). Shoot or fly into
  an ox: it costs 200 and you hear about it.
- **Cameras.** Switch between Side view and Diorama 3D from the pause menu
  or with Tab. The same planes, bullets and targets should be in view in
  both; the sun or moon should stay round at any window shape.
- **Themes.** Change the theme on the title card: Great War 1917, Cyan vs
  Magenta, Airshow. Targets, liveries, words and sounds change; the battle
  does not. Shot-down pilots bail out under parachutes in the first two; in
  the Airshow a tagged plane trails smoke and glides in.
- **Campaign.** Fly chapter 1 (the protected herd). Check the briefing, the
  stars on the results, and that chapter 2 opens. Each later chapter has its
  twist: crosswind, fog banks, the night raid with searchlights, the moving
  convoy, anti-aircraft guns, the ace, the final assault.
- **Dogfight.** One against one and one against three, at each level. Each
  rival has a name and a paint job; the Brutal one slides into your line of
  fire, flies round flocks and never flies into the mountains at the ends.
- **Classic 1984.** Sixteen headings, rounds that get faster until your last
  plane. Turn on the CGA picture in Settings: a black screen, a white line
  of ground, cyan and magenta planes.
- **Daily Sortie.** Fly today's battle, check the share text, the streak and
  the calendar. A second flight the same day is practice.
- **Two players.** Co-op and Versus. Player 1 has W A S D with Q flip, G
  guns, F bombs, E home; Player 2 the arrows with slash flip, full stop guns,
  comma bombs, M home. Two gamepads take one player each.
- **At Sea.** Fly Deck Trials: open the throttle on the deck (the deck
  crew's whistle), leave the bow, fly through both gates, then a
  touch-and-go: come in as to land with the throttle wide open, and the
  plane should run along the deck and off the bow (the paper says
  "Touch-and-go"). Then land back on: slow, shallow, throttle closed, hook
  down over the stripes at the stern. The wire should catch with a thud,
  the paper name the wire, and the plane roll to its spot. Try a fast landing
  (a bolter: full throttle, round again), a steep one (into the sea) and
  the autopilot, H, which should fly the circuit and land by itself.
  Ditch beside a destroyer: its boat should pick the pilot up.
- **Ships and torpedoes.** In Shipping Strike, press T on deck to carry a
  torpedo (the panel shows it), drop it low, level and slow: it should run
  true and hit, or be combed by a destroyer that turns end-on. Drop it
  high or steep: it should break up. One torpedo should sink a destroyer
  or cruiser outright; the battleship should be left holed at the
  waterline, burning, low in the water and down towards its hole, and go
  down to a second. Bomb a destroyer: a blackened burst where the bomb
  fell, fire, smoke, and a second bomb sinks it. Check the same marks in
  the diorama. Watch the flak bursts, a ship sinking and the strip map's
  ships.
- **Night at sea.** In Night Recovery the monitor's searchlight should
  sweep the sky from its foremast, and its gunners should find you only in
  the beam or close by. In the diorama, ships far out on the horizon show
  their masthead lights.
- **Raids and objectives.** In Intercept the paper on the panel should
  count the bombers in the air and the raids to come; Convoy Escort's the
  supply ships in. Lose the carrier in Intercept: the mission is lost.
- **Custom Sortie.** Pick every mission type once, change the sea, the
  hour and the difficulty, roll a new seed, copy the link, open it in a new
  tab: the same choices and the same code. Paste a code into the box and
  Load it. A broken code should say so and change nothing.
- **Settings at sea.** Landing assist (as the mission says, always, never):
  with it off, the wires are fewer and the deck heaves. What to carry: the
  briefing's suggestion, bombs or a torpedo.
- **The Secret Hangar.** On the title screen type `-x` (1984's hidden
  switch), or pat the ox on the title card five times within three seconds
  (on a phone held sideways the ox sits small in the card's corner). The
  hangar opens; switch on missiles (M) and starbursts (V) and
  try them: a missile chases the nearest enemy ahead, a starburst pulls a
  missile off your tail.
- **Arcade Pass.** Win a round (Into the Sun), splat a bird (Splat!), land
  with almost no fuel (Running on Fumes): each unlock shows a toast after
  the results, and the Hall's Pass page lists it. At sea: catch a wire
  (Trap!), bolter (Bolter), ditch beside a destroyer (Wet Feet), hit with a
  torpedo (Fish in the Water).
- **Reduced motion.** Turn on "reduce motion" in your system settings: the
  battle behind the title stays still, the menus appear without animation,
  and winning a round no longer pushes the camera in on the flight into the
  sun, in either view.

### Saved state

Everything is in localStorage, under keys that start with
`neoarcade:mind-the-ox:`:

| Key | Holds |
|---|---|
| `settings` | Every setting, the keys included |
| `theme` | Day, night or automatic |
| `progress` | Campaign and At Sea stars and bests, the Secret Hangar, Classic best, Dogfight wins |
| `daily` | Daily Sortie results, one per day |
| `paintJob` | The cosmetics fitted in the hangar |

Delete `daily` to fly today's sortie again as a scored flight; delete
everything to start from scratch. The Arcade Pass (XP, levels, badges) is
`neoarcade:pass:profile`, shared by every game in the arcade. To open every
chapter, paste this in the DevTools console and reload:

```js
const chapters = {};
for (const id of ['ox-pasture', 'westerly', 'pea-soup', 'lantern-raid', 'supply-road', 'archie', 'the-ace', 'final-push'])
  chapters[id] = { stars: [true, false, false], bestScore: 0 };
for (const id of ['deck-trials', 'coastal-strike', 'convoy-escort', 'shipping-strike', 'the-raid', 'intercept', 'night-recovery', 'carrier-duel'])
  chapters[id] = { stars: [true, false, false], bestScore: 0 };
localStorage.setItem(
  'neoarcade:mind-the-ox:progress',
  JSON.stringify({ version: 1, chapters, hangarFound: true, classicBest: 0, dogfightWins: {} }),
);
```

The second loop opens every At Sea mission as well.

## 2. Automated tests

| Command | What it checks | Time |
|---|---|---|
| `npm test` | Every unit test in the repository, Mind the Ox's among them (below) | About a minute |
| `npx playwright test -c ports/mind-the-ox --project=smoke --project=phone` | The page at desktop size and on a phone held sideways: every mode starts (At Sea and Custom Sortie among them), a shared sortie link, pause and the menu, the campaign's locks, two players' split screen, the Secret Hangar, rebinding a key | Under a minute |
| `npx playwright test -c ports/mind-the-ox --project='determinism-*'` | The engine flies the same seeded battles in Chromium, Firefox and WebKit as in Node, bit for bit | Under a minute |
| `npx playwright test -c ports/mind-the-ox --project=playtest` | The scripted pilot flies whole games in the real page (Daily Sortie, a Normal dogfight, campaign chapter 1, At Sea's Deck Trials), faster than real time; the page must end with the same score and result as the same flight in Node | A few minutes |
| `npx playwright test -c ports/mind-the-ox --project=screens` | Takes the screenshots in `media/` (see below) | About three minutes |
| `npm run lint` | ESLint and Prettier over the whole repository | Under a minute |
| `npm run docs:check` | Every Mermaid diagram in the docs renders | About a minute |

### The unit tests

All in `src/`, next to what they test, run by Vitest:

| File | Covers |
|---|---|
| `engine/flight.test.ts` | Take-off, classic and smooth steering, speed and gravity, stalls and the tumble, the novice, fuel, landing, crashing, falling |
| `engine/weapons.test.ts` | Guns, bombs and their arc, the locked secret weapons, missiles and starbursts, targets firing back round by round |
| `engine/collisions.test.ts` | Wounds and kills, your own bullets, mid-air collisions, wreckage, birds, flocks and oxen, target damage and healing, scoring planes |
| `engine/cpu.test.ts` | Computer pilots waiting on the ground, climbing out, firing only when a bullet would land, how often each level thinks, chasing, Brutal flying round a flock that Hard flies through |
| `engine/map.test.ts` | The battlefield generator over many seeds, its 1984 layout, the co-op, versus and dogfight layouts, hand-drawn maps and the fairness check |
| `engine/match.test.ts` | Round escalation, the flight into the sun and its bonus, the last plane, THE END, versus rounds |
| `engine/twists.test.ts` | The convoy, searchlights and night sight, fog, anti-aircraft guns, crosswind, ghosts, the match goals |
| `engine/trig.test.ts` | The heading tables, and a scan of the engine for functions browsers may round differently (`Math.sin`, `Math.pow` and friends) |
| `engine/fingerprint.test.ts` | The engine fingerprint the determinism test compares, and the three land battles exactly as recorded |
| `engine/sea.test.ts` | Water, splashes and ditching, rescue, ships patrolling, turning, sinking and paying, wounds and flooding, our planes passing our own ships, flak, searchlights, torpedoes (true runs, how many sink each class, breaking up, passing under, combing), raids, computer pilots off a carrier, sea maps and their checks |
| `engine/deck.test.ts` | Parking, launching (good and bad), traps, bolters, touch-and-goes, short and hard landings, the landing assist, the swell, a turning ship, the autopilot landing from anywhere and never touching and going |
| `engine/objectives.test.ts` | Gates in order, landing aboard last, a deck trial and its touch-and-go, intercepts, a convoy won and lost |
| `game/modes.test.ts` | How each mode sets up its match: Classic's 1984 rules, chapters at their round, Dogfight's goal, two-player seating, the Daily Sortie's fixed rules, every At Sea mission and sortie type, the landing assist and loadout, naval Dailies |
| `game/campaign.test.ts` | Eight chapters, three stars each, every theme's copy |
| `game/at-sea.test.ts` | Eight At Sea missions: every map fair, our carrier first, room to launch, briefings and goals in every theme |
| `game/sortie.test.ts` | The generator over 1,350 choices and seeds, all fair; the same choices and seed give the same sortie; mirroring; settling choices that cannot go together; codes there and back |
| `game/daily.test.ts` | Daily numbering and seeds, the share line, stored results, which days go to sea |
| `game/stats.test.ts` | The round tally behind badges and stars, the third wire and touch-and-goes among them |
| `game/pass-report.test.ts` | XP and every badge the game unlocks |
| `settings.test.ts` | Settings and progress: fallbacks, the default and 1984 key tables, rebinding, the arrows as spare keys alone with the modern layout, chapter unlocking |

`scripts/check-pass-manifests.test.ts` (part of `npm test`) checks
`pass.manifest.ts` against the Arcade Pass rules.

### How the browser tests work

- **The page is built on its own.** `dev/build-page.ts` builds the game
  exactly as `npm run build` does, but alone, into
  `node_modules/.cache/mind-the-ox-page/`, and Playwright serves it with
  `vite preview` on port 4178. Another port's unfinished work cannot stop
  these tests, and the build stays out of git and the linter. A server
  already running on 4178 is reused; stop it if it serves an old build.
- **The clock is fake.** `e2e/helpers.ts` installs Playwright's clock and
  keeps it paused: `openGame()` seeds storage (settings, progress, light),
  sets `?seed=` and `?pilot=bot` and opens the page; `advance()` moves time
  on; `runUntil()` runs it in slices until a `<body>` data attribute says
  so. The page publishes `data-screen`, `data-mode`, `data-phase`,
  `data-round`, and on the results `data-score` and `data-won`.
- **Determinism** bundles `src/engine/fingerprint.ts` with Vite and runs it
  in each browser: three seeded matches flown by the scripted pilot (a
  generated battlefield against three levels; the same ground under
  Classic rules against Brutal; a hand-drawn field with fog, a convoy,
  searchlights, anti-aircraft guns, wind and the secret weapons) and a
  fourth at sea (carriers, a battle squadron, torpedoes, a raid, a swell),
  every plane, shot, bird, target, ship, torpedo and raider sampled,
  folded into one string that must equal Node's. The Daily Sortie depends
  on it.
- **The playtest** prints each game's result (won or lost, seconds, score,
  targets left) for tuning.

### Firefox and WebKit

On this machine every Playwright browser lives in `E:\Applications\ms-playwright`:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'E:\Applications\ms-playwright'
npx playwright test -c ports/mind-the-ox --project='determinism-*'
Remove-Item Env:PLAYWRIGHT_BROWSERS_PATH
```

## 3. Pictures

### The screenshots in media/

`e2e/media.screens.ts` (the `screens` project) plays the real page with the
scripted pilot on the fake clock, so every run takes the same pictures: the
title, the campaign screen, the Daily Sortie, the Great War from the side
and in the diorama, the night raid, Cyan vs Magenta, the Airshow, Classic
1984 in CGA, two players and a phone. `e2e/sea.screens.ts` adds the At Sea
and Custom Sortie screens and six moments at sea (Deck Trials, Shipping
Strike in the diorama, Night Recovery, Cyan vs Magenta, the Airshow, a
night intercept). They are written straight into `media/`; check the diff
before keeping them.

### The art-direction matrix at sea

With `SEA_OUT=art`, `sea.screens.ts` flies every At Sea mission with the
scripted pilot instead and writes each to `dev/art/sea/`:

```powershell
$env:SEA_OUT = 'art'; $env:SEA_THEMES = 'great-war,cyan-magenta,airshow'; $env:SEA_SIZES = '1440x900,844x390'
npx playwright test -c ports/mind-the-ox --project=screens sea.screens
```

| Variable | Values | Default |
|---|---|---|
| `SEA_THEMES` | `great-war`, `cyan-magenta`, `airshow` | `great-war` |
| `SEA_MISSIONS` | the At Sea mission ids | all eight |
| `SEA_VIEWS` | `side`, `diorama` | both |
| `SEA_LIGHTS` | `day`, `night` | both |
| `SEA_SIZES` | `WIDTHxHEIGHT`, comma separated | `1280x720` |
| `SEA_MENUS` | `only`: just the At Sea, Custom Sortie and Settings screens | the menus and the missions |

### The art-direction stills

Staged moments, rendered by `dev/hero.html` on the development server
(`dev/playwright.config.ts` starts it on port 5291): a dogfight, a bombing
run with its crater, the flight into the sun, and the campaign's fog, night
raid, convoy and ox herd; and at sea a squadron launching at dawn, a
torpedo run on a battleship and a night landing in a swell.

```powershell
npx playwright test -c ports/mind-the-ox/dev
$env:HERO_THEMES = 'airshow'; $env:HERO_SCENES = 'bombing'; $env:HERO_SIZES = '844x390'
npx playwright test -c ports/mind-the-ox/dev
```

| Variable | Values | Default |
|---|---|---|
| `HERO_THEMES` | `great-war`, `cyan-magenta`, `airshow` | `great-war` |
| `HERO_SCENES` | `dogfight`, `bombing`, `sun`, `fog`, `night`, `convoy`, `herd`, `launch`, `torpedo`, `trap`, `aftermath` (a battle squadron after a strike), `deck-hit` (our carrier after a raid) | `dogfight,bombing,sun` |
| `HERO_VIEWS` | `side`, `diorama` | both |
| `HERO_LIGHTS` | `day`, `night` | both |
| `HERO_SIZES` | `WIDTHxHEIGHT`, comma separated | `1440x900` |

The Great War's dogfight, bombing, sun, launch, torpedo and trap at
1440 × 900 are the approved hero frames and go to `media/hero/`; everything else goes to `dev/art/`,
which git ignores.

## 4. Tuning scripts

Plain Node scripts in `dev/`, run with `npx tsx`. They fly the engine
without a browser, many times faster than real time.

- **`dev/duel-stats.ts`** pits the scripted pilot against each computer
  level in dogfights and prints how often it wins, how long a fight lasts
  and how every plane went down. `--seeds=40` sets the number of fights per
  level (12 by default), `--levels=hard,brutal` picks levels,
  `--fights=normal` sets the style the scripted pilot fights in (Hard by
  default; the same level as the computer makes a mirror match, which
  should come out near even), `--flight=classic` flies sixteen headings,
  `--three` makes it one against three, and
  `--set=brutal.trigger:0.8,hard.lead:12` changes a level's style for one
  run, for experiments. Compare runs of 100 fights or more: forty move a
  level's win rate by ten points either way.
- **`dev/fly-bot.ts`** flies the scripted pilot through the eight campaign
  chapters, or `--daily`, `--classic` or `--dogfight=normal` (with
  `--three`), and prints result, time, crashes, targets left, score and the
  causes of every loss. `--seeds=3` flies each several times, `--minutes=12`
  caps a game, `--flight=classic` flies sixteen headings, and `--endless`
  gives the pilot planes without end, to prove every target can be reached
  and destroyed.
- **`dev/trace-bot.ts ox-pasture 3600`** traces the scripted pilot through
  a chapter for that many ticks and prints the second before every crash it
  did not see coming (`--all` prints every tick).
- **`dev/sea-balance.ts`** flies the scripted pilot through every At Sea
  mission N times with different dice (`missions 8`), or N seeds of every
  Custom Sortie type (`sorties 6`), and prints result, time, score, planes
  lost, ditchings, traps, bolters, ships sunk and, for a loss, how it ended
  (out of planes, the ship it had to keep, the convoy, out of time) and
  what brought each plane down. `--level=normal` sets the sorties'
  difficulty, `--easy` puts green pilots in every enemy seat,
  `--fights=brutal` makes the scripted pilot fight like the best computer
  pilot, `--only=the-raid,intercept` picks missions or sortie types, and
  `--endless` gives the pilot as many planes as it needs: a mission it then
  still cannot finish is one nobody could (time is against it too, for a
  convoy or a carrier to keep), one it finishes only that way is one this
  pilot cannot finish with five. The scripted pilot is weak (it loses every
  chapter of the land campaign), so a mission it wins even once with five
  planes is one that can be won.
- **`dev/trace-sea.ts deck-trials`** (or a sortie code, `cbs1dn0-2n5`)
  follows the scripted pilot through one mission and prints every hit,
  ditching, wire, bolter and ship lost (`all` prints more).
- **`dev/landing-rates.ts`** lands the autopilot on a carrier forty times
  from seeded starts for every sea state, with and without the landing
  assist, at the first and third rounds' speeds, and prints the share
  trapped.

The numbers they gave, and what was tuned from them, are in
[ADR 0032](../../../docs/adr/0032-mind-the-ox-computer-pilots.md),
[ADR 0034](../../../docs/adr/0034-mind-the-ox-deck-model.md) and the
[diff log](../../../docs/games/mind-the-ox.md).

## A manual playtest

Before calling a change done, fly these by hand at least once:

1. Campaign chapter 1 in the Great War, side view: win it without touching
   an ox; check three stars are possible.
2. A Normal dogfight in the diorama: it should feel even. A Brutal one
   should feel sharp but beatable.
3. Classic 1984 with the 1984 keys and the CGA picture, through to round 2:
   the targets start firing back.
4. Today's Daily Sortie, then the share text and the calendar.
5. Two players, Versus, on one keyboard: both halves of the keyboard work
   at once and neither pauses the other.
6. On a phone held sideways: take off, bomb, land, pause, back to the Hall.
7. At Sea, Deck Trials, by hand with the assist on and then off: take off,
   both gates, a trap. Then Night Recovery: home by the deck lights.
8. A Custom Sortie from a friend's link, and today's Daily if it is a naval
   day (an anchor on the share line).

## When something fails

- Playwright keeps a trace of every failed test. Open it with the command
  it prints, `npx playwright show-trace <path to trace.zip>`, and step
  through the page frame by frame.
- "Executable doesn't exist" means Playwright cannot find a browser: set
  `PLAYWRIGHT_BROWSERS_PATH` as above, or install it with
  `npx playwright install <browser>`.
- If the determinism test fails in one browser only, look for a new
  floating-point function in the engine; `engine/trig.test.ts` should have
  caught it.
- If the playtest's page and Node disagree, the page dropped or doubled a
  tick, or input leaked into the scripted pilot's plane.
