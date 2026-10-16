# Mind the Ox — original behaviour notes and diff log

The port is a **clean reimplementation** (owner decision, prompt 011): the
1984 source was read to understand how the game behaves, the behaviour is
described here in our own words, and the engine in `ports/mind-the-ox/src/engine/`
was written fresh from these notes. No code, ground table, target layout,
sprite, sound table or random table was copied or translated.

## The original

*Sopwith: The Author's Edition*, by David L. Clark, published by BMB
Compuscience Canada (1984, revised 1985 and 1987; the source was released
under the GNU GPL version 2 in 2003). C with x86 assembler for the IBM PC
and compatibles in CGA (320 × 200, four colours), with an Atari ST build in
the same tree. The edition we read is in `sources/Sopwith/`; the game logic
is in `SW.H`, `SWMAIN.C`, `SWINIT.C`, `SWMOVE.C`, `SWCOLLSN.C`, `SWAUTO.C`,
`SWEND.C`, `SWTITLE.C`, `SWGAMES.C` and `SWDISP.C`.

`sources/Sopwith/PREVIOUS-REMAKE-NOTES.md` and `sources/Sopwith/docs/` belong
to an unrelated earlier remake plan and were treated as background only.
Where they disagree with the source (the key layout, for one), the source
wins.

## How 1984 behaves

### Time

The game advances everything in *moves*. The clock interrupt adds 10 to a
counter 18.2 times a second and a move runs each time it passes 15, so the
game moves about **12 times a second** (the 1996 "speed up" changed it from
about 9). One move: every object moves, the screen is drawn, collisions are
resolved, sound is updated.

### The world

- A strip **3,000 units wide and 200 high**, y measured up from the bottom.
- The ground is a fixed table of one height per unit. Both ends rise to the
  top of the world, so the strip is walled in by mountains; in between the
  land rolls between about 26 and 110.
- **Four airfields**: the player's a little left of centre (about 42 % across)
  and three for the computer, near 20 %, 57 % and 82 %.
- **Twenty targets** of four kinds: a hangar with a flag, a factory with
  chimneys, a round fuel tank on legs, and a tank (the armoured vehicle).
  Three of the twenty, just behind the player's airfield, are the player's
  own. The fuel tank is the one that scores double and blows up bigger.
- Each target sits on ground levelled for it when the round starts.
- **Four flocks** wheel back and forth at the very top of the world, each
  with one stray bird; **two oxen** stand in the fields just beyond the
  player's airfield.

### Flight

- **Sixteen headings.** Each move a held "flap" key turns the plane one
  sixteenth of a circle, towards the pilot's head (so the same key turns the
  other way when the plane is rolled over). A **flip** key rolls the plane
  over without changing its heading.
- **Throttle** 0 to 4, one notch per move.
- **Speed** is a whole number. Every fourth move it steps by one towards
  *minimum speed + throttle + gravity*, where gravity comes from a table that
  is 0 when level, −1, −2, −3 and −4 as the nose rises to vertical and +1 to
  +4 as it points down — a straight line in the angle, not a sine. Minimum
  speed is 4, maximum 8; diving at full throttle actually reaches 12, because
  the maximum only limits the computer's planning and the missiles.
- **Below minimum speed an expert's plane only gets slower**, one unit every
  four moves, until it stalls at zero. Opening the throttle at that point
  does not help; climbing with too little throttle is how you stall.
- **Flying at or above the top of the world stalls the plane.**
- **A stall** points the nose down at 45°, kills the speed and drops the
  plane straight down at its (recovering) speed. Every six moves it tumbles
  over to the other side. It recovers once the pilot has the nose pointing
  **straight down** and speed is back above the minimum.
- The **novice** never stalls: at the top the nose is simply turned down, and
  speed never drops below 1. The novice also uses no fuel or ammunition and
  has no birds or oxen.
- **Movement** is fixed point: speed × sine and cosine (a table of sixteen,
  ×256) as a whole part and a fraction, added each move.

### Fuel and the airfield

- The tank holds **9,000**: each move uses the current speed. Empty means
  falling out of the sky.
- **Taking off**: touching the throttle or the stick at home jumps the plane
  straight to minimum speed.
- **Coming home** is only possible with the **H** key: an autopilot steers for
  the parking spot and, within 16 units of it, puts the plane down there
  (there is no landing as such). While parked it is topped up: 1 % of the
  tank and 2 rounds every move, and a bomb (and missile and starburst) every
  20 moves. Parking also heals a wound.
- The computer's planes use no fuel and never run out of anything.

### Plane states

Flying, stalled, wounded (smoking; the stick, throttle and flip only answer
on every other move), wounded and stalled, falling (shot down), crashed,
finished, and in network play ghost states for a player out of planes.

- **Falling**: the plane keeps its momentum. Every five moves the fall
  steepens by one unit and, once it is going down, it loses a unit of
  forward speed. Pulling up stretches the time between those steps (six or
  seven moves), pushing down shortens it.
- **Crashed**: a wreck for 10 moves (20 if it came down within 32 units of
  home), then the crash counter goes up and a fresh plane, fully stocked,
  waits on the runway. The **fifth crash** ends the game.

### Weapons

- **Guns**: one bullet every move while the trigger is held, from the middle
  of the plane, along the nose, at the plane's speed plus 10, living 10 moves.
  **200 rounds.**
- **Bombs**: at most one every 10 moves, **five** carried. A bomb leaves from
  under the plane with the plane's motion; every five moves it falls a unit
  faster and, once falling, drifts a unit less sideways, so it arcs over and
  steepens.
