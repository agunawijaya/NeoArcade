# 008 — Hall: category shelves, Today, Continue playing, Origins timeline

## Read first

1. `CLAUDE.md`, `BACKLOG.md` (items HALL-01 to HALL-04).
2. `docs/HALL-ARCHITECTURE.md`, ADRs 0002, 0005, 0006, 0009.
3. `hall/src/*` (catalog, library, lobby, spotlight, card, spatial-nav,
   gamepad-nav, routes, theme), `hall/catalog.json`, `shared/daily`,
   `shared/pass`, `shared/storage`.

## Goal

Grow the Hall from a list of three games into a lobby that will still feel
great with fifty: games organised on **category shelves**, a **Today**
panel for the daily challenges, a **Continue playing** row, and an
**Origins timeline** of the original programs.

## 1. Categories (HALL-01)

- Fixed list, in this order: Arcade · Action · Adventure · Simulation ·
  Strategy · Puzzle · Sports · Card & Board · Word & Trivia · Learning.
  Each has an id, a display name, an accent colour that works in light and
  dark themes, and a small code-drawn emblem.
- Catalog schema: `category` (required, one of the list) and
  `secondaryCategory` (optional, different from the primary). Existing
  `genres` stay as tags. Validate at build time and in tests; a port can't
  invent a category.
- Current games: Skyline Showdown → Arcade, Donkey Dash → Arcade,
  Long Haul → Simulation (secondary: Strategy). Choose secondaries only
  where they clearly help.
- Update the catalog guide in `docs/adr/` (new ADR or amend 0002) and
  `CLAUDE.md`'s "Every port ships with" so future ports set a category.

## 2. Shelves (owner decision: shelves, not tabs)

- The lobby shows one **shelf per category**: a heading with emblem,
  accent and game count, and a horizontally scrolling row of game cards.
  A game with a secondary category appears on both shelves (secondary
  appearance marked subtly).
- Shelf order: categories with the most recently added game first, or a
  fixed order — pick what reads best, document why. Empty categories are
  hidden. Each shelf heading opens a full category page (grid of all its
  games, sort A–Z / newest / most played).
- Search and genre filtering keep working: while searching, shelves collapse
  into one result grid.
- Shelves must be smooth with mouse wheel, trackpad, touch swipe, keyboard
  and gamepad (extend `spatial-nav` so up/down moves between shelves,
  left/right within a shelf, with focus kept visible and scrolled into view).
- The existing spotlight and live game screens (ADR 0005) keep working on
  cards inside shelves; only animate what is on screen.

## 3. Today in NeoArcade (HALL-02)

A panel near the top of the lobby listing every game's daily challenge
(Daily Skyline, Daily Road, Daily Haul, and any future one discovered from
the catalog — add a `daily` field to the catalog rather than hard-coding):
today's number, played or not, result if played, current streak, time
until the next one in local time, and a one-click "Play today's".
Reads only `shared/daily` data; never changes it.

## 4. Continue playing (HALL-03)

- Games report "last played" (game, mode, a short label such as "World
  Tour · Tokyo", timestamp, and a resume link) through a tiny new
  `shared/` helper. Wire it into the three existing games.
- The lobby shows a **Continue playing** row (most recent first, up to 6)
  above the shelves once there is history; one click resumes the mode.
  A "clear history" action lives on the Pass page.

## 5. Origins timeline (HALL-04)

- Catalog gains `origin`: year (or a range with a label such as
  "early 1980s" when the exact year is not confirmed), platform, language,
  author/publisher as already stated in each game's ABOUT. Do not invent
  facts; copy only what the ABOUT docs support.
- A **Timeline** page reached from the masthead: a code-drawn horizontal
  timeline from 1980 onward with era bands (e.g. 8-bit home computers,
  IBM PC & DOS, QBasic era), each original as a marker with a tiny
  machine silhouette (IBM PC, etc.); selecting one shows the original's
  facts beside its modern remake's card, with Play and About.
  Approximate years are drawn as a soft span, not a point.
- Works with keyboard, gamepad, touch; reduced motion; light and dark.

## Workflow

1. Schema and validation (categories, secondary, daily, origin), tests.
2. Shelves and navigation; category pages; search fallback.
3. Today panel; last-played helper and wiring in the three games; Continue
   playing row.
4. Timeline page.
5. Art-direction loops (at least three): lobby with shelves, Today and
   Continue rows (fresh profile and with history), a category page, the
   timeline, in light and dark, at 1440×900, 1024×768, 390×844 → critique
   → fix. Also test a fake catalog of 40 games (dev fixture only) to prove
   the shelves scale.
6. Tests, lint, build.

## Deliverables

- Features above, tests green, lint clean, build passes.
- `docs/HALL-ARCHITECTURE.md` updated with Mermaid diagrams (catalog
  schema, shelf layout and navigation, Today and Continue data flow).
- ADRs as needed; root `README.md` ("how to add a game" mentions category
  and origin); `PORTS.md` infrastructure table; mark HALL-01 to HALL-04 as
  Done in `BACKLOG.md`.
- Screenshots in `hall/media/`.
- One commit: "Add category shelves, Today, Continue playing and the
  Origins timeline to the Hall".

## Report at the end

What was built, the final catalog schema, deviations and why.

## Suggested run

Opus 5.5, effort **high**: "Read prompts/008-hall-shelves-today-timeline.md and do it."
Can run in parallel with 007, which only touches `ports/donkey-dash/`,
except that 008 adds the last-played call to Donkey Dash: run 008 after
007 finishes, or tell 008 to leave Donkey Dash's wiring for last.
