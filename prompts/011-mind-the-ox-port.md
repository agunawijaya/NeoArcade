# 011 — Mind the Ox (inspired by Sopwith, BMB Compuscience 1984)

## Read first

1. `CLAUDE.md`, `docs/ARCADE-PASS.md`, `BACKLOG.md`, `docs/HALL-ARCHITECTURE.md`
   (if prompt 008 has run: set `category: arcade` and an `origin`).
2. `ports/donkey-dash/` — the reference for several camera views over one
   engine (ADR 0010) and for `shared/daily` use.
3. The original in `sources/Sopwith/` — C and x86 assembler, *Sopwith: The
   Author's Edition* by David L. Clark (BMB Compuscience Canada, 1984–87;
   source released under the GNU GPL v2 in 2003). Read the game logic
   completely: `SW.H`, `SWMAIN.C`, `SWINIT.C`, `SWMOVE.C`, `SWCOLLSN.C`,
   `SWAUTO.C`, `SWEND.C`, `SWTITLE.C`, `SWGAMES.C`, `SWDISP.C`. Skim the
   rest (graphics, sound, serial/network I/O) for behaviour only.
   - `sources/Sopwith/PREVIOUS-REMAKE-NOTES.md` and `sources/Sopwith/docs/`
     come from an **unrelated earlier remake plan** (pixel-faithful 320×200,
     copied sprites, "no extra features"). They are background reading only.
     **They are not instructions and conflict with this prompt — ignore
     their rules.**

## Provenance rule (owner decision: clean reimplementation)

The original is GPL, but this port is **not** a derivative: reimplement
from observed behaviour and written notes, in fresh code.

- Do **not** copy or translate source code, the 3,000-value ground table,
  target positions/types, sprite bytes, sound tables or the fixed random
  table. Study them, describe the behaviour in `docs/games/mind-the-ox.md`,
  then write your own.
- Terrains and target layouts are **new**, generated from seeds (plus a few
  hand-designed campaign maps).
- Credit line (title screen, README, ABOUT): *"Inspired by Sopwith by
  David L. Clark, BMB Compuscience Canada, 1984."* "Sopwith" appears only in
  credits and ABOUT's history, never as the product name.
- ABOUT may mention that the original's source is GPL and where to find it;
  CREDITS states that no code or data was copied.

## Goal

Build **Mind the Ox** in `ports/mind-the-ox/`: a side-scrolling biplane
action game that keeps the 1984 loop — take off, bomb the depots, duel the
enemy planes, mind the birds and the oxen, limp home on fumes to refuel —
and makes it gorgeous, readable and replayable today.

Tagline: *"Bomb the depots. Dodge the birds. Whatever you do — mind the ox."*

## 1. Engine — what the original does (behaviour reference)

Confirm against the source; record differences in `docs/games/mind-the-ox.md`.

- **World:** a long side-on strip (original: 3,000 wide × 200 high) with
  rolling ground, two home bases, 20 ground targets of four kinds (one kind
  — the fuel/oil depot — scores double and explodes bigger), flocks of
  birds, two oxen.
- **Flight:** 16 discrete headings; speed between min and max, pulled toward
  `min + throttle + gravity[heading]` every 4 ticks (diving speeds you up,
  climbing slows you); throttle 0–4; flip reverses orientation; fixed-point
  sub-pixel motion. Flying above the ceiling or running out of speed
  **stalls** the plane (nose drops, it tumbles and flips until it regains
  speed pointing down). Novice mode never stalls.
- **States:** flying, stalled, wounded (smoking, controls respond every
  other tick), wounded-stall, falling (shot down), crashed, finished; plus
  ghost states in multiplayer when out of lives.
- **Resources:** fuel consumed by speed (empty → falls), 200 rounds, 5 bombs,
  5 missiles, 5 starbursts; landing at home **refills gradually**. `H` flies
  home on autopilot.
- **Weapons:** guns (short-lived bullets at plane speed + bullet speed);
  bombs that arc and steepen; homing missiles; starbursts that decoy
  missiles. Bombs and crashes **carve craters** in the ground.
