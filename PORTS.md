# Ports tracker

| Game | Original language | Source folder | Genre | Status | Port folder | Notes |
|---|---|---|---|---|---|---|
| Skyline Showdown (QBasic Gorillas, 1990) | QBasic | `sources/Gorillas/` | Artillery / duel | queued | `ports/skyline-showdown/` | Prompt 001 |

Status values: `queued` → `designing` → `building` → `polishing` → `done`.

## Infrastructure

| Piece | Status | Notes |
|---|---|---|
| Arcade Hall (`hall/`) | done | Prompt 000. Catalog, animated covers, detail panel, in-Hall docs, empty state. |
| Shared library (`shared/`) | done | Prompt 000. input, audio, rng, loop, storage, fx, hall-link, fonts. |
| Tooling | done | Prompt 000. Vite, Vitest, Playwright, ESLint, Prettier, Mermaid check (ADR 0001). |
