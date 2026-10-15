# ADR 0021 — Rival Driver's CPU: human limits, different intentions

- **Status:** accepted
- **Date:** 2026-10-15
- **Context:** Donkey Dash (prompt 007, backlog DD-01)

## Context

Rival Driver can be played against a CPU at four levels: Easy only avoids
danger; Normal sometimes blocks; Hard reads the road ahead and sets
deliberate traps; Brutal sets traps and escapes yours, but still makes the
occasional human mistake. The CPU must see exactly what a human sees (the
same sight window) and react with a human-like delay. Each level needs a
name and a car, and tests must show that each level behaves as described.
Normal should feel fair; Brutal sharp, not cheating.

## Decision

1. **One driver, four styles.** `createRivalDriver(style, side, seed)`
   drives one side of a `RivalState`. A `DriverStyle` sets its
   `reactionSeconds`, its `pressGap`, where it looks for traps (`never`,
   one lane over, or `anywhere` it can reach), its `trapChance`, whether it
   is `wary`, and two kinds of mistake: `hesitation` (a pause of 0.05 to
   0.2 s before a press) and `blunder` (misjudging a whole row and doing
   nothing).
2. **The same eyes as a player.** It only acts on donkeys that are
   revealed and, for the levels that read the road, on lane ends whose
   sign is in view, and only once each has been in view for its reaction
   time. It never looks at the planner, the seed or anything beyond the
   sight line; a test shuffles every hidden donkey and checks that its
   decisions do not change.
3. **The planner's own search.** For the nearest row it first looks for a
   trap: a lane that is safe for itself, that it can reach in time with its
   own press gap, that would leave the rival no way past the row (by
   `reach.route` with the CPU's car as a wall), while the rival still has a
   way now. Whether it goes for a trap it has spotted is rolled once per
   row against `trapChance`. Otherwise it takes the shortest way past the
   row with the rival's car as a wall, or, if boxed in, heads for a safe
   lane anyway. With nothing in view it leaves a lane that is ending, and a
   wary driver waits in the middle lane, where it cannot be boxed in
   against the edge. A wary driver also never hesitates when fleeing.
4. **No rubber band.** The CPU's speed, sight and reactions never depend
   on the score. Everything it does comes from a seeded generator, so a
   match replays exactly, in Node and in the page.
5. **Characters.** Easy is Dotty Dawdle in a mint beetle, Normal is Rusty
   Rowe in a butter-yellow pickup, Hard is Vera Vroom in a cherry roadster
   and Brutal is The Baron in a midnight camper, each with their own horn.

| Level | Reaction | Press gap | Traps | Trap chance | Wary | Hesitation | Blunder |
|---|---|---|---|---|---|---|---|
| Easy | 0.50 s | 0.22 s | never | — | no | 30 % | 5 % |
| Normal | 0.42 s | 0.19 s | one lane over | 35 % | no | 22 % | 3 % |
| Hard | 0.36 s | 0.17 s | anywhere, lane ends too | 70 % | no | 18 % | 2.5 % |
| Brutal | 0.32 s | 0.16 s | anywhere, lane ends too | 90 % | yes | 14 % | 2 % |

## Alternatives considered

- **Rubber-banding** the CPU to keep matches close. It is the classic way
  for a racing AI to feel like cheating. Rejected.
- **Perfect play with injected errors.** A CPU that sees the whole road and
  then randomly fails reads as random, not human. Rejected for limits on
  what it sees and how fast it acts.
- **Scripted traps** placed by the planner for the CPU. They would be
  cheating by another name, and a human could never set the same ones.
  Rejected: the CPU only traps with the same information and buttons as a
  person.

## Consequences

- Behaviour tests (`rival.test.ts`) play each level against Easy over 16
  seeded matches: Easy never goes for a trap; Normal tries a few a minute
  and Hard more; crash rates fall level by level and never reach zero; and
  wins against Easy rise with the level. Each level alone, without its
  mistakes, drives a whole road without a crash.
- The playtests race every level against every other, and two scripted
  humans against each level. A casual phone player wins about 70 % against
  Easy, 38 % against Normal, 23 % against Hard and hardly ever against
  Brutal; a quick player who holds the middle lane beats Brutal about 60 %
  of the time. Brutal can be beaten by playing well, which is the point.
- The CPU reuses `reach.ts`, so any change to the press rules or the road's
  shape reaches the planner, the autopilot and the CPU together.
