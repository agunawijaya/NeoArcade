# Ports tracker

| Game | Original language | Source folder | Genre | Status | Port folder | Notes |
|---|---|---|---|---|---|---|
| Skyline Showdown (QBasic Gorillas, 1990) | QBasic | `sources/Gorillas/` | Artillery / duel | done | `ports/skyline-showdown/` | Prompt 001. Four worlds, CPU (4 levels), power-ups, replays. Prompt 003: World Tour (15 stages, 9 twists), 10 rivals, wardrobe (60 items), So close, Arcade Pass (28 badges). Prompt 004: an engine that agrees bit for bit in Chromium, Firefox and WebKit; Trick Shot (24 puzzles, Puzzle Lab), Daily Skyline, challenge links; 35 badges. Notes: `docs/games/skyline-showdown.md`; ADRs 0003–0004, 0007–0008, 0012–0014. |
| Donkey Dash (DONKEY.BAS, 1981) | BASICA | `sources/Donkey/` | One-button reflex / duel | done | `ports/donkey-dash/` | Prompt 005. Classic Duel (the 1981 rules), Road Trip (5 routes × 3 legs), Endless, Daily Road, Donkey vs Driver; Chase, Classic and Isometric views; garage (29 items); Arcade Pass (25 badges). Notes: `docs/games/donkey-dash.md`; ADRs 0009–0011. |
| Long Haul (Trucker, early 1980s) | GW-BASIC | `sources/Trucker/` | Trucking simulation | done | `ports/long-haul/` | Prompt 006. The original rules, routes and verdicts with 11 bugs fixed; Single Haul (and the return trip), Career (19 hubs, 34 corridors, contracts, garage, reputation), Daily Haul; real time, leg by leg and the original's text mode; side diorama (32 landscapes) and cab view; truck stops, CB, 351 postcards, living weather, code-drawn map from Natural Earth; Arcade Pass (27 badges, 5 paints). Notes: `docs/games/long-haul.md`; ADRs 0015–0017. |

Status values: `queued` → `designing` → `building` → `polishing` → `done`.

## Infrastructure

| Piece | Status | Notes |
|---|---|---|
| Arcade Hall (`hall/`) | done | Prompt 000. Catalog, animated covers, detail panel, in-Hall docs, empty state. Prompt 002: light theme, masthead Pass chip, Pass page, badge counts. |
| Shared library (`shared/`) | done | Prompt 000. input, audio, rng, loop, storage, fx, hall-link, fonts. Prompt 002: pass. Prompt 005: daily, and a CGA palette in fx. |
| Arcade Pass (`shared/pass/`) | done | Prompt 002. One local profile: XP with a daily soft cap, 6 ranks, badges from per-port manifests (checked at build), arcade cosmetics, unlock toast, badge cabinet, backups. Dev harness: `hall/dev/pass-lab/`. Guide: `docs/ARCADE-PASS.md`; ADR 0006. Skyline Showdown reports to it since prompt 003, Donkey Dash since prompt 005, Long Haul since prompt 006. |
| Daily challenges (`shared/daily/`) | done | Prompt 005. UTC day keys and seeds, a log where the first run counts, streaks, a month grid, sharing by share sheet or clipboard. ADR 0009. Used by Donkey Dash, Long Haul's Daily Haul and, since prompt 004, Skyline Showdown's Daily Skyline. |
| Tooling | done | Prompt 000. Vite, Vitest, Playwright, ESLint, Prettier, Mermaid check (ADR 0001). |
