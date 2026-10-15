# ADR 0018 — Category shelves, Today, Continue playing and the Origins timeline

- **Status:** accepted
- **Date:** 2026-10-15
- **Context:** prompt 008 (backlog items HALL-01 to HALL-04)
- **Amends:** [ADR 0002](0002-hall-catalog-and-covers.md) (the catalog gains
  `category`, `secondaryCategory`, `daily` and `origin`, which replaces
  `original`)

## Context

The Hall was built for a handful of games: a spotlight on the newest, then
every game as a card in one grid, with free-form `genres` for filtering. The
collection is meant to reach fifty. At that size one grid is a wall, and
free-form genres drift ("Arcade", "Reflex", "Duel"…) until they stop helping
anyone choose.

Three games now have a daily challenge, each on its own screen inside its
own game, so a player has to open all three to know where they stand. A
player coming back has no quick way to the mode they were in. And the
originals span the eighties and nineties, a story the Hall did not tell.

## Decision

### 1. A fixed list of categories

`hall/src/categories.ts` holds ten categories, in this order: Arcade ·
Action · Adventure · Simulation · Strategy · Puzzle · Sports · Card & Board ·
Word & Trivia · Learning. Each has an id (`arcade`, `card-board`,
`word-trivia`…), a name, a one-line blurb for its page, an accent colour for
each theme (the dark one bright, the light one deep; a test holds both to a
4.5 : 1 contrast against their page) and a code-drawn emblem: a joystick, a
lightning bolt, a compass, a dial, a pennant, a falling block, a ball, a die,
a speech bubble and a mortarboard.

Every catalog entry names exactly one `category` and may name a different
`secondaryCategory`. The list is closed: the catalog check in
`scripts/check-catalog.ts` runs first in `npm run build` and in `npm test`,
and refuses any other value, so a port cannot invent a category. `genres`
stay as finer tags for the genre filter.

The current games: Skyline Showdown and Donkey Dash are **Arcade**; Long
Haul is **Simulation**, with **Strategy** as its secondary, because route
planning, contracts and a career's money are as much of the game as the
driving. Skyline Showdown has no secondary: Strategy or Action would both
stretch it.

### 2. Shelves, in the fixed category order

The lobby shows one shelf per category that has games (owner decision:
shelves, not tabs). A shelf is a heading (emblem, name, game count; it links
to the category page) and a row of cards that scrolls sideways and ends in a
"See all" doorway to the same page. A game on its secondary shelf carries a
small tag naming its main category.

**Shelves come in the fixed category order**, not "category with the newest
game first". The spotlight already features the newest game, and the order
within each shelf is newest first, so new arrivals are seen either way;
what a fixed order adds is a lobby that stays where the player left it.
Keyboard and gamepad players navigate by position ("Simulation is the
fourth shelf down"), and a layout that reshuffles whenever a game lands
breaks that memory. Empty categories are simply not shown.

Each category also has a page, `#/category/<id>`: a grid of its games,
sorted A–Z, newest first or most played (the choice is remembered). "Most
played" counts how often each game was started, from the play history below;
ties go to the newer game.

Search, genre chips and sorting keep their old rule (they appear from six
games). While a search or a genre narrows the collection, the shelves give
way to one grid of results.

**Navigation.** Every shelf, the Continue row and the Today panel are rows:
one tab stop each, arrow keys (and the gamepad) move left and right along a
row and up and down between rows, landing on the item closest across
(`stepAcrossRows` in `spatial-nav.ts`). Up from the first row goes to the
spotlight's Play, down from the spotlight to the first row. The row scrolls
to keep the focused item whole, the page scrolls to keep its shelf in view,
and both scroll smoothly unless the player prefers reduced motion. Mouse
users get previous and next buttons beside each heading (hidden on touch
screens, which swipe); the row's edges fade where there is more to see.

### 3. Today in NeoArcade

A panel under the spotlight lists every game's daily challenge: its name and
today's number, played or not, how it went, the current streak, and the time
until the next one in the player's local time, with one click into the game.

The Hall finds dailies in the catalog, not in code. An entry may carry:

```json
"daily": {
  "name": "Daily Haul",
  "launch": "2026-10-04",
  "mode": "daily",
  "results": [
    { "when": { "outcome": "crashed" }, "text": "Lost the rig" },
    { "when": { "late": true }, "text": "Delivered late, {profitCents|money}" },
    { "text": "Delivered, {profitCents|money} in {hours|hours}" }
  ]
}
```

The Hall reads the game's own daily log (`createDailyLog` over the game's
store, namespace = slug, key `log`, default `daily`) with `@shared/daily`
and never writes to it. The number comes from `launch`, exactly as the
game's own `dailyChallenge()` counts it; the catalog check refuses a launch
date that does not appear in the game's source. Results are game-shaped, so
`results` are rules: the first whose `when` fields all equal the stored
result supplies the line, with `{field}`, `{field|number}`, `{field|money}`
(cents) and `{field|hours}` filled in. Without a matching rule a played day
just says "Played today".