- **Missiles and starbursts** (five of each) exist but are only switched on
  by an undocumented command-line option (`-x`) that the help screen does
  not list. A missile flies at one and a half times the maximum speed for 50
  moves, turning a sixteenth of a circle every other move towards its
  target; a starburst falls behind the plane for 20 moves and any missile
  chasing that plane chases the starburst instead.
- **Explosions** throw wreckage: three pieces for a plane, eight for a bomb
  or a target, fifteen (faster) for a fuel tank. The pieces fall back to
  earth and **can bring down a plane that flies into them**.
- **Craters**: a bomb, missile or plane hitting the ground digs eight units
  wide and up to three deep, never more than twenty below the original
  ground.

### Collisions

Pixel overlap between the symbols. Who hits what:

| Thing hit | By a bullet | By a bird or flock | By an ox | By a bomb, missile, plane, target or wreckage |
|---|---|---|---|---|
| Healthy plane | wounded | wounded | wounded | shot down |
| Wounded plane | shot down | shot down | shot down | shot down |
| Falling plane | a hole in your goggles | a bird on your goggles | — | — |
| Target | damage +10 (heals 1 a move); destroyed past 10 × round | — | — | destroyed (wreckage does not count) |
| Ox | killed | — | — | killed |
| Bird | killed | — | — | killed |
| Flock | scattered into 8 birds | — | — | scattered |

Two planes that collide both go down, each with the average of their two
velocities, nudged apart. A bird that hits your plane, or a bullet that
hits it, paints a splat or a bullet hole on your screen. (An "ox splat" that
would fill the screen is in the code but is never called.)

### Scoring

| Event | Points |
|---|---|
| Enemy target | +100 |
| Enemy fuel tank | +200 |
| Enemy plane down | +50 |
| One of your own targets | −100 (−200 for the tank) |
| Your plane down or crashed | −50 |
| A bird | −25 |
| An ox | −200 |
| Winning a round | +25, +50, +75 … for each plane left |

In one-player games there is a single score, and every event is scored by
the **colour** of the thing involved: a computer plane that kills an ox
earns the player +200.

### Rounds and endings

- Destroying the last enemy target wins the round — if the player still has
  a plane to spare, or is on the last one and still flying.
- The winner flies **into the sun**: the plane stops and its picture grows in
  four steps over 72 moves (six seconds), then the bonus counts up and the
  next round starts on the same ground with the craters gone.
- Each won round adds 1 to the minimum and maximum speed and to the bullet
  speed; targets need one more hit; and **from the second round targets fire
  back** at the player, every other move in the second round and every move
  after that, leading their aim by four moves, over a range of 75 that grows
  by 15 a round to 150.
- The loser gets **THE END** for 20 moves, and the game starts again from the
  first round with no score.

### Computer pilots

- Each defends a stretch of the world (its airfield's third). It waits on the
  ground until the player enters that stretch, attacks while the player is
  there, and otherwise cruises 50 below the ceiling over the middle third of
  the world, weaving every 16 moves.
- **Attack**: it aims at a point 32 units behind the player along the
  player's heading (straight at a parked plane). More than 160 units away it
  turns round the long way, up and over (or down and under near the top),
  then heads back at altitude.
- **Steering**: each move it tries centre, push and pull one move ahead
  (assuming one unit more speed). It keeps the choice that ends nearest the
  aim point without being "about to crash" — under 22 above the ground, or
  under 50 and low over a target or an ox — and opens the throttle. If every
  choice is dangerous it closes the throttle and takes the one that keeps
  the most height. Below minimum speed it opens the throttle fully.
- **Shooting**: it imagines a bullet fired now and the player carrying on as
  he is for a bullet's life; if they would meet, it fires (a missile instead
  for a long shot, when missiles are on).
- **The nudge**: lined up within 6 units, it moves *itself* one unit towards
  the line of fire.
- It flies home when the round ends, and comes back for ever after a crash.

### Keys

From the keyboard table in `SWUTIL.ASM`: **X** faster, **Z** slower, **,**
pull up, **/** push down, **.** flip, **Space** guns, **B** bomb, **H** home,
**S** sound, **V** missile, **C** starburst. (The earlier remake notes list a
different layout with `;` and **M**; the source does not.)

### Sound

One PC speaker, one sound at a time by priority: engine pitch by speed, a
falling whistle for bombs and for a falling plane, a rattle for the guns, a
two-tone warble when hit, and a tune that plays while explosions are going
on (the same tune opens the title).

## Bugs and quirks

| In 1984 | What the port does |
|---|---|
| The starburst's cooldown is set on the new starburst, not the plane, so starbursts can be fired as fast as the key repeats. | The plane waits five moves between starbursts. |
| The gun checks the plane's ammunition through a pointer before it has been set. | The engine counts rounds on the plane that fires. |
| The computer slides its own plane a unit sideways to line up a shot. | Kept, but only as the Brutal pilot's documented trait. |
| The end report says "statictics". | There is no such report; the results screen is spelled correctly. |
| A player's own missiles home on the player (the target is set to the firing plane), so they fly straight. | Missiles lock on to the nearest enemy ahead. |
| A bullet passes through birds and flocks (it kills the bird but survives). | The bullet is spent. |
| Scores follow colours, so the computer harming an ox pays the player. | Scores are kept per side; harming birds and oxen costs whoever did it. |
| The ox splat is never shown. | Flying into an ox splats mud on the goggles. |
| Birds scattered from a flock stay for the rest of the round; a busy round ends with the sky full of them. | Scattered birds wheel about for 36 to 72 moves (3 to 6 seconds), then climb away over the top. |
| Computer pilots never look out for other planes, so a chase often ends with both going down together. | Every computer pilot checks a few moves ahead for a ram and parts from the other plane (see the computer pilots below). |

## Owner decisions

- **A clean reimplementation** ([ADR 0026](../adr/0026-mind-the-ox-clean-room.md)):
  behaviour notes from the source, our own code; no ground table, target
  layout, sprite, sound or random table copied. "Sopwith" is named only in
  the credits and the brochure.
- **All three themes** ([ADR 0027](../adr/0027-mind-the-ox-themes.md)),
  Great War 1917 by default.
- **The hero frames were approved** at the checkpoint (2026-10-16, "Approved,
  continue"): the Great War's dogfight, bombing run and flight into the sun,
  side and diorama, day and night, now in `ports/mind-the-ox/media/hero/`.
- **Classic 1984's keys follow the 1984 source**, not the layout the prompt
  sketched (`,` `/` `.` `;` `X` Space `B` `H`, `M` `V`): **X** faster,
  **Z** slower, **,** nose up, **/** nose down, **.** flip, **Space** guns,
  **B** bomb, **H** home, and **V** missile and **C** starburst once the
  Secret Hangar is open.
