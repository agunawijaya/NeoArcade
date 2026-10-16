# ADR 0032 — Mind the Ox's computer pilots

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Mind the Ox (prompt 011); follows
  [ADR 0026](0026-mind-the-ox-clean-room.md) (a clean reimplementation from
  behaviour notes)

## Context

The 1984 game had one kind of computer pilot. Each guarded the stretch of
the world around its airfield, waited on the ground until the player came
into it, and then flew by a simple look-ahead: every move it tried the
three stick positions (centre, push, pull) one move ahead and kept the one
that ended nearest a point 32 units behind the player without being about
to hit the ground, a target or an ox. It fired whenever a bullet it
imagined firing would meet the player, and when lined up within a few
units it slid its own plane a unit sideways onto the line of fire. It never
looked out for the player's plane itself, so chases often ended with both
planes going down together. The behaviour is written up in
[the behaviour notes](../games/mind-the-ox.md#computer-pilots).

The prompt asks for Dogfight against four levels (Easy, Normal, Hard,
Brutal), each with a name, a plane look and a flying style built on that
look-ahead AI; for campaign defenders that grow up chapter by chapter and
an enemy ace; and for playtests with a scripted pilot that show Normal is
fair and Brutal is sharp.

## Decision

1. **One planner, four styles.** `engine/cpu.ts` keeps 1984's planner and
   aim point. A level is a `LevelStyle` record, not a different program:

   | | Easy | Normal | Hard | Brutal |
   |---|---|---|---|---|
   | Thinks every | 10 ticks (two moves) | 5 ticks (a move, as 1984) | 5 ticks | 2 ticks |
   | Look-ahead, moves | 1 | 1 | 2 (the second with the stick centred) | 2 |
   | Aim | wobbles ±20 across, ±12 up and down | true | leads by 10 ticks | leads by 10 ticks |
   | Sits behind its quarry | 32 units | 32 | 24 | 14 |
   | Pulls the trigger on a sure shot | 35 %, short shots only | 55 % | always | always |
   | Top throttle | 3 of 4 | 4 | 4 | 4 |
   | Goes after enemies within | 240 units | anywhere | anywhere | anywhere |
   | Breaks away from a gun on its tail | no | no | yes | yes |
   | Minds the ground: the height a dive needs, the walls at the ends | no (as 1984) | yes | yes | yes |
   | Sees birds and flocks coming | no | no | no | yes |
   | Checks for a ram, moves ahead | 3 | 3 | 5 | 6 |
   | Heals a wound at home when nobody is near | no | no | yes | yes |
   | 1984's sideways nudge onto the line of fire | no | no | no | yes |
   | Half-stick positions in smooth flight | no | no | no | yes |
   | Answers a missile with a starburst | no | no | yes | yes |

   The table lives in `LEVEL_STYLES` and can be changed for one run from the
   command line (`dev/duel-stats.ts --set=brutal.trigger:0.8`), so tuning
   never means editing code to try a number.
2. **What every level gained over 1984**, found in playtests:
   - **Climbing out.** A pilot under 14 units over the ground, or on its
     runway, climbs straight out at about twenty degrees, full throttle, the
     right way up. 1984's planner could circle over its own field until it
     stalled.
   - **The ceiling.** Ending a look-ahead within 8 units of the ceiling
     counts as dangerous, so a chase upwards does not end in a stall.
   - **Ram avoidance** (`wouldRam`). For each stick position the planner
     also flies the plane on, stick held, for `ramHorizon` moves, and the
     other planes on along their velocity; ending within 18 units
     (`RAM_DISTANCE`) of one is a ram. When an option rams, the pilot
     parts from the closest plane (`closestPlane`): the higher of the two
     takes the option that ends highest, the lower the one that ends lowest
     (by id when level), never one with under 14 units of room, so two
     pilots both swerving cannot swerve into each other.
   - **Pull-out sense** (`pullOutLoss`, for every level that minds the
     ground: all but Easy). The planner works out the height a dive would
     lose before the nose came back to level, pulling hard a step a move,
     and treats a choice that would need more height than there is as a
     crash.
   - **The end walls** (`clearanceAhead`, the same levels). Within 240
     units (`END_ZONE`) of either end of the world, where the land rises
     into the mountains that wall the strip in, the planner also looks 64
     units (`LOOKOUT`) along the heading for land rising faster than the
     plane climbs. That lowers the option's clearance, and under 14 units
     it counts as a crash, so the pilot turns back in time. Playtests found
     Brutal and Hard flying into the walls about once a fight (mostly at
     x ≈ 70 and x ≈ 2,930). A first version that looked for rising land
     everywhere made Brutal so wary of every hill that it stalled into the
     ground instead (178 times in 200 fights), so the look-out is kept to
     the ends.
   - **When every choice is risky** it takes the one with the most room to
     the ground or the ceiling, and throttles back unless that room is
     below the ceiling.
3. **Birds** (`meetsBird`, Brutal only). In the look-ahead Brutal also
   flies every flock and bird on along its path, and treats an option that
   would bring it within 14 units of a flock (`FLOCK_CLEARANCE`) or 7 of a
   bird (`BIRD_CLEARANCE`) as a crash, so it flies round a flock that Hard
   would fly through. Before this, birds brought down 185 Brutal planes in
   200 fights. The lower levels keep 1984's blindness to birds, which is
   one of the things that makes them beatable.
4. **Evasion** (Hard and Brutal). `threatTo` looks for an enemy within 90
   units whose nose points at this plane within half a sixteenth of a turn
   and who can see it (not in fog; on a night raid, lit or close).
   `breakAway` then picks, of the safe stick positions, the one that ends
   furthest off the line that enemy's guns point along, at full throttle.
5. **Sight is shared with the gunners.** Every pilot finds its quarry
   through `isSpotted` (`engine/sight.ts`), so a plane in a fog bank, or out
   of the searchlights on a night raid, is invisible to computer pilots
   exactly as it is to the target guns.
6. **Who flies where.**
   - **Dogfight:** one computer pilot of the chosen level, five planes, or
     three of them with two planes each; they patrol rather than guard.
   - **Campaign:** a defender at each enemy airfield, guarding its third of
     the world as in 1984 and coming back after every crash, growing up
     with the chapters: Easy for chapters 1–2, Normal for 3–5, Hard for
     6–8. In *The Ace* and *Final Push* an ace flies the Brutal style
     from the last airfield, three planes, hunting anywhere.
   - **Classic 1984 and the Daily Sortie:** three Normal defenders.
   - **The title's demo:** a Hard pilot flies the home plane against three
     Normal defenders.
   - **Names and looks** come from the theme (`themes.ts`,
     `render/liveries.ts`), never from the engine: in the Great War Cadet
     Emil Sperling, Leutnant Otto Falk, Hauptmann Kurt Adler, the Grey Baron
     and the ace, the Crimson Kestrel; in Cyan vs Magenta Private Pinky,
     Sergeant Rosa, Major Mauve, Colonel Fuchsia and the Magenta Menace; at
     the Airshow Daisy Loop, Barnstorm Bill, Ruby Stall-Turn, Captain
     Corkscrew and the Flying Fandango.
7. **Softened flak outside Classic 1984.** 1984's target guns lead the
   plane by four moves with perfect aim; in playtests they decided most
   rounds from the second on. Classic 1984 keeps them (`flak: 'classic'`).
   Every other mode uses `flak: 'softened'`: the guns reach 80 % as far,
   fire every other move until the fourth round (the third in 1984), and
   miss by up to 6 units plus 0.08 per unit of range, so a pilot who keeps
   moving has a chance. Anti-aircraft depots fire every move from the
   first round over 140 units (112 softened), and on a night raid a plane
   caught in a searchlight draws fire from 170; the scatter applies to both.
8. **A scripted pilot for the tests** (`engine/bot.ts`). It flies the
   player's seat and only ever asks for controls, like a person: waits for
   the ground crew, takes off, picks the nearest enemy target, flies out
   high enough to clear the ground and anything standing on it by 30 units
   (out of reach of the guns where they fire back), comes in level, and
   drops a bomb when a bomb flown forward through the engine's own drag and
   wind would land on the target and not near an ox. With an enemy plane
   within 170 units, or nothing left to bomb, it fights with the computer's
   own planner, in the Hard style unless told otherwise. It goes home on
   the H autopilot when its racks are empty, its tank is down to a third or
   it is wounded. Turning back the other way it goes up and over the top,
   never round a half loop downwards, which at bombing height flew it into
   the ground. It is used by the playtests and the determinism fingerprint,
   by the tuning scripts, and by `?pilot=bot` for watching a game by hand.
   It is a test pilot, not a model of a person: it has no reaction time
   and no fear.

## Tuning

Measured with `dev/duel-stats.ts`: the scripted pilot against computer
pilots in Dogfight, fights capped at eight minutes (a fight the scripted
pilot has not won by then counts for the computer). `--fights=<level>`
sets the style the scripted pilot fights in (Hard unless stated), so
fighting as Normal against Normal is a mirror match. The share of fights
the **computer** wins:

| Level | 1 v 1 smooth, 200 fights | 1 v 1 smooth, pilot as Normal, 200 | 1 v 1 classic, 100 | 1 v 3 smooth, 100 |
|---|---|---|---|---|
| Easy | 21 % | 34 % | 15 % | 13 % |
| Normal | 42 % | 53 % (mirror) | 53 % | 17 % |
| Hard | 53 % (mirror) | 68 % | 81 % | 44 % |
| Brutal | 62 % | 70 % | 86 % | 65 % |

Fights last about 90 to 120 seconds one against one, about a minute one
against three. The ladder now rises at every step in every set-up.
Normal is fair: about even in its mirror match and in classic flight.
Brutal is sharp: it beats the Hard-style pilot nearly two times in three in
smooth flight and nearly nine in ten in classic.

How it got there:

- The trigger chances (35 % and 55 %), Easy's throttle and range, the tail
  distances and the ram horizons were set from runs of 40 fights a level
  with the scripted pilot in the Normal style (about 25 %, 50 %, 50–60 %
  and 62–73 % for the computer).
- A larger run, 160 fights with the pilot in the Hard style, then showed
  Brutal no sharper than Hard in smooth flight (52 % against 57 %): its
  two-tick thinking and close tailing won fights faster but flew it into
  the end walls and through flocks. The end-wall look-out and Brutal's eye
  for birds (decisions 2 and 3) fixed that.
- Forty fights move a level by ten points either way; compare against runs
  of 100 or more.

Still open: **rams** remain a common way down at every level, for both
sides. They are mutual, so they rarely decide a fight, but they make some
fights end in a double loss of planes that a person would find abrupt.

## Consequences

- A new level, or a rival with a habit, is a new `LevelStyle` row and a
  name in each theme; the planner does not change.
- Every behaviour is deterministic given the world's seeded RNG (Easy's
  wobble and the trigger chances draw from it), so a Daily Sortie's
  defenders fly the same for everyone, and the determinism test covers
  them.
- The scripted pilot still loses every campaign chapter (`dev/fly-bot.ts`:
  rams, flak, wreckage, birds and flying into the ground), destroying
  three to ten of each chapter's seventeen enemy targets before its five
  planes are gone (re-run after the end-wall and bird changes). That says
  the campaign is hard for a pilot with no judgement, not that it is too
  hard for people: the chapters' difficulty still needs a human playtest,
  and the scripted pilot is a check that the page and the engine agree,
  not a benchmark of fairness.
