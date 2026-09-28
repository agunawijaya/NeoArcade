# 003 — Skyline Showdown: World Tour, rivals, cosmetics, badges and "So close!"

## Read first

1. `CLAUDE.md` (including the Arcade Pass rule added by prompt 002).
2. `docs/ARCADE-PASS.md`, `docs/adr/0006-arcade-pass.md`, `shared/pass/`.
3. `ports/skyline-showdown/docs/ARCHITECTURE.md`, `docs/games/skyline-showdown.md`,
   ADRs 0003–0005, and the port's code. Build on it; don't rewrite what works.

## Goal

Give Skyline Showdown a reason to come back tomorrow. Add a single-player
**World Tour** campaign against **rivals with personality**, a **wardrobe**
of cosmetics, a **badge set**, clear **"So close!" feedback** after a miss,
and wire the game into the **Arcade Pass**.

The duel itself stays exactly as it is: same physics, same rules. Everything
here is layered on top. Quick Match (today's settings screen) remains.

## Hard rules

- The engine stays pure, seeded and deterministic. New gameplay twists are
  **data** (stage modifiers) interpreted by the engine, each with tests.
- Cosmetics never change hitboxes, physics or information. A hat is a hat.
- Rivals' personalities come from how they play and what they say — never
  from national or ethnic stereotypes. Cities are evocative, not replicas
  of trademarked landmarks.
- Zero raster assets; light and dark themes; reduced motion respected.

## 1. Main menu

Title → **World Tour** · **Quick Match** · **Wardrobe** · **Badges** ·
Settings · How to play · Back to Hall. (Trick Shot and Daily arrive in 004 —
leave a tasteful slot or nothing, not a dead button.)

## 2. World Tour

A map screen: a code-drawn globe or route map with the next stop glowing,
then the Moon, Mars and Jupiter out in space. Four chapters, 15 stages:

| Chapter | Stages | Feel |
|---|---|---|
| 1 · Earth | 6 cities, the 6th is the chapter boss | Learn the game, one twist per city |
| 2 · Moon | 3 | Low gravity, no wind, huge arcs |
| 3 · Mars | 3 | Thin air, dust |
| 4 · Jupiter | 3, last is the final boss | Crushing gravity, storms |

Suggested city stops and twists — refine, replace or reorder if you find
better ones, and keep each twist easy to read on screen:

- **Jakarta** — monsoon gusts: wind re-rolls every turn (shown clearly).
- **Tokyo** — a neon billboard drone patrols a fixed route mid-air and
  blocks bananas; learn its timing.
- **Dubai** — supertall tower between the gorillas; a jet-stream band high
  up with its own, stronger wind.
- **Cairo** — heat haze: the wind arrow is hidden; read flags and smoke.
- **Rio** — a hillside city: buildings rise up a slope, gorillas at very
  different heights.
- **New York** (boss) — mixes two earlier twists.
- Space stages build on the existing worlds; add at least one new twist
  each (e.g. Moon: craters in the street that launch debris; Mars: a dust
  devil column that pushes sideways; Jupiter: lightning that can strike a
  rooftop between turns — telegraphed one turn ahead).

Each city gets its own skyline "kit" (facade style, roof shapes, palette,
sky) built from the existing `render/city.ts` and `backdrop.ts` systems.

**Stars per stage (1–3):** win the stage; win within a throw budget; win
without being hit. Stages are short (first to 2 points, bosses first to 3).
**Aim assist** is allowed but caps the stage at 1 star — say so on the stage
card. Chapters unlock by stars (e.g. 12 stars to leave Earth), so strong
play moves faster but anyone can finish by replaying.

Stage card before each duel: city name, rival portrait and banter line,
twist explained in one sentence with a tiny animated diagram, star goals.

## 3. Rivals

About 10 rivals (one per Earth city, plus space rivals and the final boss),
each with: name, code-drawn look (built from the wardrobe parts so they
show off unlockables), a signature colour, 3–5 short lines (intro, taunt on
a near miss, reaction when hit, defeat), and a **play style** expressed
through the existing `CPU_LEVELS` machinery plus style parameters — e.g.
prefers high lobs, fires flat and fast, overcorrects wildly, starts sharp
but gets rattled when hit. Difficulty rises across the tour; the final boss
is Brutal with a style of its own. Unit-test that each style really behaves
differently (angle distribution, correction pattern).

Beating a rival unlocks them as an opponent in Quick Match.

## 4. "So close!" feedback

After every miss by a human, show how close it was: distance to the
opponent in metres (define the scale in one constant; a gorilla ≈ 2 m),
short/long/over, a small marker on the skyline where it landed, and a
varied one-line comment ("Just a banana's width!", "Wind got that one.").
Never repeat the same line twice in a row. Keep it brief and out of the way;
fade before the next turn. The CPU's misses get a lighter version.

## 5. Wardrobe (cosmetics)

Per player (P1 and P2 each choose in hot-seat): gorilla fur tint, headwear,
eyewear, bandana/scarf, banana skin (classic, golden, fire, pixel,
glow-stick…), trail style, explosion style, victory dance. 40–60 items.
Unlocks come from World Tour stars, badges and Arcade Pass level. The
wardrobe shows a live preview gorilla doing its idle and victory animations,
locked items as silhouettes with "how to unlock".

## 6. Badges (Arcade Pass manifest)

`ports/skyline-showdown/pass.manifest.ts` with about 25 badges across tiers,
including counted and secret ones, for example: Sunburn (hit the sun 10×),
Moonshot (win on the Moon with a single throw), Oops (hit yourself), Demolition
(carve 100 craters), Long Distance (hit from the widest possible gap), Calm
Before the Storm (win using Calm Air), Globetrotter (finish Earth), Rival
Collector (beat every rival), Three-Star General (all stars). Write your own
names and flavour lines; make secrets funny.

XP awards: stage win, stars, rival first defeat, Quick Match win, and a small
amount for playing a full match. Follow the Pass caps.

## 7. Saves

World Tour progress, stars, unlocked rivals and wardrobe choices are this
game's own save (`neoarcade:skyline-showdown:tour`), versioned with a
migration path. Badges and XP go to the Pass.

## Workflow

1. Engine: stage modifiers (each twist) with tests; rival styles with tests.
2. Tour data, save, unlock rules; Pass manifest and awards.
3. Screens: main menu, map, stage card, results with stars, wardrobe,
   badges view (can reuse the Pass cabinet component filtered to this game).
4. "So close!" feedback.
5. Art-direction loops (at least four): screenshots of the map, every stage
   card, each city in play, each space stage, wardrobe, results, badge
   toasts, in light and dark, at 1440×900, 1024×768, 844×390 → critique → fix.
6. Playtest through Playwright: play the whole tour vs the rivals with a
   scripted "decent human" aimer; tune stars and chapter gates so a normal
   player finishes Earth in about 30–45 minutes and the full tour in a few
   sessions.

## Deliverables

- Features above, tests green, lint clean, build passes.
- Update all three docs in `ports/skyline-showdown/docs/`:
  ABOUT (the tour and rivals as a teaser), HOW-TO-PLAY (tour, stars, twists,
  wardrobe, badges, unlocks, tips per city), ARCHITECTURE (stage-modifier
  model, rival styles, saves, Pass integration — with Mermaid diagrams).
- `docs/games/skyline-showdown.md` diff log; new ADRs as needed
  (stage modifiers, rival styles).
- New screenshots in `media/`; Hall screens refreshed if they changed.
- `PORTS.md` updated. One commit: "Add World Tour, rivals and wardrobe to
  Skyline Showdown".

## Report at the end

What was built, the final stage list and twists, rival roster, badge list,
deviations and why, and anything prompt 004 needs.

## Suggested run

Opus 5.5, effort **xhigh**: "Read prompts/003-skyline-showdown-world-tour.md and do it."