- **In the Great War every pilot bails out** under a parachute in their
  side's colours, Allied and Central Powers alike (the owner preferred it to
  the historical 1917 picture, where only balloon observers had them). In
  Cyan vs Magenta everyone always bails out; at the Airshow nobody is shot
  down, and a tagged plane trails smoke and glides in.
- **Carrier Ops (prompt 016) hero frames were approved** at their checkpoint
  (2026-10-16, "Approved, continue"): a squadron launching at dawn, a
  torpedo run on a battleship and a night landing in a swell, side and
  diorama, day and night. Before approving, the owner asked for the
  carrier's **island** (the bridge on the flight deck); it was added, on the
  starboard edge, as scenery only, and the owner confirmed it as built. The
  carriers of July 1918 had no island yet (HMS *Argus* was flush-decked;
  *Furious* had her superstructure amidships), so this is a deliberate
  change of look, not of history.

## Diff log

Deliberate changes, with the reason. Numbers are restated in the port's
units (world units, moves of five ticks at 60 ticks a second).

### Engine

- **Ticks and moves.** The engine ticks 60 times a second and calls five ticks
  a move, so 1984's pacing (12 moves a second) carries over with smooth
  motion. All of 1984's timers are kept in moves.
- **Exact arithmetic.** Positions and speeds are doubles but the engine only
  uses + − × ÷, comparisons and `Math.sqrt`; sines come from a table built
  with a Taylor series (`engine/trig.ts`), so a seed flies the same in every
  browser (the Daily Sortie needs it; see ADR 0012 for why `Math.sin` is out).
  A test scans the engine for forbidden functions, and the determinism test
  compares a fingerprint of seeded battles in Node, Chromium, Firefox and
  WebKit.
- **Smooth flight** (every mode but Classic): 4,096 headings instead of 16;
  the stick sets a rate of turn that eases in over five ticks and never
  exceeds Classic's sixteenth of a circle per move; speed changes
  continuously at Classic's average rate; a wound halves the stick's
  authority instead of skipping moves; an upside-down plane left alone rolls
  upright (setting). Classic keeps the sixteen steps, the whole-number speed
  and the every-other-move wound.
- **The stall trap, smooth flight only.** In 1984 an expert's plane below
  flying speed only ever gets slower. In smooth flight that caught a plane
  just after take-off, still a fraction under flying speed with the throttle
  open, and stalled it for no reason a player could see. Smooth flight now
  only lets a slow plane sink while its speed limit (slowest speed plus
  throttle plus the dive) is itself below flying speed, which is the
  climbing-on-too-little-throttle case 1984 meant. Classic keeps 1984's rule.
- **Real landings.** Touching down on your own runway level, the right way
  up, throttled back and at flying speed rolls the plane to a stop and parks
  it, where it refuels as in 1984. Pulling up on the runway rotates the plane
  for take-off instead of crashing it. **H** still flies home on autopilot
  and, within 16 units of the parking spot, sets the plane down as before.
- **Runways are hardened**: craters do not dig into them (a crater on a
  runway wrecked every plane that took off after it), though they still
  scorch it.
- **A plane on its runway shrugs off wreckage**; bombs, missiles and other
  planes still wreck it.
- **Your own weapons never hit you.** Your bullets, bombs and missiles pass
  through your own plane (a bomb dropped in a climb can hang beside it for
  seconds). The wreckage they throw up is nobody's, though: fly low over a
  target as it blows up and the debris can still bring you down.
- **Hit shapes** replace pixel overlap: a plane is a capsule 14 units long and
  6 thick along its heading; bullets, bombs, missiles and wreckage are swept
  along their last tick so nothing skips through anything; targets and oxen
  are boxes. A bird is a small target (0.9 units round its path), so a
  flock's strays are a hazard rather than a wall.
- **Scoring by side** (see the bugs table). One-player modes still charge you
  for your own losses (a plane −50, an own target −100); two-player versus
  only pays the other side.
- **Targets shoot at the nearest enemy plane**, not only at the first
  player, so two-player games are fair.
- **Softened flak** (every mode but Classic 1984). 1984's target guns lead a
  plane by four moves with perfect aim, and in playtests they decided most
  rounds from the second on. Outside Classic the guns reach 80 % as far,
  fire every other move until the fourth round (1984: the third), and miss
  by up to 6 units plus 0.08 per unit of range. Classic 1984 keeps 1984's
  guns.