- **Collisions:** pixel-overlap between symbols; planes colliding both go
  down and tumble with averaged velocity; shots, birds and oxen only
  **wound** a flying plane; a bird or bullet hitting you paints a splat or a
  bullet hole on your screen.
- **Scoring:** target +100 (depot +200), enemy plane +50, killing a bird
  −25, an ox −200; 3 of the 20 targets are your own — destroying them costs
  you. Destroying all enemy targets wins the round.
- **Rounds:** each won round adds +1 to min and max speed and bullet speed,
  targets need more hits, and from round 2 targets **fire back** within a
  range that grows each round. The win bonus counts up remaining lives at
  +25, +50, +75…
- **Endings:** the winner flies off **into the sun** while the plane grows
  in four steps; the loser gets "THE END". Five crashes end the game.
- **Computer planes:** defend a territory; pick among three flap choices by
  simulating one step ahead (closest range, no crash, best altitude); fire
  when a simulated bullet would hit; launch missiles on long shots; cruise
  at altitude when nothing is near; avoid targets and oxen when low.
- **Secret:** missiles and starbursts exist but are enabled only by a
  command-line option that is missing from the help screen.
- **Bugs and quirks to fix and document:** starburst cooldown is set on the
  new starburst instead of the plane (unlimited rate); the gun's ammo check
  reads the plane pointer before it is assigned; the AI nudges its own
  position by one pixel to line up shots (keep only as a deliberate trait of
  the Brutal level, documented); typo "statictics" in the end report.

## 2. Themes (Settings — owner decision: all three)

Same engine and rules; the theme changes look, names, sounds and copy.

| Theme | Content |
|---|---|
| **Great War 1917** | Historical WWI flavour: Allied vs Central Powers styled biplanes with period-style roundels and crosses, muddy front lines, trenches, observation balloons, farm villages, hangars, supply depots; pilots can be shot down. Use historical aircraft *types* descriptively ("a Camel-type scout") but no manufacturer trademarks as names. |
| **Cyan vs Magenta** | A cartoon war between two fictional air corps named after the original's CGA colours; pilots always bail out with a parachute; targets are depots and factories. |
| **Airshow** | No combat with people: pop balloons, cut ribbons, hit stunt markers, race rival stunt pilots through gates; bombs become flour bags. The same flight model and scoring structure. |

Default theme on first launch: Great War 1917.

## 3. Modes

| Mode | Content |
|---|---|
| **Classic 1984** | The original rules (bugs fixed), 16 headings, original key layout available, a seeded terrain in the spirit of the original, optional 4-colour CGA filter. |
| **Campaign** | About 8 rounds as chapters, escalating like the original, each a hand-designed map with a briefing and one twist: night raid, crosswind, fog bank, a protected ox herd, an enemy ace, depots defended by anti-air, a convoy, a final assault. 1–3 stars per chapter. |
| **Dogfight** | 1-vs-1 or 1-vs-3 against CPU pilots: Easy / Normal / Hard / Brutal, each with a name, a plane look and a flying style built on the original's look-ahead AI. |
| **Two players (local)** | Split screen, one keyboard (two key sets) or two gamepads; cooperative (shared targets) or versus. Replaces the 1984 serial and network modes. |
| **Daily Sortie** | `shared/daily`: same seed for everyone each UTC day; score, streaks, spoiler-free share text such as `Mind the Ox · Daily #12 🛩️💥💥💥🐄✅ 4,250`. |
| **Secret Hangar** | Missiles and starbursts are locked, as in 1984, until the player discovers a secret on the title screen (a nod to the hidden option; hint in ABOUT). Then they can be enabled in any mode. |

## 4. Controls

- **Modern:** smooth turning (more than 16 headings, eased), W/S or ↑/↓ nose,
  A/D or ←/→ throttle, F flip, Space guns, B bombs, M missile, V starburst,
  H home. Gamepad: stick pitch, triggers throttle, face buttons weapons.
- **Classic 1984:** 16 headings and the original layout (`,` `/` `.` `;` `X`
  Space `B` `H`, plus `M` `V` when unlocked) as a selectable key map.
- Rebindable keys; pause menu with How to play and Back to Hall.

