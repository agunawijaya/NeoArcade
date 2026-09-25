# 000 — Bootstrap the NeoArcade repo and the Arcade Hall

## Read first

1. `CLAUDE.md` (rules — they override anything below if there is a conflict)
2. `README.md`, `PORTS.md`, `sources/README.md`, `prompts/README.md`
3. Do **not** read or port anything in `sources/` in this session.

## Goal

Turn `E:\Projects\NeoArcade` into a working monorepo with:

- a tooling baseline every future port will reuse,
- a small `shared/` library,
- the **Arcade Hall** in `hall/` — the lobby where players browse and launch games,
- a one-command dev server and a one-command static build.

No games exist yet. The Hall must look great even when empty, and must show
a game as soon as one is registered in its catalog.

## Hard rules

- Zero raster assets. Everything in the Hall is drawn with CSS, SVG, Canvas
  or WebGL. Fonts: system stacks or a self-hosted open-licence font (OFL)
  committed to the repo — no runtime CDN calls.
- No UI framework (no React/Vue/Svelte). Plain TypeScript and DOM.
- No backend. The built site is static and works from any static host.
- Keep `sources/` untouched.

## Stack (write this as `docs/adr/0001-stack.md`)

Use unless you find a concrete reason not to — if you deviate, record why:

- TypeScript (strict), Vite (multi-page build: `hall/` plus every
  `ports/*/index.html` discovered automatically), Vitest for unit tests,
  Playwright for screenshot and smoke tests, ESLint + Prettier.
- Build output in `dist/`: `dist/index.html` is the Hall, each game at
  `dist/<game-slug>/`. Each built game must also run if its folder is copied
  out on its own (shared code is bundled into it, not linked across folders).
- Scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm test`,
  `npm run test:e2e`, `npm run lint`.

## shared/ — keep it small and genuinely reusable

- `input/` — unified keyboard, pointer/touch and gamepad input with a simple
  action-mapping API.
- `audio/` — Web Audio helpers: a tiny synth (oscillators, noise, envelopes,
  filters) for sound effects and music; one master volume and mute that
  remember their state; audio unlocked on first user gesture.
- `rng/` — seeded pseudo-random generator (for deterministic, testable engines).
- `loop/` — fixed-timestep game loop with interpolated rendering.
- `storage/` — namespaced `localStorage` wrapper for settings and high scores.
- `fx/` — optional post-processing pass (bloom, vignette, CRT scanlines)
  usable by any Canvas game; must degrade gracefully when WebGL is missing.

Each module gets unit tests. Don't build anything no game needs yet.

## The Arcade Hall

**Art direction:** a late-night arcade seen through a modern lens. A dark,
deep background with slow drifting light, glowing neon outlines, soft bloom,
cabinet-style game cards. It should feel like walking into a place, not
opening a file list. Tasteful, not noisy — motion is slow and ambient.

**Behaviour:**

- Reads `hall/catalog.json` (array of games: slug, title, tagline, original
  title/author/year, genre tags, players, accent colour, path, cover
  renderer id, docs links).
- Each game card has a **code-drawn animated cover** (a small canvas scene
  per game registered by the port itself — define the registration API
  now, e.g. `hall/covers/<slug>.ts` exporting a draw function).
- Card hover/focus: the cover comes alive, the cabinet glows.
- Card opens a detail panel: tagline, "Based on …" credit, genre, player
  count, buttons **Play**, **How to play**, **About** (these render the
  port's `docs/HOW-TO-PLAY.md` and `docs/ABOUT.md` as nicely styled pages
  inside the Hall, Mermaid diagrams rendered too).
- Filter by genre, search by title, sort (A–Z, recently added).
- Fully keyboard and gamepad navigable; works on phone (touch, portrait
  and landscape) and widescreen. Respects `prefers-reduced-motion`.
- Empty state: a friendly "The machines are warming up…" scene.
- Every game page gets a small consistent overlay button to return to the
  Hall (provide it from `shared/` so ports just include it).

For testing, add a throwaway placeholder game under `ports/_demo/` with a
trivial canvas and cover, registered in the catalog; remove it and its
catalog entry before finishing, after the screenshots prove it worked.

## Workflow

1. Scaffold tooling, ADR 0001, scripts. Make sure `npm run build` passes.
2. Build `shared/` with tests.
3. Build the Hall. Then loop at least three times:
   Playwright screenshots at 1440×900, 1024×768, 390×844 (portrait) →
   look at them critically as an art director → write what is weak →
   fix. Stop when it looks like a product, not a prototype.
4. Remove the `_demo` port, confirm the empty state looks good.

## Deliverables

- Working repo with the scripts above, all tests passing, lint clean.
- `docs/adr/0001-stack.md`, `docs/adr/0002-hall-catalog-and-covers.md`
  (catalog schema, cover API, how a port registers itself).
- `docs/HALL-ARCHITECTURE.md` with Mermaid diagrams (module map, how the
  Hall loads the catalog and covers, how docs are rendered).
- Update root `README.md` (how to run, how to add a game) and `PORTS.md`.
- Screenshots of the Hall in `hall/media/`.
- `git init`, sensible `.gitignore` (keep the existing `sources/*` rule),
  and one initial commit: "Bootstrap NeoArcade and the Arcade Hall".

## Report at the end

A short summary: what was built, any deviation from this prompt and why,
anything the next prompt (`001-skyline-showdown-port.md`) needs to know.