All dailies change at the same UTC midnight (ADR 0009), so the panel shows
one countdown. It ticks once a minute, redraws at the new day, and reads the
logs again when the player comes back from a game (`pageshow`) or plays in
another tab (`storage`).

### 4. Continue playing

A tiny helper, `@shared/last-played`, keeps what the player last did:

```ts
reportPlay({ game: 'skyline-showdown', mode: 'tour', item: 'tokyo', label: 'World Tour · Tokyo' });
```

A game reports a play when the player starts a mode. The history keeps the
newest twelve, one per game and mode, plus a count of starts per game, under
`neoarcade:last-played:*`. The lobby shows the newest six as a Continue
playing row once there is any history. Each tile links to the game with
`?play=<mode>&item=<item>`; the game calls `takeResumeRequest()` once at
start-up, which reads the request and removes it from the address, and opens
that mode: the stage or puzzle card, the daily screen, the career, the
dispatch office. The Today panel's links use the same convention, so one
small contract serves both.

"Clear history" lives on the Pass page and forgets the plays and the counts;
it leaves the Pass and the daily results alone.

### 5. Origins: `origin` replaces `original`

The entry's `original` block grows into `origin`, with only the facts its
ABOUT page supports: `title`, `author`, an optional `publisher` (when
someone else put it out), either a `year` or an `era` (`{ label, from, to }`,
e.g. "early 1980s", 1981–1984, when no year can be vouched for), `platform`,
`language`, `machine` (which silhouette draws it) and an optional `appeared`
(the disk, magazine, book or bundle it came on). One block rather than an
`origin` beside the old `original`, so the year and the author are never
stored twice and cannot disagree.

| Game | Year | Machine | Source of each fact |
|---|---|---|---|
| QBasic Gorillas | 1990 | MS-DOS PC | ABOUT's table: Microsoft, QBasic, MS-DOS PCs with CGA/EGA/VGA, a sample program with QBasic in MS-DOS 5.0 |
| DONKEY.BAS | 1981 | IBM PC | ABOUT's table: written at Microsoft for IBM, BASICA, the IBM PC with the CGA, the PC DOS disk of the first IBM PC |
| Trucker | early 1980s (1981–1984) | IBM PC | ABOUT: Hughes Glantzberg, GW-BASIC, the IBM PC, a menu-driven disk collection nobody has identified. The span starts at the IBM PC's launch in 1981 and stops where "early" ends; it is our reading of the label, not a found date, and is drawn as a soft band |

### 6. The Origins timeline

`#/timeline` (from the masthead) draws, entirely in code, a horizontal track
from 1980 to a round year a few years past the newest original:

- **Eras** as bands under the axis: 8-bit home computers (1977–1990), IBM PC
  and MS-DOS (1981–1995), the QBasic years (1991–2000), Windows PCs (1995 on).
  They are the usual rough edges of each age, and the page says so.
- **Each original** as a marker standing on its year: a small silhouette of
  its machine (`hall/src/machines.ts`: the IBM PC, an MS-DOS PC, an 8-bit
  home computer on a TV, a terminal, a Windows PC), its title and its year.
  An exact year is a dot on the axis; an era is a soft, blurred band across
  its span. Markers that would touch stack into lanes; when more than three
  would be needed, each year gets wider and the track scrolls sideways
  (`fitMarkers`).
- **Picking one** (click, tap, arrows, Tab, a gamepad; selection follows
  focus, as in any tab list) shows the original's facts beside the remake's
  card, with Play and About. The pick is kept in the address
  (`#/timeline/<slug>`) without adding history entries.

## Deviations from the brief, and why

1. **`origin` replaces `original`** rather than joining it, so no fact is
   stored twice (section 5).
2. **The daily's result is described by rules in the catalog** rather than
   read by game code: the Hall cannot import from `ports/` (ADR 0002), and
   rules keep the Hall generic for any future daily.
3. **"Most played" counts starts recorded by `@shared/last-played`**, so it
   only knows about play since this feature shipped, and clearing the
   history resets it. The Pass's XP was the alternative, but it measures
   success and is capped per day, not how often a game is chosen.
4. **One countdown for the whole Today panel**, not one per game: every daily
   turns over at the same UTC midnight.

## Consequences

- A new port picks a category, writes its origin facts from its ABOUT page,
  and, if it has a daily, a `daily` block; it reports plays with
  `reportPlay()` and honours `takeResumeRequest()`. `CLAUDE.md` and the
  checklist in ADR 0002 say so.
- The category list changes only by a decision recorded here, with an accent
  pair that passes the contrast test and an emblem.
- A game changing its daily's launch date, log key or result shape must
  update its catalog `daily` block in the same change.
- `?fixture=big` on the dev server swaps in forty pretend games
  (`hall/dev/big-catalog.ts`) to check that shelves, Today and the timeline
  scale; an e2e test proves it never reaches the build.