- **Computer pilots** keep 1984's three-way look-ahead, aim point, long way
  round and imagined bullet, in four levels, with fixes found in playtests:
  they climb straight out of their airfield instead of stalling over it,
  keep 8 units under the ceiling, look a few moves ahead for a ram and part
  from the other plane (the higher climbs, the lower dives), know how much
  height a dive needs to pull out of and, near either end of the world, see
  the mountains rising ahead in time to turn back (all but Easy), break
  away from a gun on their tail (Hard and Brutal), fly round flocks and
  birds (Brutal only), and when every choice is risky take the one with
  the most room. They see through `isSpotted`, like the gunners, so
  fog and darkness hide a plane from them too. A pilot with a territory waits
  on the ground for an intruder, as in 1984; one without (Dogfight, the ace)
  patrols or hunts. The level table and the tuning are in
  [ADR 0032](../adr/0032-mind-the-ox-computer-pilots.md).
- **Generated battlefields** (`engine/map.ts`): new rolling ground from a seed
  for every map, laid out the way 1984 was (home left of centre, three enemy
  fields, three own targets behind home, seventeen enemy targets spread over
  the rest, two oxen just beyond home, four flocks near the ceiling). Every
  map is checked: walls at both ends, room to fly over everything, level
  runways with room to climb out, every target level and under open sky,
  nothing crowding anything. Unfair seeds are skipped deterministically; 300
  seeds are tested.
- **Other layouts** for the new modes: Co-op gives the second friendly
  airfield to the second player; Versus splits the world into two halves of
  ten targets each, with the oxen in no man's land; Dogfight keeps the
  airfields, the oxen and the birds and takes the targets away.
- **Hand-drawn maps** (`MapSpec`, `buildMap`) for the campaign: knots give
  the land its shape, a little seeded noise roughens it, the ground under
  every runway, pasture and target is levelled, and a spec that fails the
  fairness check is a mistake that throws (tested for every chapter).
- **Flocks** fly a few units below the ceiling (6–16) rather than right at it,
  so they can be met without stalling.
- **Birds scatter** from a flock in a ring at random speeds rather than from a
  fixed table, and leave after a while (see the bugs table).
- **A falling wreck takes a bird down with it, unpaid**: the bird is gone
  (it would otherwise splat the goggles again every tick) and nobody is
  charged 25 for it; the pilot has already lost the plane.
- **Oxen look up.** A plane passing low over an ox (under 34 units above
  it, within 22 either side) startles it into a moo, then it will not be
  bothered again for 60 moves. It does not move: it is unimpressed.
- **The campaign's twists**, each a rule a chapter switches on:
  - *Crosswind*: a steady wind (1.1 units a move in Westerly, 0.6 in the
    final assault) added to every plane's and bomb's sideways motion.
  - *Fog banks*: low cloud lying on the land up to a height; a plane inside
    one cannot be seen by the gunners or the computer pilots.
  - *Night raid*: each enemy airfield sweeps a searchlight (300 units long,
    about 11° wide, swinging about 50° either side of straight up and back
    in 96 moves, a pure function of the clock so both views draw the beams
    the engine uses). In the dark, gunners and pilots see only a plane in a
    beam or within 60 units, and a lit plane draws fire from 170 units, even
    in the first round.
  - *Convoy*: lorries crawl along the valley road at 0.45 units a move
    towards their own airfield; one that gets there escapes, unpaid.
  - *Anti-aircraft guns*: depots fire every move from the first round, out
    to 140 units.
  - *The ace*: a Brutal pilot with three planes from the last airfield,
    hunting anywhere.
- **Match goals.** A round can end on the targets (1984), on the planes
  (Dogfight: every enemy plane out), or in Versus when a side loses its last
  target or its pilot runs out of planes (the higher score takes the round;
  best of three). In Co-op a pilot out of planes flies on as a harmless
  ghost, and the round is lost only when both are out.
- **The flight into the sun, THE END and the bonus** are kept; the bonus counts
  only planes still in the hangar.

### Modes

- **Classic 1984**: 1984's rules (sixteen headings, 1984's flak, three Normal
  defenders guarding their thirds), round after round on the same ground
  until the last plane, the 1984 key table in Settings, and an optional
  four-colour CGA picture.
- **Campaign**: eight hand-drawn chapters, chapter *n* flown at round *n*'s
  speeds (so the targets fire back from chapter 2), defenders growing up
  from Easy (1–2) to Normal (3–5) to Hard (6–8). The first star is always
  for winning:

  | # | Great War title | Twist | Second and third stars |
  |---|---|---|---|
  | 1 | The Ox Pasture | a protected ox herd | harm no ox; lose no planes |
  | 2 | Westerly | crosswind | land at home; win inside 6 minutes |
  | 3 | Pea Soup | fog banks | win inside 5 minutes; lose no planes |
  | 4 | Lantern Raid | night raid | spend under 12 s in the searchlights; lose no planes |
  | 5 | Supply Road | a convoy on the move | stop the whole column; lose no planes |
  | 6 | Archie | depots with anti-aircraft guns | bomb the depots first; lose no planes |
  | 7 | The Ace | an enemy ace | bring the ace down; lose no planes |
  | 8 | Final Push | the final assault: guns, wind and the ace | bring the ace down; harm no ox |

  Each chapter's title and briefing are written in each theme's own voice.
- **Dogfight**: one against one (the rival has five planes) or one against
  three (two planes each), on a dogfight map without targets, at Easy,
  Normal, Hard or Brutal; each level has a name and a paint job per theme.
