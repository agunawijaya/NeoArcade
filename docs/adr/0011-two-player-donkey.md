# ADR 0011 — Donkey vs Driver: a second player steers the donkey, fairly

- **Status:** accepted
- **Date:** 2026-09-28
- **Context:** Donkey Dash (prompt 005)

## Context

The 1981 game was already "Donkey versus Driver", with the computer
throwing donkeys at random. The brief turns the donkey into a player: one
person drives, the other decides where each donkey drops, and they swap
every point. Two constraints pull against each other. The donkey player
should be able to feint and bluff, or the role is boring. The driver must
always have a fair chance, or the role is miserable. And both must play
with one button each, on one keyboard, one screen or two gamepads.

## Decision

1. **One button toggles the lane.** The donkey player's press moves the
   donkey one lane right (wrapping round), before it appears and while it
   approaches, with a little hop. Between waves the press sets where the
   next donkey drops, shown as a marker at the far end of the road.
2. **A commit line.** At `VERSUS_COMMIT_SECONDS` (0.45 s) before it would
   reach the car, the donkey commits and stops taking orders. The line is
   drawn across the road in every view, moving with the car. Feints happen
   above it; the driver always gets 0.45 s after it.
3. **A slower road than Classic Duel.** At the Classic Duel speed, the
   original's climb shrinks the window to 0.30 s by the top of the road,
   less than the commit window. Donkey vs Driver runs at 13.5 m/s instead,
   so that even on the eleventh donkey the donkey is visible before it
   commits (`duel.test.ts` checks this for every climb). Near the top of the
   road there is little room left to feint: the Driver has earned that.
4. **Original scoring.** A crash is a point for whoever is the donkey; a
   climb to the top is a point for whoever drives. Roles swap every point;
   first to N wins (the same setting as Classic Duel).
5. **Inputs split by player, not by role.** Player 1 owns the left half of
   the keyboard (and Space), the left half of a landscape screen (the
   bottom half of an upright one, so the phone can lie between two people)
   and the first gamepad; Player 2 the rest. Roles swap, hands stay put.

## Consequences

- The donkey player's feints are part of the engine (`steerDonkey` in
  `duel.ts`), so they replay deterministically from a seed and inputs like
  everything else.
- A player who never presses leaves the donkey where it dropped: a fair
  50/50 against a driver who guesses, like 1981.
- Hazards in Donkey vs Driver are limited to mud and three-lane waves, the
  ones a second player's donkey can use without making the commit line
  unfair.
