# ADR 0006 — The Arcade Pass: one local profile across every game

- **Status:** accepted
- **Date:** 2026-09-28
- **Context:** prompt 002

## Context

NeoArcade is a folder of games until something connects them. The Arcade
Pass is that connection: one player profile that every game reports to,
turned into XP, levels, ranks and badges, and shown off in the Hall.

The constraints come from the rest of the project:

- The site is static and has no backend (ADR 0001), and players have no
  accounts. Nothing may be tracked or sent anywhere.
- Every game is built in its own session, sometimes long after this one, so
  the contract between a game and the Pass has to be small, typed and
  checked by machines, not by memory.
- Rewards are cosmetic. The Pass must never make a game easier.
- Progress should reward playing well and playing often, not grinding.
- Browsers refuse storage (private windows, blocked site data, full
  quotas). Games must keep running when they do.

## Decision

### 1. One JSON document in localStorage

The profile is a single JSON document under `neoarcade:pass:profile`,
written through `@shared/storage` (namespace `pass`). One key means one
atomic write per change and one thing to back up.

```
{ version, createdAt, name, look, xp, games: { <slug>: GameRecord }, feed: [...] }
GameRecord = { xp, firstPlayed, lastPlayed, badges: { id: date }, progress, stats, day, askedToday }
```

Every change re-reads storage, applies itself and writes back, so two tabs
(a game and the Hall) do not overwrite each other's progress; the `storage`
event keeps an open Hall up to date. The activity feed keeps the newest 40
lines and folds identical awards together, so the document stays at a few
kilobytes.

### 2. Versioned, migrated, never silently lost

The profile carries `version` (now 1). `migrate.ts` holds a table of steps,
each turning version *n* into *n + 1*; loading runs every step in order and
then sanitises every field, so damaged fields fall back to defaults instead
of losing the profile. Three cases are handled on purpose:

| Stored profile | What happens |
|---|---|
| Damaged fields | Repaired; the Pass page says so once. |
| Unreadable (bad JSON, not a profile) | Kept under `neoarcade:pass:profile-unreadable`, a fresh profile starts. |
| From a newer version | Left untouched. The Pass works in memory for the visit and says why. |

### 3. A game-scoped handle, checked against a manifest

A game calls `connectPass(manifest)` once and gets a handle bound to its
slug: `award(xp, reason)`, `unlock(id)`, `progress(id, n | { add })`,
`stat(key, n | { add } | { max } | { min })`, `isUnlocked(cosmeticId)`,
`level`, `health`, `subscribe`. Ids are literal types taken from the
manifest, so a typo is a compile error. At runtime anything the manifest
does not declare, and any nonsense value, is ignored with a single console
warning. Nothing the Pass does can throw into a game loop.

### 4. Manifests: data the Hall can read without the game

Each port declares `ports/<slug>/pass.manifest.ts`: badges (id, name,
description, hint, tier, emblem drawer, XP, optional target), cosmetics
(unlocked by an arcade level or by one of its badges) and stats (labels for
the profile). The Hall bundles every manifest with `import.meta.glob`, so it
shows locked badges for games the player has never opened.

Emblems are drawn by code through a small pen (`path`, `circle`, `rect`,
`polygon`, `star`, with ink roles instead of colours). The pen only records
shapes, so a manifest contains no DOM code and can be loaded in Node.
A manifest may import nothing but `@shared/pass/manifest`. It is checked
three times:

1. `scripts/check-pass-manifests.ts` runs first in `npm run build` and fails
   the build on any problem (fields, duplicate ids, emblems that throw or
   draw nothing, the wrong `game`, other imports);
2. the same check runs in `npm test`;
3. the Hall validates again at runtime and skips a bad manifest with a
   warning, like a bad catalog entry.

### 5. XP, levels and ranks

The curve is one table (`shared/pass/levels.ts`): 150 XP for level 2, each
step a little dearer up to 1,450 XP for level 20, then 1,500 XP per level
for good. Ranks: Coin Slot (1), Button Masher (5), Joystick Jockey (10),
High Scorer (15), Cabinet Champion (20), Arcade Legend (30), each with a
code-drawn emblem.

| Level | Total XP | At one game's daily maximum (720) |
|---|---|---|
| 2 | 150 | one good session |
| 5 | 1,200 | 2 days |
| 10 | 4,950 | 7 days |
| 20 | 17,200 | 24 days |
| 30 | 32,200 | 45 days |

Badges add to that (25 to 300 XP each), and every game in the collection
has its own daily allowance, so a player who plays several games climbs
faster, and a player who replays one easy win does not.

### 6. Anti-farming: a soft daily cap per game

The XP a game *asks* for each local calendar day is granted in bands:
the first 400 in full, the next 400 at half, then 10 % up to 2,000, and
nothing after that. A single award is clamped to 250. Badges are one-offs
and never capped. The numbers live in `shared/pass/daily-cap.ts` and are
tested; rounding happens on the running total, so many small awards add up
exactly like one big one.

### 7. Cosmetics only

Levels unlock arcade-wide cosmetics (avatar parts, name-plate frames, Hall
accent themes), listed with their level in `arcade-cosmetics.ts`. Games may
declare their own cosmetics, unlocked by an arcade level or by one of their
badges, and ask `isUnlocked(id)`. Whether a cosmetic is unlocked is derived
from level and badges each time, never stored, so it cannot drift. Human
skin tones are never locked.

### 8. Saying so when saving fails

`pass.health` is `ok`, `unavailable`, `full` or `newer-version`. The Hall's
Pass page shows a plain-words notice and the masthead chip a small amber
dot; in a game, the shared unlock toast says "Progress isn't being saved"
once per page. In every case play continues, with the Pass in memory.

### 9. Why local

A backend would mean accounts, personal data, a privacy policy and a
server to keep alive, all for a trophy shelf. The static site from ADR 0001
cannot hold secrets anyway. Local storage costs us two things, and we
accept both:

- **The Pass lives in one browser.** A backup code (the profile as base64url
  with a checksum) and a downloadable JSON file move it; importing shows
  whose Pass it is before anything is replaced.
- **A determined player can edit it.** Everything it unlocks is cosmetic and
  there is no leaderboard, so there is nothing to protect.

## Deviations from the brief, and why

1. **`connectPass(manifest)` instead of `pass.award(game, …)`.** Binding the
   slug and the manifest once makes ids type-checked and removes a whole
   class of typos. The Hall uses the wider `ArcadePass` (profile, rename,
   dressUp, backups, reset).
2. **Stats are declared in the manifest.** The profile needs labels and units
   to show them; declaring them also catches typos.
3. **Pad dismissal of toasts goes through the game.** A toast cannot read
   the gamepad without the game also seeing the same press, so games call
   `toasts.dismiss()` from their own back button (the Pass Lab shows how).
   Escape is handled by the toast itself, before the game sees the key.
4. **The Hall gained a light theme** (following the device, with a toggle in
   the masthead), because the Pass had to work in light and dark and a Pass
   page lighter than the lobby around it would look broken.
5. **The dev harness is `hall/dev/pass-lab/`**, served by the dev server
   only. The Hall adds its pretend game's shelf only in development
   (`import.meta.env.DEV`), and an e2e test checks that nothing of it
   reaches the built site. Its screenshots run with their own Playwright
   config against the dev server.

## Consequences

- A port joins the Pass by adding one manifest and a handful of calls; the
  build refuses a broken manifest before the Hall can show it.
- The profile schema is a public contract, like the catalog: changing it
  means a new version, a migration step, a test, and an update here.
- Players who clear their browser data lose their Pass unless they backed it
  up. The Pass page says so where the backup buttons are.
