# ADR 0013 — The Daily Skyline: one city a day, from the date alone

- **Status:** accepted
- **Date:** 2026-09-29
- **Context:** Skyline Showdown, Daily Skyline (prompt 004); builds on
  [ADR 0009](0009-daily-challenges.md) (`@shared/daily`) and
  [ADR 0012](0012-skyline-determinism.md) (engines that agree)

## Context

The Daily Skyline gives everyone on Earth the same city, wind and target on
the same day: you against a still gorilla, as few throws as possible, ten
at most, one scored attempt. There is no server, so the day's puzzle must
come out of the date, every browser must build the same one, and the
result must be kept honestly in the player's own browser.

## Decision

**The seed.** `@shared/daily` gives each UTC date a number and a seed
(FNV-1a of `"skyline-showdown:YYYY-MM-DD"`). Daily #1 is **2026-09-29**, the
day the mode launched; a device whose clock reads earlier gets Daily #1.

**From seed to city** (`src/daily/daily.ts`), all with `@shared/rng`:

1. `world` = one of Earth, Moon, Mars, Jupiter.
2. `twist` = one *light* twist allowed on that world: gusts, drone,
   supertall, jet stream, hillside, springy roofs or dust devil. Heat haze
   is left out (it would hide the very wind the share line shows), and so
   is lightning (it reshapes too much for ten throws). The Moon has no air
   to gust, stream or whirl.
3. `roundSeed` = the next integer from the same generator.
4. The round is `createRound(1, roundSeed, …)`, the same function every
   match uses, with the rules `solo` (the target never throws) and
   `throwLimit: 10`; power-ups are off. The wind is the round's own roll.

A test plays the first 120 dailies and finds a first-throw hit in every
one; the determinism test builds a whole year of them in Chromium, Firefox
and WebKit and compares every city, wind and a sample throw with Node.

**One scored attempt.** The day's result is kept with `createDailyLog` (one
entry per day, `record()` refuses a second). While the attempt is under
way, every throw is written to `neoarcade:skyline-showdown:daily-run`, so
leaving the page, even mid-flight, does not grant a second try: the next
visit replays those throws (the engine is deterministic) and carries on.
The pause menu offers no restart for a scored attempt. After it, practice
runs are unlimited and never recorded.

**The share line** says how it went and never how it was done:

```
Skyline Showdown · Daily #16 · Moon 🌬️ calm
🍌🍌💥  3/10
```

A banana per miss, 💥 for the hit, 🙈 for hitting yourself, `X/10` when
there was no hit. No angles, no powers, no landing spots.

**Challenges from a daily** come only from practice runs, so a scored
attempt's winning throw is never handed out by the game itself.

**Aim assist** is off in the daily for everyone, so every share line means
the same thing.

## Consequences

- Changing the daily generator, the list of light twists or the engine's
  rules changes today's puzzle for everyone at once, and old results can
  no longer be replayed on the results screen. Such changes ship between
  days and bump the rules (ADR 0014).
- Results live in one browser. A friend's result exists only as the text
  they share.
- The launch date is part of the contract: changing it renumbers every
  daily.
- Everyone gets the day at UTC midnight; the page shows when that is in
  the player's own time.
