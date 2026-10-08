# NeoArcade backlog

Notes for the work ahead. Items move from **Idea** → **Approved** (owner
agreed it should happen) → **Designing** (being discussed in the architect
chat) → **Ready** (design agreed) → **Prompted** (a prompt in `prompts/`
exists) → **Done**. When a prompt is written for an item, link it in the row.

Per-game follow-ups suggested by Claude Code live next to each game, e.g.
`ports/donkey-dash/docs/IDEAS.md`. Anything from there that we decide to
build gets copied here first.

## Overview

| ID | Area | Item | Origin | Priority | Size | Status | Prompt |
|---|---|---|---|---|---|---|---|
| HALL-01 | Hall | Categories as shelves (Arcade, Adventure, Simulation, Puzzle…) | Owner | High | M | Prompted | [008](prompts/008-hall-shelves-today-timeline.md) |
| DD-01 | Donkey Dash | Rival Driver mode: two cars, three lanes, blocking and trapping | Owner | High | L | Prompted | [007](prompts/007-donkey-dash-rival-and-shifting-road.md) |
| DD-02 | Donkey Dash | Shifting road: lanes slide sideways, forcing moves (always on) | Owner | High | M | Prompted | [007](prompts/007-donkey-dash-rival-and-shifting-road.md) |
| HALL-02 | Hall | "Today in NeoArcade": all daily challenges in one place | Architect | Medium | S | Prompted | [008](prompts/008-hall-shelves-today-timeline.md) |
| HALL-03 | Hall | "Continue playing" row and recently played | Architect | Medium | S | Prompted | [008](prompts/008-hall-shelves-today-timeline.md) |
| HALL-04 | Hall | Origins timeline: browse games by the year of the original | Architect | Low | M | Prompted | [008](prompts/008-hall-shelves-today-timeline.md) |
| PASS-01 | Arcade Pass | Weekly cross-game challenges | Architect | Medium | M | Approved | – |
| X-01 | All games | Shared global settings and one consistent pause menu | Architect | Medium | M | Approved | – |
| X-02 | All games | Install as an app and play offline (PWA) | Architect | Medium | S | Approved | – |
| QA-01 | Quality | Real-device and real-player playtests | Architect | High | S | Approved | – |
| QA-02 | Quality | Accessibility audit (WCAG 2.1 AA) of the Hall and every game | Architect | Medium | M | Approved | – |
| QA-03 | Quality | Performance budget per game, checked in CI | Architect | Medium | S | Approved | – |
| OPS-01 | Repo | GitHub remote, CI (lint, tests, build, Playwright) on every push | Architect | High | S | Approved | – |
| OPS-02 | Repo | Hosting, public or private, licence choice | Architect | High | S | Approved | – |
| FL-01 | Flight 312 | New port of JETSET: flight model (4 realism levels), 3D world, classic jumbo cockpit | Owner | High | L+ | Prompted | [009](prompts/009-flight-312-core.md) |
| FL-02 | Flight 312 | Glass cockpit, flight school, Daily Approach, landing replays | Owner | High | L | Prompted | [010](prompts/010-flight-312-glass-and-academy.md) |
| FL-03 | Flight 312 | ATC voice option B: pre-rendered phrase clips through a full Web Audio radio filter | Owner | Low | M | Idea | – |

Sizes: **S** = small, can share a prompt with others · **M** = one prompt ·
**L** = one large prompt. Suggested bundles: DD-01 + DD-02 in one prompt;
HALL-01…04 in one prompt; OPS-01 + QA-03 together.

---

## HALL-01 — Categories in the Hall

**Today:** each game has free-form `genres` in `hall/catalog.json`
(Skyline Showdown: Artillery, Duel · Donkey Dash: Arcade, Reflex ·
Long Haul: Simulation, Strategy). That won't scale to dozens of games.

**Decided:**

- A fixed list of **categories**; each game has exactly one primary
  category, while `genres` stay as finer tags. Starting list:
  Arcade · Action · Adventure · Simulation · Strategy · Puzzle · Sports ·
  Card & Board · Word & Trivia · Learning.
- Current games: **Skyline Showdown → Arcade**, Donkey Dash → Arcade,
  Long Haul → Simulation.
- Each category gets an accent colour and a small code-drawn emblem; empty
  categories are hidden; "All" stays the default.
- The catalog schema and its build-time validation enforce the fixed list.

- **Shelves**, one scrolling row per category (owner decision).
- A game **may have a second category** and then appears on both shelves.

---

## DD-01 — Donkey Dash: Rival Driver mode

**Idea (owner):** a second driver on the road. The road becomes **three
lanes**; both cars always move at the **same speed**. A car **cannot move
into a lane another car occupies**, so one car can box the other in and
force it into a donkey.

