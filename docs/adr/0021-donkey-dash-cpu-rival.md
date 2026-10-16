# ADR 0021 — Rival Driver's CPU: human limits, different intentions

- **Status:** accepted; amended 2026-10-16 by the surge (decisions 6 to 8)
- **Date:** 2026-10-15
- **Context:** Donkey Dash (prompt 007, backlog DD-01; prompt 015, DD-03)

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

- Behaviour tests (`rival.test.ts`) play each level against Easy over 32
  seeded matches: Easy never goes for a trap; Normal tries a few a minute
  and Hard more; crash rates fall level by level and never reach zero; and
  wins against Easy rise with the level. Each level alone, without its
  mistakes, drives a whole road without a crash.
- The playtests race every level against every other, and two scripted
  humans against each level. A casual phone player wins about 65 % against
  Easy, 38 % against Normal, 20 % against Hard and 10 % against Brutal; a
  quick player who holds the middle lane beats Brutal about half the time.
  Brutal can be beaten by playing well, which is the point.
- The CPU reuses `reach.ts`, so any change to the press rules or the road's
  shape reaches the planner, the autopilot and the CPU together.

## Amendment: the CPU and the surge (2026-10-16, prompt 015, DD-03)

### Context

With the surge (ADR 0020, decisions 8 to 13) a car can ride Ahead, cut
across a Level car's bonnet and drop back, and a Level car can shut the
door behind a car Ahead. The owner decided that Hard and Brutal surge
too: to slip past a block, to take a lane the player wants, and to sit in
the player's Level slot so the player cannot drop back. Easy never
surges; Normal rarely, and only to escape.

### Decision

6. **The same eyes, from its own nose.** The CPU sees the road from where
   its car is (`viewFrom`): riding Ahead, a donkey comes into view no
   earlier but nearer, as it would for a person, and its search treats the
   other car as a wall only when they share a row. It does nothing while
   its own surge or drop back is under way.
7. **Surging is a style.** `surging` is `never` (Easy), `escape` (Normal)
   or `tactical` (Hard, Brutal), and `surgeChance` (0, 30, 60, 85 %) is
   rolled once per chance. With nothing in view, in this order:
   - Ahead: carry on **cutting across** to the lane it surged for, one
     lane at a time while that lane is free Ahead, then go **back to
     Level**, trying once even when the door is shut, as a person would,
     and then waiting. Hard and Brutal stay Ahead while the rival rides
     Ahead beside them, where they can still box it in.
   - Level: **shut the door** (tactical: move into the lane behind a rival
     riding Ahead, when it can), **follow** the rival Ahead (tactical),
     **unpin** (escape and tactical: beside the rival against the edge of
     the road, surge, cut across and drop back on the far side), then, for
     a wary driver, the middle lane.
   With a row in view, a trap and an escape come first as before; a
   tactical driver that is safe where it is past everything in view
   follows a rival Ahead even then.
8. **Two knobs for people, not for the CPU.** `reactionSpread` (up to
   that much longer, at random, to react to each thing) and `ridesAhead`
   (how much it likes riding Ahead for the bonus) are 0 for every CPU
   level and exist for the scripted humans of the playtests: people are
   not metronomes, and some like the bonus.

| Level | Surging | Surge chance | Surges a minute against Easy | Rows passed Ahead |
|---|---|---|---|---|
| Easy | never | — | 0 | 0 % |
| Normal | to escape | 30 % | about 1.6 | 4 % |
| Hard | tactical | 60 % | about 3.2 | 15 % |
| Brutal | tactical | 85 % | about 4.1 | 14 % |

Against a player who rides Ahead much of the time, Hard and Brutal surge
six or seven times a minute, and the player's crashes straight after a
refused drop back (doors shut) come about two and a half times as often
as against Easy, who only ever sits there by chance (60 and 58 against
24 over 32 matches).

### Alternatives considered

- **A CPU that rides Ahead for the bonus.** It made the CPU levels harder
  to tell apart and gave the player nobody to shut a door on. The CPU
  surges for a reason, and comes back.
- **Letting the CPU surge in the middle of a row.** A person who surges
  just as donkeys appear is punished by the 0.4 s commitment; a CPU that
  timed it perfectly would be cheating by another name. It surges with
  nothing in view, or, when following, only when already safe past
  everything in view.

### Consequences

- The behaviour tests add: no surges on Easy, some on Normal, at least
  half as many again on Hard and Brutal; Hard and Brutal pass between 5 %
  and 50 % of their rows Ahead; no CPU ever presses a lane change mid-surge
  or off the road (`busy` and `edge` bumps); Hard and Brutal shut the door
  on a rider more than half as often again as Easy does by chance.
- A scripted phone player who never surges wins about 63 % against Easy,
  39 % against Normal, 25 % against Hard and 7 % against Brutal over 100
  matches, close to the numbers before the surge; the full table is in
  ADR 0020 and the game notes.
