# ADR 0026 — Mind the Ox is a clean reimplementation of Sopwith

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Mind the Ox (prompt 011, backlog MO-01)

## Context

Mind the Ox is inspired by *Sopwith* (David L. Clark, BMB Compuscience
Canada, 1984–87), whose C and assembler source was released under the GNU
GPL version 2 in 2003 and sits in `sources/Sopwith/`. Every other NeoArcade
port so far was based on a program whose rights situation made a new
program the only option. Here a GPL source exists, and translating it
would have been the quickest way to an exact game; but a translation is a
derivative work, and the GPL would then govern the port and, through the
shared build, arguably the arcade around it.

The owner decided: **a clean reimplementation**. The game should play
like 1984 because its behaviour was studied, not because its code was
copied.

## Decision

1. **Read, describe, then write.** The 1984 source was read for
   behaviour only. What it does is written down in our own words in
   [`docs/games/mind-the-ox.md`](../games/mind-the-ox.md) (timing, flight,
   fuel, weapons, collisions, scoring, rounds, the computer pilots, the
   bugs). The engine in `ports/mind-the-ox/src/engine/` was then written
   fresh from those notes, in TypeScript, with its own structure (an
   immutable-ish world stepped at 60 ticks a second, five ticks to 1984's
   "move", capsules and boxes instead of pixel masks, a seeded generator
   instead of a random table).
2. **No data crosses over.** Not the 3,000-value ground table, not the
   target positions or kinds, not the sprite bitmaps, the sound tables, the
   fixed random table or the title screen. Every battlefield is generated
   from a seed (`engine/map.ts`) or drawn by hand for the campaign
   (`game/campaign.ts`); every picture and sound is made by code.
3. **Numbers that define the feel are measured, not copied.** Where a
   constant is the game's character (twelve moves a second, sixteen
   headings, speeds 4 to 8, 9,000 fuel, 200 rounds, five bombs, the scores)
   it is restated as a fact about how the game behaves, in our units, with
   a comment saying so. These are facts about gameplay, not expression.
4. **Credit, not branding.** The credit line is "Inspired by Sopwith by
   David L. Clark, BMB Compuscience Canada, 1984." It appears on the title
   card, in the README, in ABOUT and in CREDITS. "Sopwith" is never the
   product's name. ABOUT tells the history and where the GPL source can be
   found; `CREDITS.md` states that no code or data was copied.
5. **The earlier remake notes are not instructions.**
   `sources/Sopwith/PREVIOUS-REMAKE-NOTES.md` and `sources/Sopwith/docs/`
   belong to an unrelated plan (pixel-faithful, copied sprites). Where they
   disagree with the source, the source wins; their rules were not followed.

## Consequences

- The port is NeoArcade's own code under the repository's terms, and the
  Hall can bundle it like any other game.
- Exactness is behavioural: a test pins each rule the notes describe
  (stall, gravity on speed, fuel, refuelling, weapons, craters, scoring,
  escalation), but no claim is made that a recorded 1984 game would replay
  move for move. Where we chose differently (smooth flight, real landings,
  scoring by side, the bugs fixed), the diff log says so.
- Anyone extending the port must keep to the same rule: read the 1984
  source for what it does, never paste from it.
