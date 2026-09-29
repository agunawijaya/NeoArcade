# ADR 0012 — Skyline Showdown throws the same banana in every browser

- **Status:** accepted
- **Date:** 2026-09-29
- **Context:** Skyline Showdown, Trick Shot, Daily Skyline and challenge links
  (prompt 004); follows the policy of [ADR 0009](0009-daily-challenges.md)

## Context

The Daily Skyline gives everyone the same city, wind and target, and a
challenge link replays a friend's exact shot on your screen. Both only work
if a throw computed in one browser lands, to the last bit, where it lands
in every other: a banana that grazes a roof in Chromium and clears it in
Safari turns a "4/10" into a "5/10", and a replayed hit into a miss.

Skyline's engine was written for one player on one machine. It launched
bananas with `Math.sin` and `Math.cos`, split Tri-Bananas with them too,
spaced collision checks with `Math.hypot`, and used `**` in its geometry.
IEEE 754 fixes the result of `+ − × ÷` and `Math.sqrt` to the last bit;
the transcendental functions are left to each engine.

## What we measured

Before building anything we ran the same seeded matches in Node, Chromium,
Firefox and WebKit through Playwright (Playwright 1.63; browsers installed
under `E:\Applications\ms-playwright`) and compared them.

**The functions themselves**, over 20,000 random inputs each, counting
results that differ from Node's (v22.17.0) in any bit:

| Browser | `sin` | `cos` | `hypot` | `sqrt` | `**` / `pow(x, 2)` |
|---|---|---|---|---|---|
| Chromium 153 | 626 | 699 | 0 | 0 | 0 |
| Firefox 155 | 438 | 497 | 7,058 | 0 | 0 |
| WebKit 26.6 | 438 | 497 | 7,244 | 0 | 0 |

Chromium shares V8 with Node, yet still disagrees on about one sine in
thirty: V8's own library and the one Chromium is built with differ.
Firefox and WebKit agree with each other and with neither of the others.

**Whole matches.** `engineFingerprint()` (`src/engine/fingerprint.ts`)
plays eleven seeded scenarios, every world and every twist, power-ups on,
24 throws each, and hashes the exact bits of every point, event, crater and
wind. With the old engine all three browsers disagreed with Node: Chromium
from a throw on the Moon, Firefox and WebKit from the first Earth scenario.
The differences start in the last bit and grow into different landings
within a few dozen steps.

## Decision

1. **The simulation uses exact arithmetic only.** Following ADR 0009, the
   files that decide where a banana goes (`constants`, `exact-math`,
   `geometry`, `gorillas`, `match`, `powerups`, `shot`, `skyline`,
   `targets`, `terrain`, `twists`, `wind`, `worlds`) keep to `+ − × ÷`,
   comparisons, `Math.floor/round/ceil/min/max/abs`, integer maths and
   `@shared/rng`. A test (`exact-math.test.ts`) scans them for `Math.sin`,
   `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `sqrt`, `cbrt`, `hypot` and
   `**`, comments aside.
2. **`src/engine/exact-math.ts`** supplies what the physics needs, built
   from those operations alone:
   - `sinCosDegrees(angle)` reduces the angle in degrees (exactly, with `%`
     and whole quarter turns) to 0–45°, then sums Taylor series in Horner
     form with reciprocal factorials that are themselves exact. It agrees
     with `Math.sin`/`cos` to within 4 × 10⁻¹⁵ and is exact on the axes.
   - `squareRoot(x)` is Newton's method from above, stopping when a step
     no longer goes down: the same step in every engine, within an ulp of
     `Math.sqrt`.
   - Distances that are only compared are compared squared.
3. **The CPU is outside the rule.** `ai.ts` plans with `Math.atan2` and
   friends; a CPU's throws are recorded as numbers and never planned again
   elsewhere, so they cannot make two browsers disagree.
4. **Proof in all three engines, every time.** `e2e/engine.determinism.ts`
   bundles the fingerprint (and the Trick Shot reference solutions, the
   next year of Daily Skylines and a set of challenge links) and runs it in
   Chromium, Firefox and WebKit, comparing each line with Node's. After the
   change all three match Node bit for bit.
5. **The rules are pinned.** `src/engine/version.ts` records the engine
   version, the rules each version played by, and the fingerprint of
   today's rules; a unit test fails if the fingerprint moves (ADR 0014).

Angles are also kept to a hundredth of a degree inside the engine, which
is what a challenge link carries; see ADR 0014.

## Consequences

- Every throw in the game moved by a few ulps. Nothing a player could see
  changed; the World Tour's tuning tests pass unchanged.
- New physics must be written with the allowed operations. A curve that
  needs a sine takes it from `sinCosDegrees`; the scan test catches
  anything else before it ships.
- The fingerprint is a tripwire. When it moves, someone has changed the
  rules, and old challenge links and today's daily with them.
- Running the determinism tests needs Playwright's Firefox and WebKit:
  `npx playwright install firefox webkit`, then
  `npx playwright test -c ports/skyline-showdown --project='determinism-*'`.
