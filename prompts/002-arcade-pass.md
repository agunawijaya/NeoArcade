# 002 — Arcade Pass: one profile, XP and badges across every NeoArcade game

## Read first

1. `CLAUDE.md`, `docs/HALL-ARCHITECTURE.md`, `docs/adr/*`.
2. `shared/` (especially `storage/`, `audio/` mix, `hall-link/`) and `hall/src/*`.
3. `ports/skyline-showdown/docs/ARCHITECTURE.md` — the first game that will
   plug into the Pass (in prompt 003, not now).

## Goal

Build the **Arcade Pass**: a single player profile that lives across the whole
collection. Games report what the player did; the Pass turns it into XP,
levels, ranks and badges, and the Hall shows it all in a place that feels
like a trophy room. This makes NeoArcade one world instead of a folder of games.

This prompt builds the Pass and the Hall side only. Skyline Showdown is wired
in by prompt 003. Don't change the game here.

## Hard rules

- Local only: no backend, no accounts, no tracking. Data in `localStorage`
  through `shared/storage`, under one namespace (`neoarcade:pass`).
- Zero raster assets. Avatars, badges, rank emblems are drawn in code (SVG or
  Canvas), light and dark theme aware.
- Progress rewards playing well and playing often, not grinding. The Pass
  never gives a gameplay advantage in any game; only cosmetics.
- Works when storage is unavailable or full: games keep running, the Pass
  says so politely.

## shared/pass — the API every game uses

Design it small and hard to misuse. Roughly:

- `pass.award(game, xp, reason)` — XP with a human-readable reason for the
  activity feed. A per-game daily soft cap (diminishing XP after a
  threshold) keeps farming pointless; document the numbers.
- `pass.unlock(game, badgeId)` — idempotent; returns whether it was new.
- `pass.progress(game, badgeId, value)` — for counted badges ("hit the sun
  10 times").
- `pass.stat(game, key, value | delta)` — per-game stats for the profile
  (matches played, wins, best streak…).
- `pass.isUnlocked(game, cosmeticId)` and `pass.subscribe(listener)`.
- A shared **unlock toast** component that any game can mount: badge
  emblem, name, one line of flavour, XP gained. Consistent everywhere,
  keyboard/pad dismissible, respects reduced motion, and never covers the
  playfield during a turn — games decide when to flush queued toasts.

**Badge and cosmetic manifests** are declared per game in
`ports/<slug>/pass.manifest.ts` (id, name, description, hint for locked
state, emblem drawer, tier bronze/silver/gold/secret, XP value, optional
target count). The Hall reads every manifest via `import.meta.glob`, so it
can show locked badges without loading the game. Secret badges show as
"???" until unlocked. Validate manifests at build time (duplicate ids,
missing fields) and in tests.

**Schema versioning:** the stored profile carries a version and a migration
path. Write the migration mechanism now, even with only version 1.

## Levels and ranks

- XP curve that feels fast early and steady later (level 2 in one good
  session; the top ranks take weeks). Put the curve in one table and test it.
- Ranks with arcade flavour, each with a code-drawn emblem, for example:
  Coin Slot → Button Masher → Joystick Jockey → High Scorer → Cabinet
  Champion → Arcade Legend. Rename freely if you find better ones.
- Level-ups unlock **arcade-wide cosmetics**: avatar parts, name-plate
  frames, Hall accent themes. Games may also check arcade level for their
  own cosmetics.

## The Hall side

- **Masthead chip:** avatar, name, level ring filling with XP. Opens the Pass.
- **Pass page** (its own route, same visual language as the Hall):
  - Profile header: avatar (editable), player name, rank emblem, level, XP
    to next level.
  - **Badge cabinet**: a trophy wall grouped by game — unlocked badges lit
    and animated, locked ones as dim silhouettes with their hint, secrets
    as "???". Counted badges show progress. Click a badge for details and
    unlock date.
  - Per-game stats cards, and a short activity feed ("+40 XP — Won in
    Jakarta, Skyline Showdown").
  - Avatar editor: code-drawn avatar (face shape, colours, eyes, headwear,
    accessories), with locked parts showing the level that unlocks them.
- **Game cards** in the lobby show your badge count for that game
  (e.g. "7 / 24") once you have played it.
- **Backup:** export the profile as a copyable text code and a downloadable
  JSON; import with validation and a clear preview before overwriting. Reset
  with a confirm step.
- Everything keyboard and gamepad navigable, phone friendly, light and dark
  themes, reduced motion respected.

## Testing the Pass without a real game

Add a tiny dev-only harness (not linked from the Hall, excluded from the
production catalog) that fires awards, unlocks and toasts so you can
screenshot every state: fresh profile, mid-level, level-up, badge unlock,
full cabinet, storage unavailable, import/export.

## Workflow

1. `shared/pass` with unit tests (curve, caps, idempotency, counted badges,
   migration, corrupt/absent storage).
2. Manifest loading and validation.
3. Hall UI. Then at least three art-direction loops: Playwright screenshots
   of every Pass state at 1440×900, 1024×768, 390×844, in light and dark →
   critique → fix. The badge cabinet should be a place people want to fill.
4. Docs, build, lint, tests.

## Deliverables

- `shared/pass/` with tests; shared unlock toast.
- Hall: masthead chip, Pass page, badge cabinet, avatar editor, backup, card
  badge counts.
- `docs/adr/0006-arcade-pass.md` (storage, manifests, anti-farming, why local).
- `docs/ARCADE-PASS.md` — the integration guide for port developers, with
  Mermaid diagrams (data flow from game → Pass → Hall, manifest lifecycle)
  and a copy-paste checklist.
- Update `docs/HALL-ARCHITECTURE.md`, root `README.md`, `PORTS.md`
  (Infrastructure table).
- Add to `CLAUDE.md`, under "Every port ships with": *"Arcade Pass
  integration: a `pass.manifest.ts` with badges and cosmetics, XP awards and
  the shared unlock toast — see `docs/ARCADE-PASS.md`."* Also mention the
  Pass in the ARCHITECTURE doc requirements (how the port reports progress).
- One commit: "Add the Arcade Pass".

## Report at the end

What was built, the final API, the XP numbers, deviations and why, and what
prompt 003 must know to wire Skyline Showdown in.

## Suggested run

Opus 5.5, effort **high**: "Read prompts/002-arcade-pass.md and do it."
