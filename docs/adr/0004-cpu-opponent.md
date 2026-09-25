# ADR 0004 — A CPU opponent that plays like a person

- **Status:** accepted
- **Date:** 2026-09-25
- **Context:** Skyline Showdown (prompt 001)

## Context

The brief asks for a CPU at four levels that plays like a person: an
educated first throw, corrections from where the last banana landed, a
thinking pause and a visible wind-up. It must never solve the trajectory
exactly. Since the engine is deterministic, the "perfect" CPU (search the
simulator for a hit) is trivial to write, and wrong.

## Decision

The CPU (`src/engine/ai.ts`) sees what a player sees and reasons with
schoolbook ballistics, never with the simulator.

1. **First throw.** Distance and height difference to the opponent, a
   preferred angle (45°, higher when a tall building stands in between,
   flatter into a strong headwind), and the no-wind launch speed for that
   angle: `v² = g·d² / (2·cos²a·(d·tan a − h))`. It then allows for a share
   of the wind (its *wind sense*) and adds a guess error.
2. **Watching the banana.** After each throw it works out where the arc
   came down at the target's height. It reads this from the path, or
   continues the last visible motion under gravity if the banana hit
   something or left the screen. This is how a player judges "short by a
   building" or "way long".
3. **Correcting.** It keeps its nearest short and nearest long throw at the
   current angle and aims between them. With only one side known, it
   scales the speed by `√(needed / reached)`, since range grows with v². It
   lobs higher when a building blocked an otherwise good throw, and throws
   flatter when the wind blew the banana back.
4. **Whole numbers.** Velocity can only be typed as an integer. In low
   gravity one step moves the landing further than a gorilla is wide, so
   the CPU rounds the velocity and lets the angle absorb the difference
   (range ∝ v²·sin 2a).
5. **Hand shake.** Every planned throw gets Gaussian noise on angle and
   speed.

Difficulty only changes the numbers:

| | Guess error | Wind sense | Correction | Shake (angle / speed) | Thinking |
|---|---|---|---|---|---|
| Easy | 22 % | 0 % | 50 % | 3.5° / 5 % | 1.2–2 s |
| Normal | 14 % | 45 % | 75 % | 2° / 3 % | 0.9–1.6 s |
| Hard | 9 % | 70 % | 88 % | 1.2° / 1.8 % | 0.7–1.2 s |
| Brutal | 6 % | 85 % | 95 % | 0.7° / 1 % | 0.5–0.9 s |

The session shows the thinking pause, then swings the arm and the angle and
power readout to the planned values over 0.9 s before letting go.

## Measured (engine tests, 160 cities each)

| | Median throws to hit | Mean | First-throw hits |
|---|---|---|---|
| Easy | 6 | ~9 | ~6 % |
| Normal | 4 | ~5.5 | ~9 % |
| Hard | 3 | ~4 | ~12 % |
| Brutal | 2 | ~3.2 | ~18 % |

`ai.test.ts` asserts the ordering, Normal's median of 5 or fewer, Brutal's
median of 3 or fewer, and that no level ever lands every first throw.

## Balance playtest (300 simulated first-to-3 matches per pairing)

An "average player" was modelled as the Normal CPU typing exact numbers,
and a strong player as Hard.

| Player \ CPU | Easy | Normal | Hard | Brutal |
|---|---|---|---|---|
| Average player wins | 86 % | 55 % | 31 % | 14 % |
| Strong player wins | 96 % | 80 % | 60 % | 38 % |
| Throws per match (average player) | 28 | 24 | 20 | 16 |

Throwing first in a match between equals is worth 49–54 % at Easy to Hard
and 59 % at Brutal, where rounds are often over in two or three throws.
That comes from the original's alternating turns and is kept. No tuning
was needed after these runs.

The browser playtest (`e2e/cpu.playtest.ts`) plays full first-to-3 matches
through the real UI at every level, on two seeds, with the average player
typing its throws. It checks the page's score against the rules after
every throw. Last run: all 8 matches in sync.

| Seed | Easy | Normal | Hard | Brutal |
|---|---|---|---|---|
| 101 | player 3–2 (29 throws) | CPU 3–1 (16) | CPU 3–1 (16) | CPU 3–1 (14) |
| 202 | player 3–0 (7) | player 3–0 (7) | player 3–0 (7) | player 3–0 (7) |

Seed 202 happens to be a run of open cities where the player lands early
throws; seed 101 shows the ladder.

## Consequences

- The CPU is fair in a readable way: players can see it walk its shots in,
  just as they do.
- It still reads exact distances where a person judges by eye. To even that
  out for people, the **Aim assist** setting draws the first third of the
  throw being aimed (not its landing), using `previewTurn`, the same
  simulation the throw itself runs. A hidden key (C) shows the whole path
  against the CPU as a practice aid. The CPU never gets either.
- Tuning is a table of numbers.
- It does not plan around power-ups beyond simple rules (shield at once,
  Calm Air in strong wind, attack power-ups once it is close).
- Some cities hide a gorilla behind a tower where only a steep, precise lob
  works. The CPU gets there by raising its angle or tunnelling through, but
  can take many throws. This is rare (about 1–2 % of rounds on Normal).
