# Ports tracker

| Game | Original language | Source folder | Genre | Status | Port folder | Notes |
|---|---|---|---|---|---|---|
| Skyline Showdown (QBasic Gorillas, 1990) | QBasic | `sources/Gorillas/` | Artillery / duel | done | `ports/skyline-showdown/` | Prompt 001. Four worlds, CPU (4 levels), power-ups, replays. Notes: `docs/games/skyline-showdown.md`; ADRs 0003–0004. |

Status values: `queued` → `designing` → `building` → `polishing` → `done`.

## Infrastructure

| Piece | Status | Notes |
|---|---|---|
| Arcade Hall (`hall/`) | done | Prompt 000. Catalog, animated covers, detail panel, in-Hall docs, empty state. Prompt 002: light theme, masthead Pass chip, Pass page, badge counts. |
| Shared library (`shared/`) | done | Prompt 000. input, audio, rng, loop, storage, fx, hall-link, fonts. Prompt 002: pass. |
| Arcade Pass (`shared/pass/`) | done | Prompt 002. One local profile: XP with a daily soft cap, 6 ranks, badges from per-port manifests (checked at build), arcade cosmetics, unlock toast, badge cabinet, backups. Dev harness: `hall/dev/pass-lab/`. Guide: `docs/ARCADE-PASS.md`; ADR 0006. No game wired in yet (Skyline Showdown: prompt 003). |
| Tooling | done | Prompt 000. Vite, Vitest, Playwright, ESLint, Prettier, Mermaid check (ADR 0001). |