| Topic | Proposal |
|---|---|
| Lanes | Three lanes. Each car always in one lane. |
| Blocking | A move into an occupied lane is refused (a short bump and horn); the car stays put. |
| Same-moment moves | If both cars try to enter the same free lane in the same tick, neither moves. Deterministic and fair. |
| Controls | Two buttons per driver (left/right; touch: two zones per player). The one mode that breaks the one-button rule. |
| Donkeys | Never all three lanes at once: a crash is always a choice or a trap, never pure bad luck. |
| Points | Hitting a donkey gives the **other** driver a point. Reaching the top first ends the round, as in the original. |
| Cars touching | Cars never collide with each other; they only block. |
| Who plays | Two humans on one screen, or human vs CPU (Easy → Brutal; the CPU sets traps at higher levels). |
| Views | All three camera views, same reaction window in each. |
| With DD-02 | Shifting lanes apply here too, which makes trapping richer. |

**Decided:** two buttons per driver; both vs Friend and vs CPU. Refined in prompt 007: both cars stay side by side on the same row; progress is a race meter per driver; a crash sends that car back to the start of its meter (as in 1981); first to fill the meter wins the round.

---

## DD-02 — Donkey Dash: shifting road

**Decided (owner): always on** — no setting to turn it off.

- With two lanes on a wider set of positions W X Y Z, the open pair moves
  over time (`XY → YZ → XY → WX …`). Three lanes likewise (`WXY → XYZ`).
  A car on a closing lane must move.
- A closing lane is telegraphed with cones, chevrons and a "lane ends" sign,
  at least one full reaction window ahead.
- Staying on a closed lane = hitting the barrier, scored like a donkey
  crash, with its own funny crash animation.
- The generator checks every pattern with the deterministic engine so a safe
  path **always exists**, donkeys included.
- Chase view: the shifts read as real curves. Classic and Isometric: the
  road snakes across the landscape.
- Applies to every mode, **Classic Duel included** (owner decision), with a
  gentler shift rate there.
- New badges (e.g. "Lane Changer", "Merge Master"). Existing tuning (Road
  Trip curve, Daily Road seeds) must be re-balanced; past daily results stay
  valid as records.

---

## FL-03 — Flight 312: ATC voice clips with a real radio filter (option B)

**Today (option A, in prompt 009):** ATC speaks through the browser's Web
Speech API with local voices only. Its output cannot pass through Web
Audio, so the radio sound is only approximated (clicks and static around
clean speech), and voice quality depends on the player's OS and browser.

**Option B:**