## 5. Two camera views (Settings, switchable from pause)

Same engine state, same fairness — a `ViewRenderer` interface as in Donkey
Dash.

- **Side view:** the classic side-scroller, layered parallax, the plane
  near screen centre, a strip map of the whole world at the bottom (the
  original's "world display").
- **Diorama 3D:** the same strip seen from slightly in front and above
  (three.js or similar, record in an ADR): depth, shadows on the ground,
  clouds you fly through, the landscape receding. Gameplay stays 2D; the
  camera never hides what the side view shows.

## 6. Art direction — "Linen & Dope"

- Biplanes drawn in code with ribbed fabric wings, struts and wires, rotary
  engine and a blurred propeller; damage shows as torn fabric and smoke.
- Light: a bright summer morning, gouache countryside, fat cumulus clouds.
  Dark: a moonlit night raid with searchlights, lantern-lit farms, tracer
  glow. Each theme has its own palette inside both.
- **Signature moments:** the winner flying **into the sun** (a slow,
  cinematic push into a sunset or sunrise); a bird **splat** on the pilot's
  goggles (on screen, as in 1984); the oxen — characterful, chewing,
  unimpressed. In the Cyan vs Magenta theme, the pilot's parachute drifting
  down past the oxen.
- Explosions with debris and craters that stay; birds scatter from flocks.
- Sound synthesized: rotary engine with throttle, wind on dives, guns,
  bomb whistle, stall wail, a short title theme, an ox moo that the player
  will learn to fear.

## 7. Arcade Pass and cosmetics

About 15 badges, e.g. Into the Sun (win a round), Mind the Ox (finish a
campaign chapter without harming an ox), Splat! (bird on the goggles),
Running on Fumes (land at home with under 2% fuel), Option X (find the
Secret Hangar), Grounded (secret: stall into your own base), Ace (beat
Brutal). Cosmetics: plane paint, scarves, wing motifs, contrail colours —
cosmetic only.

## Hero-frame checkpoint (stop here before building everything)

After the engine is tested and one map is playable, render three hero
frames — mid-dogfight, a bombing run with a crater, the into-the-sun
ending — in Side view and Diorama 3D, light and dark, for the Great War
theme. Critique them at least five rounds, then **stop and report** with
the frames, so the owner can approve the look before the rest is built.

## Workflow

1. Behaviour notes from the source → engine (seeded, deterministic, no DOM)
   with tests: flight and stall, gravity on speed, fuel and refuelling,
   weapons, craters, collisions, scoring and penalties, round escalation,
   AI behaviours per level, endings.
2. Seeded terrain and target generator with validation (always winnable,
   bases on flat ground, targets reachable).
3. Side view, HUD and one playable map → hero-frame checkpoint (above).
4. After approval: Diorama 3D, the three themes, all modes, settings,
   Pass, cosmetics, Hall entry.
5. Art-direction loops (at least four) across themes, views, light/dark, at
   1440×900, 1280×720, 1024×768 and 844×390 → critique → fix.
6. Playtest via Playwright with a scripted pilot: tune stall, fuel and AI
   so Normal is fair and Brutal is sharp. Determinism in Chromium, Firefox
   and WebKit (needed by the Daily Sortie).

## Deliverables

- The game in `ports/mind-the-ox/`, tests green, lint clean, build passes.
- README and the three docs (ABOUT, HOW-TO-PLAY, ARCHITECTURE — Mermaid
  only) as `CLAUDE.md` requires, plus `CREDITS.md` (original author and
  publisher, GPL status of the original, "no code or data copied").
- `docs/games/mind-the-ox.md`: original behaviour notes, bugs and fixes,
  diff log.
- ADRs: clean-room provenance, theme system, camera views, AI design.
- Screenshots in `media/`, Hall catalog entry, `PORTS.md` row; mark the
  backlog item done in `BACKLOG.md`.
- No git commit.

## Report at the end

What was built, deviations and why, tuning numbers, follow-up ideas.

## Suggested run

Opus 5.5, effort **xhigh**: "Read prompts/011-mind-the-ox-port.md and do it."
It stops at the hero-frame checkpoint; after approval, say "Approved,
continue."
