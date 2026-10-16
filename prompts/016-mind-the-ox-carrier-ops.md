# 016 — Mind the Ox: Carrier Ops (the sea, ships, deck take-off and landing, naval missions)

Backlog item **MO-02**. Owner-requested; design agreed in the architect chat.

## Read first

1. `CLAUDE.md`, `BACKLOG.md` (MO-01, MO-02), `docs/ARCADE-PASS.md`.
2. Everything prompt 011 produced: `ports/mind-the-ox/docs/*` (ARCHITECTURE,
   HOW-TO-PLAY, TESTING, IDEAS), `docs/games/mind-the-ox.md`, ADRs 0026–0032.
3. Engine: `src/engine/world.ts`, `terrain.ts`, `map.ts`, `flight.ts`,
   `collisions.ts`, `weapons.ts`, `cpu.ts`, `autopilot.ts`, `convoy.ts`,
   `match.ts`, `rules.ts`, `scoring.ts`, `sight.ts`; `src/game/campaign.ts`,
   `modes.ts`, `session.ts`; `src/render/*`; `src/themes.ts`.
4. Run `git status` first. Keep any uncommitted work you find; never revert
   files you did not write in this session.

## Goal

Take Mind the Ox to sea. Planes take off from and land on an **aircraft
carrier**; the world gains **open water** and **ships**; and a new
**At Sea** campaign plus a **Custom Sortie** generator offer naval
missions: strikes on the coast, attacks on ships, dogfights against
enemies launching from land or from their own carrier, intercepting
bombers before they reach our carrier, and more.

History hook for ABOUT (state it carefully): in July 1918 Camel-type
scouts flew off HMS *Furious* to raid the Zeppelin sheds at Tondern; deck
landings were so dangerous then that pilots often ditched beside a
destroyer instead.

## Hard rules

- Same rules as 011: clean reimplementation, zero raster assets, engine
  pure/seeded/deterministic, light and dark, all three themes, both views.
- **Existing modes do not change.** Classic 1984, the current eight-chapter
  campaign, Dogfight, Two players and the Daily Sortie keep their rules and
  fingerprints unless a change is deliberate and recorded. Land maps stay
  land maps.

## 1. Engine additions

### The sea
- A map can contain **water segments** (open sea, harbour, coast with
  beaches and cliffs). Water has a surface height with gentle waves for
  rendering; the engine uses a flat sea level.
- Bombs hitting water make a splash (no crater); planes hitting water
  **ditch** (see below); debris sinks.

### Ships
- Ship types: **our carrier**, **enemy carrier**, battleship/cruiser,
  destroyer, supply ship, torpedo boat; in Great War also a coastal
  monitor; airships fly (Zeppelin — see bombers).
- Ships move along the sea at their own speed and heading, can turn
  around at the map edge or follow a script; each has hit points, damage
  states (smoke, fire, listing, sinking animation) and **anti-air guns**
  with a range and rate set by difficulty and campaign chapter.
- Torpedo boats can attack our carrier; destroyers rescue ditched pilots.

### Carrier deck
- The carrier is a **moving home base**: landing on its deck refuels and
  rearms gradually, like the land base.
- **Take-off:** the carrier steams into the wind; full throttle down a short
  deck; a slight sink after the bow; climb out. Taking off with too little
  speed or a bad angle ends in the water.
- **Landing:** approach from astern, match the ship's speed, keep the
  right descent and speed window, touch down on the deck where arresting
  wires catch the plane. The deck **pitches with the swell** at higher
  difficulty; crosswind matters. A wave-off/go-around is always possible.
  A hard or misaligned touchdown damages the plane (wounded state) or
  sends it over the side.
- **Landing assist** setting (on by default at Easy/Normal): a glide-path
  guide (deck lights / batsman cue), steady deck, wider wire window. Off at
  Hard/Brutal: pitching deck, narrower window, wind.
- A **heavily damaged carrier** cannot recover planes (deck fire, list);
  a **sunk** carrier means: in "defend the carrier" missions, the mission is
  lost; otherwise, ditch beside a destroyer.

### Ditching
- Landing on the water near a destroyer: the pilot is picked up (a small
  boat scene), the plane is lost (counts as a crash/life), the score
  records it. Far from any ship, a ditch is a normal crash.

### Weapons
- **Torpedo** (new): a loadout choice at take-off — bombs or one torpedo.
  Drop low and level within a speed window; the torpedo runs in the water
  and can miss, run under shallow targets, or be dodged by turning ships.
  Missiles and starbursts still come from the Secret Hangar.

### Enemies
- Enemy aircraft launch from **land airfields** on the coast or from an
  **enemy carrier** (sink it to stop reinforcements).
- **Bombers** (and Zeppelins in Great War) fly towards our carrier at
  altitude with escorts and defensive gunners; each bomber that reaches the
  carrier damages it.