- **Two players** (replaces 1984's serial and network play): split screen,
  one keyboard in two halves or two gamepads; Co-op against the computer's
  defenders, or Versus, best of three rounds.
- **Daily Sortie** (`shared/daily`, launched 2026-10-15): one round of the
  1984 battle on the day's generated ground, smooth flight and the modern
  rules whatever the player's settings, secret weapons off. The first flight
  of the day counts; the share line is spoiler-free, e.g.
  `Mind the Ox · Daily #12 🛩️💥💥🐄✅☀️ 4,250`.
- **The Secret Hangar**: missiles and starbursts stay locked, as in 1984,
  until the player types 1984's hidden switch, `-x`, on the title screen,
  or pats the ox on the title card five times (the way in on a phone).
  Then the hangar screen, where the Arcade Pass cosmetics are fitted,
  shows the Secret Hangar, and missiles and starbursts can be switched on
  for every mode but the Daily Sortie.
- **Continue playing**: every mode reports itself to the Hall, a campaign
  chapter with its id, and the Hall's link back (`?play=<mode>`, and
  `&item=<chapter>` for a chapter) opens that mode, or that chapter's
  briefing.

### Controls

- **Modern** (the default): W and S (or ↑ and ↓) the nose, D and A (or →
  and ←) the throttle, F flip, Space guns, B bombs, M missile, V starburst,
  H home; Esc or P pauses, Tab switches the camera. The arrows are spare
  keys for a player alone: an arrow the player rebinds to something else
  keeps only its new job, and in the 1984 layout and two-player games the
  arrows are not doubled up. Gamepad: the left stick or the d-pad for the nose,
  the triggers for the throttle, A guns, X bombs, Y flip, B home, the
  bumpers for missile and starburst.
- **Classic 1984**: 1984's own key table (see the owner decisions), as a
  layout anyone can pick.
- **Two players on one keyboard**: W A S D with Q flip, G guns, F bombs, E
  home, R and T secret weapons; and the arrows with / flip, . guns, , bombs,
  M home, L and K secret weapons. The two halves share no key.
- **Rebindable**: every key in every set, in Settings.
- **Touch**: a stick under the left thumb (up and down the nose, left and
  right the throttle) and buttons under the right (guns, bomb, flip, home,
  and missile and flare when unlocked).

### Presentation

- **Two camera views** over one engine ([ADR 0028](../adr/0028-mind-the-ox-camera-views.md)),
  side and diorama, with the same field of view; a code-drawn biplane with
  ribbed wings, struts, wires and a blurred propeller; gouache countryside
  with a cut-away soil section; the flight into the sun as a slow push into
  a golden sky.
- **Three themes** with their own palettes by day and by night, liveries,
  target painters, scenery, words and sounds; downed pilots as in the owner
  decisions.
- **Classic 1984's CGA picture** draws its own screen rather than filtering
  the painted one: a black sky, a white line of ground (two of the filter's
  200 rows thick, craters and all), no hills, fields, trees or haze, the
  player's side in cyan and the enemy's in magenta, oxen and birds in white,
  through the shared four-colour filter with no dither. Filtering the
  gouache picture turned its haze and fields into a dithered cyan noise.
- **The diorama's sun and moon stay round** at any screen shape: the sky
  texture is stretched over the screen, so they are squeezed by the same
  amount in the other direction.
- **Fog banks** are a soft wall, built on a layer of their own: thicker
  towards the ground, a ragged line of billows along the top, faded out at
  both ends, so they never show a hard edge.
- **Splats on the goggles**: a bird is goo with drips, an ox is mud, a bullet
  is starred glass, and at night the goo is as dim as the moonlit scene.