- ATC phraseology is a small vocabulary: digits, "niner", headings,
  altitudes, frequencies, callsign, airport and fix names, and a few dozen
  fixed phrases ("turn right heading", "climb and maintain", "cleared ILS
  runway … approach", "contact … on …", "cleared to land", "go around").
- Render these as short clips **once, at development time**, with an
  open-source text-to-speech engine whose voice licence allows
  redistribution (check each voice's licence; avoid GPL tooling inside the
  shipped game). Several voices, one per controller.
- At runtime, sentences are stitched from clips and played through a full
  Web Audio radio chain: band-pass (~300–3,000 Hz), light distortion and
  compression, static bed, squelch tail, occasional signal fade by
  distance from the station.
- Same sound on every browser and device. Cost: about 3–8 MB of audio,
  loaded lazily after the cockpit appears.
- Needs an exception in `CLAUDE.md` ("audio is synthesized") for voice
  clips only, plus an ADR (TTS engine, voice licences, clip format,
  stitching rules).
- Keep option A as the fallback if clips fail to load or the player picks
  "browser voice" in Settings.

**Decide later:** which TTS engine and voices; whether other games
(Long Haul's CB radio, the flight school instructor) should use it too.

---

## Architect suggestions (approved)

- **HALL-02 Today in NeoArcade:** one panel with Daily Skyline, Daily Road
  and Daily Haul, today's status and streaks.
- **HALL-03 Continue playing:** last game and mode, one click to resume;
  recently played row.
- **HALL-04 Origins timeline:** a code-drawn timeline from 1981 placing each
  original (DONKEY.BAS 1981, Trucker early '80s, Gorillas 1990…).
- **PASS-01 Weekly challenges:** three small goals per week across games,
  extra XP and a weekly badge.
- **X-01 Shared settings:** master volume, theme and reduced motion set once
  in the Hall and respected everywhere; one consistent pause menu.
- **X-02 PWA:** add to home screen, offline play, update prompt.
- **QA-01 Playtests:** short sessions with real players, including someone
  who never played the originals.
- **QA-02 Accessibility:** contrast, focus order, screen-reader labels,
  colour-blind-safe cues in every game.
- **QA-03 Performance:** a budget per game and a CI check.
- **OPS-01 / OPS-02:** public vs private, licence for the port code,
  `sources/` stays out, CI and hosting.

---

## Which AI model for which item

### What the past runs actually cost

Measured from the Claude Code session logs on this machine
(`~/.claude/projects/E--Projects-NeoArcade/`), all on Claude Opus 5.5.
"Processed" = fresh input + cache writes + cache reads. Agentic sessions
re-read their context on every step, so cache reads dominate.

| Prompt | Size | Processed input | of which cache reads | Output | API-equivalent* |
|---|---|---|---|---|---|
| 000 Hall bootstrap | M | 84.7 M | 83.2 M | 0.43 M | ≈ $50 |
| 001 Skyline Showdown | L | 128.1 M | 127.5 M | 0.40 M | ≈ $60 |
| 002 Arcade Pass | L | 182.8 M | 180.2 M | 0.48 M | ≈ $95 |
| 003 World Tour | L | 119.2 M | 118.4 M | 0.44 M | ≈ $60 |
| 005 Donkey Dash | L | 64.5 M + part of another session | 63.6 M | 0.16 M+ | ≈ $35+ |

004 and 006 were not found in these logs (run elsewhere). \*API-equivalent
assumes Opus 5.5 at $4 input / $20 output per million, cache reads at
~10% and cache writes at ~125% of input — check current pricing. On a Claude
Max subscription this shows up as usage-limit consumption, not a bill.

### Rule of thumb from those runs (Claude Opus 5.5)

| Size | Processed input | Output | API-equivalent | Wall time |
|---|---|---|---|---|
| S | 15–40 M | 0.05–0.15 M | $8–25 | 30–90 min |
| M | 50–120 M | 0.15–0.35 M | $25–60 | 2–4 h |
| L | 120–200 M | 0.35–0.60 M | $60–100 | 4–9 h |

Sonnet 5 uses a different tokenizer (more tokens for the same text) at half
the price; expect a similar or slightly larger token count and roughly
40–60% of the Opus cost. Fable 5.1 costs 2.5× Opus per token; reserve it for
a rerun if Opus struggles.

### Version 1 — with Claude (Claude Code)

| Item | Model | Effort | Est. processed input | Est. output | Why |
|---|---|---|---|---|---|
| DD-01 + DD-02 (one prompt) | Opus 5.5 | xhigh | 150–200 M | 0.4–0.6 M | Engine rules, solvability generator, trap-setting CPU, three views, re-tuning |
| HALL-01…04 (one prompt) | Opus 5.5 | high | 90–140 M | 0.3–0.45 M | Visual design work across the Hall; schema change |
| HALL-01 alone | Opus 5.5 | high | 50–80 M | 0.15–0.25 M | |
| HALL-02 / HALL-03 alone | Sonnet 5 | high | 15–35 M each | 0.05–0.12 M | Small UI on existing data |
| HALL-04 alone | Opus 5.5 | high | 40–70 M | 0.12–0.2 M | Mostly art direction |
| PASS-01 | Opus 5.5 | high | 60–100 M | 0.2–0.3 M | Touches every game; week seeding must stay deterministic |
| X-01 | Opus 5.5 | high | 70–110 M | 0.2–0.3 M | Refactor across three games; regression risk |
| X-02 | Sonnet 5 | high | 20–40 M | 0.06–0.12 M | Well-trodden pattern |
| QA-01 | Sonnet 5 | medium | 10–20 M | 0.03–0.06 M | Checklist and feedback form; the playtest itself is human work |
| QA-02 | Opus 5.5 | high | 60–100 M | 0.2–0.3 M | Audit plus fixes in four apps |
| QA-03 + OPS-01 | Sonnet 5 | medium | 15–30 M | 0.05–0.1 M | Config and scripts |
| OPS-02 | Sonnet 5 | medium | 10–20 M | 0.03–0.06 M | Mostly owner decisions; small setup |

Avoid Haiku 4.5 for this repo: it has an announced earliest retirement date
of 15 October 2026 and is weaker at long agentic runs.

### Version 2 — without Claude

Model names and prices from a third-party comparison updated 23 September
2026 (teamday.ai); check before use. All of these agents should read
`AGENTS.md`, which points to `CLAUDE.md`, so the house rules still apply.

| Tier of work | OpenAI (Codex) | Google (Antigravity) | Moonshot (Kimi) | Alibaba (Qwen Code) |
|---|---|---|---|---|
| **L** — DD-01+02, Hall bundle | GPT-6 Astra, effort xhigh | Gemini 3.1 Pro (High) — Pro successor not yet released | Kimi K3 | Qwen3.8-Max |
| **M** — HALL-01, HALL-04, PASS-01, X-01, QA-02 | GPT-6 Sol, high | Gemini 3.8 Flash (High) | Kimi K3 or K2.7 Code | Qwen3.8-Max or Qwen 3.7 Plus |
| **S** — HALL-02/03, X-02, QA-01/03, OPS | GPT-6 Sol, medium | Gemini 3.8 Flash (Medium) | Kimi K2.7 Code | Qwen 3.7 Plus or Qwen3.8-Flash |

Notes for non-Claude runs:

- Token counts depend on each vendor's tokenizer, harness and caching, so
  the Claude numbers above are a starting estimate only — expect the same
  order of magnitude, measure the first run.
- Start with an **S** item (e.g. OPS-01) to see how the agent follows
  `CLAUDE.md` before trusting it with an L item.
- For items that change engine rules (DD-01/02, PASS-01), the deterministic
  tests are the safety net: whichever model runs them, all tests must pass in
  Chromium, Firefox and WebKit before merging.
- Visual quality of code-drawn art varies most between models; keep the
  screenshot critique loops in every prompt.
