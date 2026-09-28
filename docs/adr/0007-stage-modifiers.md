# ADR 0007 — World Tour twists are data the engine interprets

- **Status:** accepted
- **Date:** 2026-09-28
- **Context:** Skyline Showdown, World Tour (prompt 003)

## Context

The World Tour gives every city a twist: gusts that change the wind after
every throw, a patrolling drone, a supertall tower with a jet stream over
it, a hidden wind gauge, a hillside, springy ground, a dust devil,
lightning. The brief is firm that the duel itself must not change, that
the engine stays pure, seeded and deterministic, and that each twist is
data with tests.

Two designs were possible:

1. **Stage scripts.** Each stage owns code that pokes at the match (move
   this, change that) from the game layer.
2. **Modifiers as data.** A stage lists twist kinds; the engine knows what
   each kind means and applies it at fixed points of a match.

## Decision

Twists are data (option 2). A stage is a plain record in
`src/tour/stages.ts` with `twists: TwistKind[]`, and `MatchOptions` carries
that list into the engine. `src/engine/twists.ts` defines the kinds and
everything they decide; the engine interprets them at four fixed points:

| When | Where | What |
|---|---|---|
| A round's city is built | `createRound` → `patternFor`, `shapeCity` | *hillside* picks a steep slope; *supertall* raises the middle tower |
| A round starts | `hazardsFor`, `pickLightningTarget` | the drone's rail, the jet stream's band and wind, the dust devil, springy ground, the first lightning mark |
| During a throw | `simulateShot` (`airAt`, `touch`, bounces) | zones change the sideways push (the flight re-segments where it crosses one, so paths stay closed-form); the drone stops bananas; springy ground adds a bounce |
| Between throws | `playBetweenThrows` | the drone moves on, the dust devil wanders, *gusts* shift the wind, lightning strikes the marked roof and marks the next |

*hiddenWind* changes nothing in the physics: the HUD hides the gauge and
the CPU reads only a share of the wind.

Everything a twist rolls comes from the round's own generator, after the
rolls a twist-less round makes. A Quick Match (no twists) therefore
consumes exactly the same random numbers as before, and old `?seed=` links
replay the same cities.

The turn result reports what happened between throws (`BetweenThrows`:
a new wind, a strike and its crater) and the hazards as they were during
the throw, so the session can show a gust arriving and a bolt landing after
the banana has come down, instead of before.

## Consequences

- A stage is a few lines of data; new stages need no code.
- Every twist is tested in `src/engine/twists.test.ts` (placement, timing,
  the push inside a zone, determinism, old seeds unchanged) and every stage
  is checked in `src/tour/tour.test.ts`.
- Adding a twist means touching the engine: a kind, its data, and its hook
  at one of the four points. That is deliberate: the engine is where rules
  live.
- Hazards are drawn by `render/hazards.ts` from the same data, so what a
  player sees is always what the engine uses.
- The suggested "bouncy street" on the Moon did not survive testing: in a
  city packed with buildings the street is only exposed in 2-unit gaps, so
  it almost never triggered. It became *springy ground* (every banana
  bounces once off the first building it hits), reusing the Bouncer's
  bounce.
- Gusts first re-rolled the wind from scratch every throw. Playtests showed
  that made gust stages long lotteries for people and the CPU alike, so a
  gust now shifts the wind by 2–5 notches (scaled by the world's air).