- CPU pilots learn deck take-offs and landings (CPU planes from carriers
  must land too) with the same flight model.

## 2. Content

### At Sea campaign (about 8 missions, chapters with briefings and stars)

Suggested arc (refine freely):

1. **Deck Trials** — first take-off and landing in calm sea (tutorial).
2. **Coastal Strike** — bomb shore batteries and a supply depot, land back
   aboard.
3. **Convoy Escort** — protect supply ships from planes and torpedo boats.
4. **Shipping Strike** — bombs or torpedo against a battleship and its
   destroyer screen.
5. **The Raid** — a long-range strike on airship sheds (the Tondern nod).
6. **Intercept** — bombers and escorts heading for our carrier; stop them.
7. **Night Recovery** — return to the carrier at night by deck lights only,
   in a rising swell.
8. **Carrier Duel** — find and sink the enemy carrier while its fighters
   launch against you, then defend ours from its last strike.

Stars: complete; complete without losing a plane; style goal per mission
(e.g. land on the first approach, torpedo hit from long range).

### Custom Sortie (mission generator)

Player chooses: **base** (airfield or carrier), **mission type** (land
strike, anti-ship, dogfight vs land-based, dogfight vs carrier-based,
bomber intercept, convoy escort, defend the carrier, reconnaissance, night
landing), **enemy origin** (land, sea, both), sea state, time of day,
difficulty, theme. A seed builds the map, fleets and waves; validation
guarantees it is winnable (carrier reachable, wire window possible at that
sea state, enough fuel for the distances). Seeds are shareable as a link.
**Daily Sortie** may now pick a naval mission on some days (record the
change; past daily results stay valid).

### Themes

- **Great War 1917:** an early flush-deck carrier, dreadnoughts, coal smoke,
  Zeppelins, period dazzle camouflage on ships.
- **Cyan vs Magenta:** cartoon fleets in the two colours; pilots always fish
  themselves out with a cheerful splash.
- **Airshow:** carrier-landing contest (touch-and-go rings, spot landing),
  flour-bag drops on target barges, a race through buoy gates.

## 3. Views and art

- **Side view:** a living sea — swell, foam, ship wakes, reflections of sky
  and fires, sinking ships, splashes from near misses; the carrier deck
  readable at gameplay scale (landing lights, wires, island).
- **Diorama 3D:** fleets receding in depth, the carrier pitching, spray,
  torpedo wakes, searchlights at night.
- **Signature moments:** the first clean trap on a pitching deck at dusk;
  a torpedo wake reaching a battleship; the carrier turning into the wind
  as the squadron launches.
- Sound: sea and wind, ship horns, deck crew whistle, wire catch, AA bursts,
  torpedo splash, sinking groans.

## 4. Arcade Pass

Badges, e.g.: Trap! (first deck landing), Bolter (miss the wires and go
around), Wet Feet (ditch and get picked up), Fish in the Water (torpedo
hit), Night Owl at Sea (night deck landing), Tondern (finish The Raid),
Carrier Killer (sink the enemy carrier), Not On My Deck (stop every bomber
in an intercept).

## Hero-frame checkpoint (stop here)

After the sea, ships and deck physics work in one test map: render three
hero frames — a squadron launching from the carrier at dawn, a torpedo run
on a battleship, a night deck landing in swell — in both views and light
and dark, Great War theme. Critique at least five rounds, then **stop and
report** for the owner's approval.

## Workflow

1. Engine: water, ships, carrier deck, take-off/landing/ditching, torpedo,
   bombers; tests (deck physics windows, ditch rules, torpedo runs, ship
   damage, CPU deck operations, determinism in three browsers; existing
   fingerprints unchanged).
2. One test map + Side view → hero-frame checkpoint.
3. After approval: Diorama 3D, themes, At Sea campaign, Custom Sortie
   generator with validation, Daily integration, settings (landing
   assist, loadout), Pass, docs.
4. Art-direction loops (at least four) across missions, themes, views,
   light/dark, at 1440×900, 1280×720, 1024×768, 844×390.
5. Playtests with scripted pilots: landing success rates per difficulty
   (assist on/off), mission balance, generator winnability over many seeds.

## Deliverables

- Feature, tests green, lint clean, build passes.
- Docs updated: ABOUT (teaser + the 1918 history), HOW-TO-PLAY (deck
  take-off and landing step by step, torpedo technique, every mission
  type, Custom Sortie), ARCHITECTURE (water, ships, deck model, generator —
  Mermaid); `docs/games/mind-the-ox.md` diff log; new ADRs (sea and ships,
  deck model, mission generator); screenshots; `PORTS.md`; MO-02 in
  `BACKLOG.md`. No git commit.

## Suggested run

Opus 5.5, effort **xhigh**:
"Read prompts/016-mind-the-ox-carrier-ops.md and do it."
It stops at the hero-frame checkpoint; after approval: "Approved, continue."
