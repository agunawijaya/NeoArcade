# ADR 0002 — Hall catalog, covers, and how a port registers itself

- **Status:** accepted; amended 2026-09-26 by [ADR 0005](0005-hall-shows-game-screens.md)
  (screens, pitch and highlights; covers become the fallback)
- **Date:** 2026-09-25

## Context

The Arcade Hall lists every finished port with its screens (or, failing
those, a small code-drawn animated cover), a detail panel, and the port's
player-facing docs.
Ports are built in separate sessions, so the contract between a port and the
Hall has to be small, explicit and checked by tests.

## Decision

### 1. The catalog: `hall/catalog.json`

A JSON **array**, one object per game. It is validated by
`hall/src/catalog.ts` at runtime (bad entries are skipped with a console
warning) and by `hall/src/catalog.test.ts` in CI (bad entries fail the build).

| Field | Type | Meaning |
|---|---|---|
| `slug` | string, kebab-case | Folder name under `ports/` and the URL segment in `dist/`. |
| `title` | string | The port's name. |
| `tagline` | string | One line that sells it. |
| `pitch` | string, optional | Two or three sentences on why it is worth playing, written as an invitation. Shown in the spotlight and the detail panel. |
| `highlights` | string[], optional, at most 4 | Short reasons to play, shown as a list in the spotlight. |
| `screens` | `{ image, caption? }[]`, optional | Screenshots, relative to the port folder (normally `media/…`), each with a short caption. The Hall shows the first on cards and cycles through all of them in the spotlight and the detail panel. Without screens, the cover is shown. |
| `original.title` | string | The classic this is based on. |
| `original.author` | string | Author or company. |
| `original.year` | integer | Year of the original. May be left out when it cannot be confirmed, if `era` is given. |
| `original.era` | string, optional | Shown in place of the year, e.g. `"early 1980s"`, when no year can be vouched for (added with Long Haul). |
| `original.platform` | string, optional | e.g. `"MS-DOS (QBasic)"`. |
| `genres` | string[], at least one | Drives the genre filter; the first two show on the card. |
| `players` | `{ min, max }` integers, `1 <= min <= max` | Shown as "1–2 players". |
| `accent` | `#rrggbb` | The game's colour in the Hall: Play button, glow under the screen, card highlights. |
| `path` | relative URL | Where the game lives relative to the Hall in `dist/`. Always `"<slug>/"`. |
| `cover` | string | Name of the cover module in `hall/covers/`, without `.ts`. Usually the slug. Shown when there are no screens or they fail to load. |
| `docs.howToPlay` | path | Relative to the port folder, normally `docs/HOW-TO-PLAY.md`. |
| `docs.about` | path | Normally `docs/ABOUT.md`. |
| `docs.architecture` | path, optional | Normally `docs/ARCHITECTURE.md`. Not shown to players. |
| `added` | `YYYY-MM-DD` | Date the game joined the Hall; drives "Newest" sorting. |

Example:

```json
{
  "slug": "skyline-showdown",
  "title": "Skyline Showdown",
  "tagline": "Bananas, wind and a city at dusk.",
  "pitch": "Two gorillas face off across the rooftops. Pick an angle, feel the wind and lob an exploding banana over the city.",
  "highlights": ["Learn it in one throw, master it in the wind", "Four worlds, each with its own gravity"],
  "screens": [{ "image": "media/aiming.jpg", "caption": "Pull back, read the wind, let it fly." }],
  "original": { "title": "QBasic Gorillas", "author": "Microsoft Corporation", "year": 1990, "platform": "MS-DOS (QBasic)" },
  "genres": ["Artillery", "Duel"],
  "players": { "min": 1, "max": 2 },
  "accent": "#ff8a3d",
  "path": "skyline-showdown/",
  "cover": "skyline-showdown",
  "docs": { "howToPlay": "docs/HOW-TO-PLAY.md", "about": "docs/ABOUT.md", "architecture": "docs/ARCHITECTURE.md" },
  "added": "2026-10-01"
}
```

The catalog test also checks, for every entry, that `ports/<slug>/index.html`,
`hall/covers/<cover>.ts`, both player docs and every screen image exist, and
that `path` is `"<slug>/"`.