- **Sound** is synthesised: a rotary engine pulsing with the throttle, wind
  on dives, guns (a paint gun's pop at the Airshow), the bomb's whistle, a
  stall wail, explosions by size, the splat, an ox's moo, the refuelling
  and a short title theme.
- **On phones** held sideways (under 520 px tall), the title's mode cards
  drop their blurbs so two fit side by side, and the title ox sits small in
  the card's corner rather than vanishing, so it can still be patted.
- **Reduced motion** stills the battle behind the title, the menus'
  animations and the camera's push-in on the flight into the sun, in both
  views.

### Carrier Ops (prompt 016)

1984 had no sea; everything here is new, and none of it reaches a land map
(see [ADR 0033](../adr/0033-mind-the-ox-sea-and-ships.md)). What changed for
the existing modes, deliberately:

- **The autopilot (H) now flies home and lands.** It used to switch itself
  off after one tick (a bug from prompt 011: the steering code cleared
  `homing` as soon as it ran). With it fixed, a plane on autopilot over
  land climbs over the ground in its way, turns back under or over the top
  as there is room, and comes down a glide path to its runway. The
  scripted pilot uses H to go home, so the land battles' engine
  fingerprints changed once, here, and were re-recorded in
  `fingerprint.test.ts`. No land rule changed.
- **New engine rules, for the sea only.** Water, beaches and cliffs; ships
  (carrier, battleship, cruiser, destroyer, supply ship, torpedo boat,
  monitor) that patrol, turn, ride the swell, fire their anti-aircraft
  guns (time-fuzed shells) and sink; ditching, with a destroyer's boat
  picking the pilot up within 130 units; torpedoes (one, instead of the
  bombs, dropped low, level and slow; they run 2.5 under, pass under
  shallow hulls and are combed by a ship that turns end-on); bombers and
  airships that raid one ship; mission objectives; gates; and the carrier
  deck ([ADR 0034](../adr/0034-mind-the-ox-deck-model.md)).
- **Our planes pass our own ships.** Airborne, they cannot collide with a
  ship of their side other than their own carrier's hull; enemy ships are
  solid. In a side-on world a plane leaving the deck would otherwise fly
  straight into its escort.
- **Deck windows grow with the round.** The wires' closure window is
  4.6 units a move (5.4 with the assist) for the first round's planes and
  as much wider as later rounds' planes are faster.
- **The Daily Sortie goes to sea on some days**, from #3: a day whose seed
  divides by three flies a Custom Sortie built from that seed
  ([ADR 0035](../adr/0035-mind-the-ox-mission-generator.md)). Days #1
  and #2 were on land and are unchanged, so recorded results still stand;
  the share line gains an anchor on naval days.
- **New modes**: At Sea (eight missions with briefings and stars) and Custom
  Sortie (nine mission types, seeds shared as `?sortie=<code>` links).
- **New settings**: the carrier landing assist (as the mission's difficulty
  has it, always, never) and what to carry off the carrier (as the
  briefing says, bombs, a torpedo). A new key swaps bombs for a torpedo
  while parked on deck: **T** (modern and 1984 layouts), **Z** and **J** for
  two players' halves, the right stick pressed in on a gamepad, a "Load"
  button on touch screens.
- **Presentation**: the sea in section in the side view (swell, foam,
  light shafts, the bed), open water to a horizon in the diorama, both
  views' ships from one set of layouts, flak bursts, torpedo wakes, ship
  wakes, sinking ships, rescues (and, in Cyan vs Magenta, a pilot paddling
  off on a raft), airship sheds, gates, the strip map's water and ships, the
  panel's torpedo and objectives. The Airshow's warships are dressed
  overall with bullseye boards for the flour bags. New sounds: splash, ship
  horn, deck whistle, the wire's catch, flak, a sinking ship's groan, and
  the sea under it all.

### Arcade Pass

Twenty-two badges (Into the Sun, Splat!, Wheels Down, Loop the Loop,
Scattershot, Daily Sortie, Wingman, Mind the Ox, Running on Fumes, Depot
Buster, Sharpshooter, Crater Maker, Like It's 1984, Lantern Dodger, Dawn
Patrol, Head to Head, Ace, Last Chapter, Full Marks, and the secret Option
X, Grounded and Moo), cosmetics by level (paints, scarves, wing motifs,
contrails; looks only), XP for every round, and the shared unlock toasts
after the results. See `ports/mind-the-ox/pass.manifest.ts` and the
architecture's Arcade Pass section.

Carrier Ops adds nine: Trap!, Bolter, Wet Feet, Fish in the Water, Night
Owl at Sea, Tondern, Carrier Killer, Not On My Deck and Fleet Admiral; two
cosmetics (a navy scarf for Trap!, sea grey paint for Fleet Admiral); the
stats Deck landings, Ships sunk and At Sea stars; and XP for missions
completed (50, plus 10 a new star) and sorties (40, 60 at Brutal).

## Tuning notes

Measured with the tuning scripts in `ports/mind-the-ox/dev/` (see the
port's TESTING.md).

- **Computer pilots against the scripted pilot** (`duel-stats.ts`, one
  against one, smooth flight, 200 fights a level, the scripted pilot
  fighting in the Hard style): the computer wins 21 % at Easy, 42 % at
  Normal, 53 % at Hard (the mirror match) and 62 % at Brutal, fights lasting
  90 to 120 seconds. With the scripted pilot fighting as Normal: 34 %,
  53 % (mirror), 68 % and 70 %. Classic flight (100 fights): 15 %, 53 %,
  81 % and 86 %. One against three (100 fights): 13 %, 17 %, 44 % and 65 %.
  Every ladder now rises level by level: Normal is fair, Brutal is sharp.
  Details in [ADR 0032](../adr/0032-mind-the-ox-computer-pilots.md).
- **What was tuned from those runs**: Easy pulls the trigger on 35 % of sure
  shots, Normal on 55 % (1984: always); Easy keeps to three-quarters
  throttle and only chases within 240 units; tail distances 32, 32, 24 and
  14; ram checks 3, 3, 5 and 6 moves ahead within 18 units; Brutal thinks
  every two ticks.
- **Brutal was no sharper than Hard** in an earlier 160-fight run (52 %
  against 57 %): it flew into the mountains at the ends of the world about
  once a fight (mostly at x ≈ 70 and x ≈ 2,930) and lost 185 planes to
  birds in 200 fights. Every pilot that minds the ground now looks 64 units
  ahead for rising land within 240 units of either end, and Brutal gives a
  flock 14 units and a bird 7. A first version that looked for rising land
  everywhere made Brutal stall into the ground 178 times in 200 fights, so
  the look-out was kept to the ends.
- **Open**: rams are still a common way down for both sides at every level.
  They are mutual, so they rarely decide a fight, but a person may find a
  fight that ends in a double loss abrupt.
- **Flak**: softened guns reach 0.8 as far and scatter 6 + 0.08 per unit;
  anti-aircraft depots reach 140, a searchlit plane draws fire from 170.
- **Birds**: scattered birds leave after 36–72 moves; a bird's hit shape is
  0.9 units round its path. Before these, birds were among the commonest
  causes of a lost plane in bot runs.
- **The campaign** with the scripted pilot (`fly-bot.ts`): it loses every
  chapter, destroying three to ten of the seventeen enemy targets before
  its five planes are gone, to rams, flak, wreckage, birds and the ground.
  The scripted pilot has no judgement, so this is not a verdict on human
  difficulty; the chapters still need people to play them.
- **Twists**: convoy speed 0.45 units a move; searchlight reach 300, half
  width 64 of 4,096 (about 5.6°), sweep 96 moves; night sight 60 units;
  crosswind 1.1 and 0.6 units a move.

### At sea (prompt 016)

- **Ships' guns**, every so many moves, reach in units: carrier 6, 110;
  battleship 5, 150; cruiser 5, 130; destroyer 6, 110; torpedo boat 8, 70;
  monitor 5, 120; scattered 12 + 0.1 per unit. A mission's difficulty
  multiplies reach and rate: 0.8 Easy, 1 Normal, 1.12 Hard, 1.25 Brutal.
  The first values (every two or three moves) brought the scripted pilot
  down within seconds of coming in range; the second set leaves a run at a
  battleship survivable with luck.
- **Bombers' and airships' gunners** fire every 8 and 5 moves (from 3 and
  2), scattered 12. Escorting fighters hunt only in Intercept and the
  sorties that need them; elsewhere the enemy guard the water and coast
  700 units round their airfield or carrier.
- **Carrier** hit points 90 (from 60), **supply ships** 45 (from 30), set
  when a torpedo did 36. After the owner's review a torpedo does 50 and a
  bomb 20 (from 10), so that a hit decides something: one torpedo sinks
  anything up to a cruiser, a battleship or carrier takes two (ours too),
  five bombs sink a battleship. **Torpedo boats** reload every 150 moves
  (from 90); sent against our carrier in a sortie they come on at 1.1 a
  move.
- **Convoys**: an escort is complete with every ship in or lost and at
  least half of them in; it fails as soon as more than half are gone.
- **Landing** (`dev/landing-rates.ts`, forty autopilot approaches from
  seeded starts per case): 87–100 % trapped at every sea state, with and
  without the assist, at the first and third rounds' speeds; after the
  touch-and-go rule, 35 to 40 of 40 in every case, never a touch-and-go.
- **The At Sea missions** with the scripted pilot (`dev/sea-balance.ts`):
  it completed Deck Trials (66 s), Coastal Strike (66 s) and Convoy Escort
  (186 s) and lost the rest, mostly to flak and rams. With the owner's
  review (heavier hits, night searchlights, the touch-and-go) it completes
  Deck Trials with its touch-and-go and a third-wire trap (89 s), Coastal
  Strike (66 s), Convoy Escort (186 s) and Night Recovery (127 s); with the enemy's
  pilots made easy it fares much the same, so what beats it is the ships'
  guns and its own lack of judgement, not the enemy's skill. As on land,
  this is no verdict on human difficulty.
- **Custom Sortie** (the same script, three seeds a mission, Easy, enemy
  from land and sea): it won every dogfight and intercept, a third of the
  anti-ship and night-landing sorties, and none of the land strikes,
  convoys, carrier defences or reconnaissance flights. After the review:
  every dogfight and night landing, two intercepts in three, a third of
  the land strikes and anti-ship sorties, and still no convoy, carrier
  defence or reconnaissance. Traced one by one,
  those losses are its own (flying low through flak, into ships and into
  the shore), not unfair layouts, which the generator's checks rule out.
  Two layout faults the traces did find were fixed: carriers patrolling so
  close to the mountains that a plane launched at the end of the run flew
  into them (every carrier's patrol now keeps 520 units of room), and the
  two fleets patrolling through each other in mid-sea (each now keeps to
  its half).
- **Art direction at sea**, four passes over `e2e/sea.screens.ts`'s matrix
  (in `dev/art/sea/`, not kept): (1) the Great War through all eight
  missions, side and diorama, day and night, at 1280 × 720; (2) Cyan vs
  Magenta and the Airshow through the same; (3) Deck Trials and Intercept at
  1440 × 900, 1024 × 768 and 844 × 390; (4) the media shots and the hero
  frames. What they changed: the objective paper moved clear of the pause
  button, the hills behind sink to the sea's horizon in both views, the
  diorama's sea runs to a horizon at the side view's height, the Airshow's
  warships were dressed overall, the island fades while a plane is behind
  it, the panel says "1 raid to come" and "0 of 3 ferries in" rather than
  "1 raids", briefings that open with a side's name start with a capital,
  and the sortie code box was styled like the chips beside it.

### After the owner's review (prompt 016)

The owner asked for ships to look hit when they are hit, "or even just
sink", chose decisive torpedoes from three ways of doing it, and asked for
the rest of the prompt's unfinished items:

- **Hits show where they land**, in both views: a torn hole at the
  waterline for a torpedo, a blackened burst on the side, superstructure or
  flight deck for a bomb or a crash, each burning for 10–20 seconds and
  smoking while the ship floats; past half its hit points every wound
  burns. The water comes in: a wounded ship settles by up to 0.3 of its
  freeboard (the engine moves its deck and hit boxes with it), loses up to
  half its speed, and is drawn down by the head or stern towards its holes
  and listing (a carrier that can still take planes keeps its deck level).
  The scattered scorch marks of the first build, not tied to any hit, are
  gone.
- **Heavier hits**: a torpedo 50 (from 36), a bomb or missile 20 (from 10),
  with the numbers above. Recorded as a deliberate change; no naval Daily
  had been flown yet (they start at #3), so no recorded result changes.
- **Searchlights at sea**: the enemy's battleships, cruisers and monitors
  sweep the sky at night from their foremast, and every night mission at
  sea (Night Recovery, a sortie at night, a naval Daily at night) uses the
  night raid's rule: the enemy sees only what a beam finds or what comes
  close. Before, night at sea was dark to look at only.
- **Touch-and-go and the third wire**: touching down with the throttle
  wide open takes no wire, at any pace, and goes round. Deck Trials now
  asks for one between its gates and its last landing, and its second
  star is "Catch the third wire" (the Airshow's spot landing) instead of
  a time limit. The autopilot never opens the throttle to the stop on the
  glide, so it never touches and goes by accident. The mission paper shows
  the deck's call for a moment after each landing: the wire, a bolter or a
  touch-and-go.
- **The fleets recede in depth** in the diorama: a few hulls of each side
  steam slowly along the horizon behind the battle, hazed by distance and
  lit at the masthead at night; scenery only.
- **Smaller fixes**: the mission paper's counts read "1 raid to come" and
  "0 of 3 ferries in"; sortie briefings that open with a side's name start
  with a capital; the sortie code box matches the chips beside it, and the
  Custom Sortie screen opens at its top.

### No mission that cannot be won (prompt 016)

The owner asked whether the missions the scripted pilot lost were beyond
it or beyond anyone, and wanted none that could not be won. The scripted
pilot is a weak pilot (it loses all eight land chapters, chapter 1
included), so its losses alone prove nothing; but tracing every loss found
real faults, fixed here, all at sea:

- **A carrier's fouled deck shut its planes in for good.** At 60 % damage
  the deck takes no plane and launches none; with planes parked on it the
  mission could never end. The deck crew now patch it, a hit point every 40
  moves, until it can be used again (and no further).
- **The H key could fly a plane into a cliff.** The carrier circuit's
  downwind leg ran 520 astern whatever lay there. It now ends 220 short of
  a coast rising astern (never shorter than 300), and every leg keeps 40
  over the ground ahead.
- **Our own ships' flak hit our own planes.** At sea no shell from a ship
  or a raider's gunner hits a plane of its own side.
- **Ships' flak was too deadly to attack through.** The scripted pilot lost
  four or five planes to it in every anti-ship mission. Scatter is now
  18 + 0.14 a unit (from 12 + 0.1); gunnery by difficulty 0.6, 0.85, 1,
  1.15 (from 0.8, 1, 1.12, 1.25); and a ship's guns cannot be laid more
  than about five degrees below level, so a torpedo run low over the water
  is under the big guns (as it was in 1918).
- **The planes-left bonus counted endlessly for a pilot with planes
  without end** (the title's demo pilot, if it ever won a round, and the
  test harness): it counts a full squadron at most. No real game's bonus
  changes.
- **Custom Sortie**: defending the carrier asked for every enemy ship sunk,
  their carrier and destroyer included; it now asks for the raids stopped
  and the torpedo boats sunk. Torpedo boats could, since one torpedo sinks
  a supply ship, sink a convoy before anyone could reach them: the check
  now works out the soonest each boat could fire (patrols and harbours
  allowing) and asks that a pilot could get there first and sink them in
  turn; convoy boats lie in wait nearer their own coast, attack boats come
  on at 0.9 (from 1.1), one behind another, 1, 2, 2 or 3 of them. Later
  variations of a seed ease off until one passes, so every choice and seed
  builds (a sweep of 16,200 sorties; before, a few seeds could not be
  built at all, one of them because our plane guard was put aground).
  Photograph gates are all over their coast now, never under their ships'
  guns (one could sit right over their carrier). Outside a dogfight each
  enemy fighter has a squadron's spares to lose: 2, 3, 4 or 6 by
  difficulty (from endless).
- **The Raid**: the sheds and depots stood 150 from the mountains, too
  close to turn after a bombing run; they are 100 further out. Its fighter
  has three planes to lose (an airship station's last scouts), not
  endless ones.
- **Carrier Duel**: two Hard fighters, endless until their carrier sank,
  at the third round's speeds, with the last raid arriving after five
  minutes. Now one Hard and one Normal, four planes each (a carrier's
  flight of eight), at the second round's speeds, the last strike sent
  from their carrier's side of the sea, earlier, and the briefing
  suggests a torpedo for the carrier.

The scripted pilot learnt to fly at sea as a person would (ashore it
flies exactly as before, so the recorded land battles are unchanged): it
takes raiders from astern outside their gunners' reach, steers round
birds, goes for torpedo boats closing on our ships first, keeps its
torpedo for ships that do not turn away, turns for home by the distance,
keeps clear of planes it fights, breaks off a fight that goes round and
round when it has somewhere to be, and goes home wounded.

Measured after these fixes (`dev/sea-balance.ts`, the scripted pilot with
its five planes unless said):

| | Won |
|---|---|
| At Sea, 8 throws of the dice each | Deck Trials 8, Coastal Strike 7, Convoy Escort 8, Shipping Strike 5, The Raid 2, Intercept 3, Night Recovery 7, Carrier Duel 1 |
| At Sea, as many planes as it needs, 3 each | every mission 3 of 3, Intercept 2 of 3 |
| Custom Sortie, Easy, 6 seeds each | every type: land strike, intercept, convoy, reconnaissance, night landing and both dogfights 6, anti-ship 4, defending the carrier 3 |
| Custom Sortie, Normal, 6 seeds each (fighting like a Brutal pilot) | both dogfights 4 and 6, night landing 5, anti-ship, intercept, convoy and defending the carrier 1 each, land strike and reconnaissance 0 |
| Custom Sortie, Normal, land strike and reconnaissance, as many planes as it needs | 4 of 4 each |

Every mission has been won, and every one that this pilot loses with five
planes it wins given more: what beats it is enemy fighters, as ashore.
