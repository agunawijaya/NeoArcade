# 004 — Skyline Showdown: Trick Shot, Daily Skyline and challenge links

## Read first

1. `CLAUDE.md`, `docs/ARCADE-PASS.md`.
2. `ports/skyline-showdown/docs/ARCHITECTURE.md` (as updated by 003), the
   stage-modifier model, and the port's code.

## Goal

Three short-session modes that bring players back every day and let them
challenge friends — all without a server:

1. **Trick Shot** — hand-made one-throw puzzles.
2. **Daily Skyline** — the same city, wind and target for everyone, every day.
3. **Challenge links** — share a great shot as a URL; a friend must match it.

## Hard rules

- No backend. Everything is derived from seeds, dates and the URL.
- Same engine, same physics. Puzzles and dailies are data.
- **Cross-browser determinism is required**, because a daily or a link must
  play out identically for everyone. Before building the modes, run the
  same seeded matches in Chromium, Firefox and WebKit via Playwright and
  compare every step. If `Math.sin/cos/pow` or anything else diverges, swap
  in deterministic implementations inside the engine and record it in an ADR.
- Zero raster assets; light and dark; reduced motion.

## 1. Trick Shot

- 24 puzzles in 4 packs of 6 (e.g. "Warm-up", "Wind Readers", "Trick Arcs",
  "Impossible?"). Each puzzle: fixed city (seed or hand-edited terrain),
  wind, world, a target (dummy gorilla, crate, bell on a roof, a gap to
  thread), optional rule ("must pass through the sun", "must bounce twice",
  "Tri-Banana: all three must land"). One throw per attempt, unlimited
  attempts, instant retry (a single key / tap).
- Stars: solve it (1), solve it in ≤ N attempts (2), style goal (3) — e.g.
  land within 1 m of the bullseye.
- Puzzle format: a small typed data file per pack, validated in tests; every
  puzzle has a stored **reference solution** that the test suite replays to
  prove it is solvable.
- A dev-only puzzle preview route to iterate on designs quickly.

## 2. Daily Skyline

- Seed from the **UTC date**, so everyone worldwide gets the same puzzle.
  The page shows when the next one arrives in local time.
- Format: you vs a still target gorilla across a generated city with that
  day's world, wind and one light twist from the stage-modifier set. Hit it
  in as few throws as possible, maximum 10. One scored attempt per day;
  practice runs after that don't count.
- Results screen: throws used, the path of every throw overlaid, a
  **shareable text** like:

  ```
  Skyline Showdown · Daily #142 · Mars 🌬️ ←3
  🍌🍌🍌💥  4/10
  ```

  (no spoilers — it must not reveal angles or velocities). Copy button and
  the Web Share API when available.
- Streaks (current and best), a calendar of past results, and a gentle
  reminder on the title screen if today's daily is still open.
- Daily #1 = a fixed launch date you choose; document it.

## 3. Challenge links

- From any replay (Quick Match, Tour, Trick Shot, Daily practice), a
  **"Challenge a friend"** button creates a URL whose hash encodes: engine
  version, seed/stage, world, wind, modifiers, and the shot (angle,
  velocity, power-up). Compact, URL-safe, checksummed.
- Opening the link: shows the challenger's shot replaying, then "Your
  turn — match it or beat it" (hit the same target in one throw, or with a
  closer landing). Result screen with a reply link to send back.
- If the engine version differs, still play the link if the rules are
  unchanged; otherwise explain kindly that the challenge was made on an
  older version.
- Never put player names or anything personal in the URL unless the player
  types a nickname for that challenge themselves.

## 4. Arcade Pass

Add badges and XP for the new modes to `pass.manifest.ts`, for example:
Early Bird (first daily), On a Roll (7-day streak), Hole in One (daily in 1
throw), Puzzle Master (all 24 puzzles), Show-off (all 3-star trick shots),
Matched! (win a challenge), Copycat (exactly reproduce a challenger's
landing). Follow the Pass caps.

## Workflow

1. Cross-browser determinism check and fix (with an ADR and a permanent
   test that runs a fixed set of seeds in all three engines).
2. Trick Shot data format, validation, reference-solution tests, then the
   puzzles themselves — design them to teach: each pack introduces one idea.
3. Daily Skyline, share text, streaks.
4. Challenge links: encoder/decoder with round-trip and corruption tests.
5. UI and art-direction loops (at least three): mode select, puzzle pack
   map, puzzle in play, daily results, share preview, challenge intro and
   result, in light and dark, desktop and phone landscape → critique → fix.

## Deliverables

- The three modes, tests green (including cross-browser determinism), lint
  clean, build passes.
- Update the three docs in `ports/skyline-showdown/docs/` (ABOUT teaser for
  the new modes; HOW-TO-PLAY rules, stars, sharing, tips; ARCHITECTURE with
  Mermaid diagrams of the puzzle format, daily seeding and the challenge
  link encoding).
- ADRs: determinism, daily seeding, challenge link format.
- `docs/games/skyline-showdown.md` diff log, new screenshots, `PORTS.md`.
- One commit: "Add Trick Shot, Daily Skyline and challenge links".

## Report at the end

What was built, the puzzle list, determinism findings, deviations and why.

## Suggested run

Opus 5.5, effort **xhigh**: "Read prompts/004-skyline-showdown-daily.md and do it."
