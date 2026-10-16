# ADR 0035 — Mind the Ox's Custom Sortie: missions from choices and a seed

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Mind the Ox, Carrier Ops (prompt 016); follows
  [ADR 0033](0033-mind-the-ox-sea-and-ships.md) and
  [ADR 0034](0034-mind-the-ox-deck-model.md)

## Context

Beside the eight hand-made At Sea missions the prompt asks for a mission
generator: the player chooses where to fly from, the kind of mission,
where the enemy flies from, the sea, the time of day, the difficulty and
the theme, and a seed builds the coast, the fleets and the waves. Every
mission it builds must be winnable, and a sortie must be shareable as a
link. Some Daily Sorties are to be flown at sea too.

## Decision

1. **A pure function of choices and seed** (`game/sortie.ts`):
   `buildSortie(options)` lays out their coast on the left and ours (or open
   sea) on the right, places the fleets in their own halves of the sea, adds
   what the mission needs (shore targets, a squadron, a convoy and torpedo
   boats, raids, photo gates) and mirrors the whole layout for half the
   seeds. Some missions settle a choice themselves (a carrier dogfight needs
   the enemy at sea; a night landing is at night).
2. **Validated before it is offered.** `sortieProblems` builds the map
   (which runs every fairness check a hand-drawn map gets) and adds the
   generator's own: something to take off from, a deck that can be landed
   on in that sea, every objective point within a full tank there and back
   with fuel to spare, every objective possible, raids that arrive late
   enough to meet, torpedo boats a pilot can reach (one after another)
   before the soonest any of them could fire on one of ours, photograph
   gates clear of their ships' guns, a convoy that arrives in time. A seed
   whose layout fails is tried again with a variation (attempt 1, 2, …) of
   the same seed, so a code always builds the same mission; after the
   first eight each variation is kinder than the last (boats slower and
   further off, raids later, at the last one boat fewer), so every choice
   and seed finds a fair sortie. The test suite builds 1,350 sorties across
   every choice, and a sweep of 16,200 found none it could not build.
2a. **Winnable, not only fair** (after the owner asked that no mission be
   unwinnable). Defending the carrier asks for the raids stopped and the
   torpedo boats sunk, not their whole fleet; outside a dogfight each enemy
   fighter has a squadron's spares to lose (2, 3, 4, 6 by difficulty), not
   endless planes, so a pilot who brings down enough clears the sky.
3. **A seven-letter code and the seed** (`c b b 1 d n 0 - 1h8`): base,
   mission, enemy origin, sea state, hour, level, theme, then the seed in
   base 36. `?sortie=<code>` opens the Custom Sortie screen with it, ready
   to fly; the results card offers the link to share.
4. **Naval Daily Sorties from #3.** From Daily Sortie #3 a day whose seed
   divides by three is flown at sea: the day's seed builds a sortie (a
   mission from a fixed list of six, off our carrier, normal pilots, the
   landing assist on, the briefing's loadout), the same for everyone
   whatever their settings. Days #1 and #2 were on land and stay so, so
   every result already recorded is still for the same battle.

## Consequences

- The generator only builds what the engine already has: a new mission
  type is a new arrangement of ships, targets, raids or gates and a set of
  objectives, plus a briefing.
- Validation is about fairness, not difficulty. `dev/sea-balance.ts`
  flies sorties with the scripted pilot (a weak pilot: it loses every
  chapter of the land campaign) at each difficulty, with the reason for
  every loss, and with `--endless` as many planes as it needs, which
  separates a mission nobody could finish from one this pilot cannot
  finish with five. The numbers are in `docs/games/mind-the-ox.md`.
