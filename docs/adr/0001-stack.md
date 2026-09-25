# ADR 0001 — The NeoArcade stack

- **Status:** accepted
- **Date:** 2026-09-25

## Context

NeoArcade is a monorepo of web ports of classic games plus a lobby, the
Arcade Hall. Every port is built by a separate Claude Code session, so the
tooling has to be boring, strict and identical for everyone. The built site
must be static (no server code) and each game must survive being copied out
of the site on its own.

## Decision

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript, `strict` plus `noUncheckedIndexedAccess` | One `tsconfig.json` for the whole repo. |
| Bundler / dev server | Vite 8 | See "Build layout" below. |
| Unit tests | Vitest | `*.test.ts` next to the code. DOM tests opt in with `// @vitest-environment jsdom`. |
| Browser tests | Playwright (Chromium) | Smoke tests and screenshots, run against the **production build**. |
| Lint / format | ESLint (flat config, `typescript-eslint`) + Prettier | `npm run lint` runs both. Markdown is not reformatted. |
| UI | Plain TypeScript and DOM | No UI framework. |
| Graphics | Canvas 2D, SVG, CSS, WebGL | Zero raster assets in the product. |
| Fonts | System stacks, plus **Tilt Neon** (SIL OFL 1.1) self-hosted in `shared/fonts/` | Subset to Latin, 23 KB woff2. No CDN calls. |
| Markdown in the Hall | `marked` | Port docs are rendered inside the Hall. |
| Diagrams in the Hall | `mermaid`, bundled | Loaded lazily, only when a document contains a diagram. |

Shared code is imported through the `@shared/*` alias
(`import { createRng } from '@shared/rng'`), configured once in
`scripts/vite-shared.ts` and `tsconfig.json`.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | One dev server for everything. `/` redirects to the Hall at `/hall/`; games are at `/ports/<slug>/`. |
| `npm run build` | Type-checks, then builds the Hall and every port into `dist/`. |
| `npm run preview` | Serves `dist/` on port 4173. |
| `npm test` | Vitest, once. `npm run test:watch` keeps it running. |
| `npm run test:e2e` | Builds, previews and runs the Playwright smoke tests on a desktop and a phone profile. |
| `npm run screenshots` | Playwright screenshots of the Hall into `hall/media/` (`SCREENSHOT_DIR` overrides). |
| `npm run lint` / `npm run format` | ESLint + Prettier check / fix. |

### Build layout

```
dist/
├── index.html        the Hall
├── assets/           the Hall's code, fonts, bundled docs and screenshots
└── <slug>/           one folder per port, fully self-contained
    ├── index.html
    └── assets/
```

`scripts/build.ts` discovers pages automatically: `hall/index.html` plus every
`ports/*/index.html`. Nothing needs registering for the build to pick up a new
port.

## Deviations from the brief, and why

1. **One Vite build per page instead of one multi-page build.** A single
   Rollup/Rolldown graph hoists code shared between pages (the `shared/`
   modules) into a common `dist/assets/` chunk. A game folder copied out of
   `dist/` would then be missing code. Building each page separately with
   `base: './'` bundles `shared/` into every game and keeps every URL
   relative. The cost is a few duplicated kilobytes per game. An e2e test
   checks that a game page loads nothing outside its own folder.
2. **The dev server serves the repo root.** Production puts games next to the
   Hall (`dist/<slug>/`); in development they stay where they live
   (`/ports/<slug>/`). The Hall and the shared "back to Hall" button pick the
   right URL with `import.meta.env.DEV`. This avoids a URL-rewriting layer
   that would make relative module paths ambiguous.
3. **The catalog is bundled, not fetched.** `hall/catalog.json` is imported at
   build time. Covers and docs are bundled anyway, so adding a game already
   needs a rebuild; bundling removes a request and a failure mode.
4. **`lodash-es` is pinned through `overrides`.** Mermaid 12 pulls in an old
   `lodash-es` through `chevrotain` with published advisories. The override
   moves it to the patched 4.18 line; `npm audit` is clean.
5. **Build warnings tuned.** `chunkSizeWarningLimit` is raised to 1.6 MB
   because Mermaid's layout engines are large by nature and only ever loaded
   on demand.

## Consequences

- A new port is picked up by `npm run build` as soon as it has an
  `index.html`, but it only appears in the Hall once it is in the catalog
  (see ADR 0002).
- Playwright uses the Chromium build already installed for the user
  (`%LOCALAPPDATA%\ms-playwright`); `npx playwright install chromium` fetches
  it on a fresh machine.
- Tests that need a real GPU or audio device are limited to what jsdom can
  fake; the WebGL path of `shared/fx` is exercised by the e2e run instead.
