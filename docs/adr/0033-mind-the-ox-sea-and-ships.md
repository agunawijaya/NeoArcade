# ADR 0033 — Mind the Ox at sea: water, ships and raids in the same engine

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Mind the Ox, Carrier Ops (prompt 016, backlog MO-02); builds
  on [ADR 0026](0026-mind-the-ox-clean-room.md) (a clean, deterministic
  engine) and [ADR 0028](0028-mind-the-ox-camera-views.md) (two views over
  one engine)

## Context

The owner asked to take Mind the Ox to sea: open water and coasts, ships
that move, fight back and sink, planes that can come down in the water,
torpedoes, and bombers and airships that raid our carrier. 1984 had none
of it, and every existing mode (Classic 1984, the land campaign, Dogfight,
Two players, the Daily Sortie) had to keep its rules and its engine
fingerprints. The engine is a pure, seeded module checked bit for bit in
Node, Chromium, Firefox and WebKit.

## Decision

1. **Water is part of the map, not a new world.** A map may carry `sea`:
   stretches of water between two shores (a beach or a cliff). `buildMap`
   floods those columns to one flat sea level and shapes the shores; the
   engine's terrain answers `isWater(x)`. Bombs into water splash (no
   crater), wrecks over water ditch. Swell is only drawn: the engine keeps
   the sea flat, so collisions and the bot never see a wave. Land maps have
   `sea: null` and nothing in their code path changes.
2. **Ships are world entities with their own module** (`engine/fleet.ts`
   for the classes, `engine/ships.ts` for movement, damage and guns):
   carrier, battleship, cruiser, destroyer, supply ship, torpedo boat and
   monitor, each with length, freeboard, draft, hit points, speed and
   anti-aircraft guns. They patrol between two points or steam for a
   destination (a convoy), turn at the ends (foreshortening along the line
   of play as they come round), ride the swell, settle and list as they
   sink. Their hit boxes are a hull and, where they have one, a
   superstructure amidships.
2a. **Damage shows, and torpedoes decide** (after the owner's review). Every
   heavy blow is kept on the ship where it landed (`Ship.wounds`, in the
   hull's own frame) so both views can draw the hole and the fire there,
   and the water it lets in settles the hull and slows it (`flooded`, in the
   engine, so the deck and hit boxes go down with it). Trim, list and fire
   are drawn only. One torpedo sinks anything up to a cruiser, a battleship
   or a carrier takes two, and a bomb does twice what it first did, so five
   on target sink a battleship. The rule is the same for both sides: our
   carrier also goes down to two torpedoes.
2b. **Warships carry searchlights.** The enemy's battleships, cruisers and
   monitors sweep the sky at night like their airfields, from their
   foremast; every night mission at sea uses the night raid's rule, in
   which the enemy sees only what a beam finds or what comes close.
2c. **Their guns never hit our own, and cannot be laid far below level.**
   At sea no shell from a ship or a raider's gunner hits a plane of its
   own side, and a ship's guns go no lower than about five degrees below
   level, so a torpedo plane low over the water a way off is under them.
   With softer scatter and gunnery by difficulty (see the tuning notes),
   an attack on a squadron costs planes but not all of them.
3. **Torpedoes and raids are their own small modules** (`torpedo.ts`,
   `raiders.ts`). A torpedo runs at a fixed depth: it passes under a hull
   that draws less water, and a destroyer, cruiser or torpedo boat that
   sees one coming turns end-on to comb it. Raids are scheduled waves of
   bombers or an airship that fly to one ship and bomb it once.
4. **Missions say what wins them** (`objectives.ts`): targets, shore,
   ships, planes, raiders, escort, gates, touch-and-go and land-aboard. A round with
   objectives is won when all are met and lost when one cannot be
   (most of an escorted convoy gone, or a ship flagged `protect` lost).
   Rounds without objectives are won on targets, exactly as before.
5. **Our planes pass our own ships.** In a side-on world a plane at
   mast height would otherwise fly into its own escort the moment it left
   the deck; only a plane coming down (or one flown into its own carrier's
   side) hits one of ours. Enemy ships are solid.
6. **Theme is presentation only**, as in ADR 0027: an Airshow "target
   barge" is a battleship with bullseye boards for turrets, a cartoon
   flat-top is a carrier in cyan. The rules are the same in every theme.

## Consequences

- The sea scenario was added to the engine fingerprint as a fourth battle;
  the three land battles' fingerprints are pinned in
  `fingerprint.test.ts` and stayed the same, except for the one deliberate
  change recorded in the diff log (the autopilot fix).
- Both views draw the sea from the same map and the same ship layouts
  (`render/ship-shapes.ts`), so the side view and the diorama always agree
  on where a funnel stands or how long a hull is; the wounds are painted by
  the same code in both (`render/side/wounds.ts`).
- The diorama's distant fleet on the horizon is scenery only, placed from
  the map's seed; the engine has no ships there.
- Gameplay numbers for ships (gun reach and rate, torpedo damage, carrier
  hit points) are tuning: the current values and the playtests that set
  them are in `docs/games/mind-the-ox.md`.