### 2. The cover API: `hall/covers/<cover>.ts`

A cover is a small canvas scene, a moving box-art, not the game. Each file
default-exports the result of `defineCover` from `hall/src/cover-api.ts`:

```ts
import { defineCover } from '../src/cover-api';

export default defineCover({
  posterTime: 2.5, // the moment shown while the cabinet is idle
  create({ seed, accent, title }) {
    // Build per-canvas state here (seeded stars, buildings…).
    return {
      draw(ctx, { width, height, time, delta, energy, reducedMotion }) {
        // Paint a complete frame. ctx is pre-scaled; width/height are CSS pixels.
      },
    };
  },
});
```

| Frame field | Meaning |
|---|---|
| `width`, `height` | Screen size in CSS pixels (4:3 in cabinets and the detail panel). |
| `time` | Seconds of animation. Starts at `posterTime` and only advances while alive. |
| `delta` | Seconds since the previous frame; 0 for a still. |
| `energy` | 0 while idle, eased to 1 on hover, focus or in the detail panel. Use it to "power up". |
| `reducedMotion` | The player asked for less motion; the Hall will not animate, so draw a calm still. |

Rules for cover authors:

- **Self-contained.** Import only from `hall/src/cover-api.ts`, `hall/src/colour.ts`
  and `@shared/*` (e.g. `@shared/rng`). Never import from `ports/`: that
  would pull game code into the Hall bundle.
- **Cheap.** Several covers can be alive at once on a phone. No per-pixel
  loops per frame; pre-render static layers in `create`.
- **Deterministic.** Use `seed` with `@shared/rng`, not `Math.random`.
- **Draw the whole frame** every call; the Hall does not clear the canvas.
- Text drawn on the canvas may use `'Tilt Neon'`, which is loaded before any cover starts.

Covers are discovered with `import.meta.glob('../covers/*.ts')` and loaded
lazily. A missing, failing-to-load or throwing cover is replaced by the
generic attract-mode cover (`hall/src/fallback-cover.ts`), so one broken
port can never take the Hall down.

### 3. Docs and screenshots

The Hall renders `docs.howToPlay` and `docs.about` as pages at
`#/games/<slug>/how-to-play` and `#/games/<slug>/about`. Markdown and every
image in `ports/*/media/` are bundled at build time. Inside the docs:

- Relative images (`![…](../media/shot.png "caption")`) resolve to the
  bundled screenshot; the title becomes a caption. Remote images are not shown.
- Links between the two player docs become Hall routes; `#anchors` scroll;
  `http(s)` links open in a new tab; links to other repo files become plain text.
- ```` ```mermaid ```` blocks render as diagrams in the Hall's dark theme.
- Only a few inline HTML tags are allowed (`kbd`, `br`, `sup`, `sub`, `b`, `i`,
  `em`, `strong`, `details`, `summary`, without attributes); anything else shows as text.

### 4. The "back to the Hall" button

Every port calls `mountHallButton()` from `@shared/hall-link`. It links to
`../` in the built site and `/hall/` on the dev server, dims while the player
is busy, and accepts `corner` and `beforeLeave` (return `false` to stay, e.g.
after asking "leave the match?").

## How a port registers itself (checklist)

1. Build the game in `ports/<slug>/` with an `index.html` (the build finds it).
2. Call `mountHallButton()` in the game.
3. Write `ports/<slug>/docs/HOW-TO-PLAY.md`, `ABOUT.md` and `ARCHITECTURE.md`;
   put screenshots in `ports/<slug>/media/`.
4. Add `hall/covers/<slug>.ts` using `defineCover`.
5. Add the catalog entry to `hall/catalog.json`, with a `pitch`, a few
   `highlights` and four to six `screens` of real play (landscape,
   16:10 or close, no title screens), each with a short caption.
6. Run `npm test` (the catalog guard), `npm run build`, `npm run test:e2e`.

## Consequences

- Adding a game never touches Hall code, only data (`catalog.json`), its
  screenshots and one cover file.
- The Hall bundle grows with every port's docs and screenshots; keep
  screenshots as JPEG or reasonably sized PNG.
- The catalog schema is a public contract: changing a field means updating
  this ADR, `catalog.ts` and every entry.
