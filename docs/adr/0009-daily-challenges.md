# ADR 0009 — Daily challenges without a server, and engines that agree bit for bit

- **Status:** accepted
- **Date:** 2026-09-28
- **Context:** Donkey Dash (prompt 005); written so Skyline Showdown's Daily
  Skyline (prompt 004) can use the same pieces

## Context

A "daily" mode gives everyone the same challenge on the same day, one scored
attempt, a streak to keep and a line of text to share with friends. NeoArcade
has no server (ADR 0001) and no accounts, so the day, the seed, the history
and the share must all come from the browser. Two games want one, so the
common part belongs in `shared/`.

A daily only works if the same seed gives the same challenge in every
browser. JavaScript engines agree on `+ − × ÷` (IEEE 754 requires correctly
rounded results) but not necessarily on `Math.sin`, `cos`, `exp`, `pow`,
`log` or `sqrt`, whose last bits are left to the implementation.

## Decision

### `@shared/daily`

- **UTC dates.** `dayKey(date)` is the UTC date as `YYYY-MM-DD`; the daily
  changes at UTC midnight for everyone, and `nextDailyAt()` tells the game
  when, so it can show the player's local time.
- **Numbers and seeds.** `dailyChallenge({ game, launch })` gives each date
  a number (1 on the launch date) and a seed: FNV-1a of `"<game>:<date>"`,
  the same hash `@shared/rng` uses for text seeds. Two games never share a
  seed.
- **One scored run a day.** `createDailyLog(store)` keeps one result per day
  key in the game's own store; `record()` refuses a second one. What a
  result holds is the game's business.
- **Streaks.** `streakOf(days, today)` counts consecutive UTC days; a streak
  survives until the end of the day after its last run, so the evening
  before is not a loss. The best streak is worked out from the whole log,
  so nothing extra is stored.
- **Calendar.** `monthGrid(year, month)` lays a month out in Monday-first
  weeks of day keys, for the game to draw.
- **Sharing.** `shareText(text)` opens the device's share sheet where there
  is one and copies otherwise; `copyText()` always copies. Both report what
  happened, and never throw.

The share line is the game's to design, with one rule: no spoilers. Donkey
Dash shares distance, crashes and a strip of ten squares for the ten
stretches of road (clean, near misses, a crash, not reached), never where
the donkeys stood.

### Engines that agree

A game with a daily keeps its engine to arithmetic every browser rounds the
same way: `+ − × ÷`, comparisons, `Math.floor/round/min/max/abs`, integer
maths and `@shared/rng`. Curves are built from those (Donkey Dash's speed
ramp is `start + (max − start) · k / (k + ramp)`), never from `exp` or
`pow`. Donkey Dash enforces this with a test that scans its engine sources
for the forbidden functions (`planner.test.ts`).

It also proves it: `engineFingerprint()` hashes the exact bits of every
position and event of a set of seeded runs and matches; the port's
`e2e/engine.determinism.ts` bundles it and runs it in Chromium, Firefox and
WebKit and compares each with Node. At the time of writing all four agree
(Chromium, Firefox 148 and 155, WebKit 26.6).

## Consequences

- A daily can never be "patched" mid-day: a change to the engine or the
  road planner changes everyone's road at once, which is fine on a new day
  and confusing within one. Ship engine changes, and read old results, with
  that in mind.
- Results live in the player's browser only. A friend's result exists only
  as the text they share.
- The launch date is part of the contract: changing it renumbers every
  daily.
- Running the determinism test needs Playwright's Firefox and WebKit:
  `npx playwright install firefox webkit`.
