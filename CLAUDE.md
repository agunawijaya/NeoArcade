# CLAUDE.md — NeoArcade

You are building modern web ports of classic games. Read this file first,
then the prompt you were given in `prompts/`.

## Ground rules

- **`sources/` is read-only.** Never edit, move, reformat or delete anything there.
  Read it to understand the game; write only into your own `ports/<game>/` folder.
- **One game per session.** Don't touch other ports. Shared code in `shared/`
  changes only when the prompt says so.
- **Graphics by code.** Default is zero raster assets: draw with Canvas, SVG,
  WebGL or CSS. Don't copy original sprites, fonts, title screens or music
  data. If a prompt allows raster art, it will say so explicitly.
- **Keep the game, change the look.** Preserve rules, pacing and the moments
  players remember. Every deliberate change goes in `docs/games/<game>.md`.
- **Engine before pixels.** Game logic lives in a plain module with a seeded
  RNG and no DOM access, covered by tests. Rendering sits on top of it.
- **Works everywhere.** Keyboard, mouse/touch, and a gamepad where it makes
  sense. Scales from phone to widescreen. Respects `prefers-reduced-motion`.
- **No git commits** unless the prompt asks. Update `PORTS.md` once, at the end.

## Code style — write it like a person would

The code should read as if a thoughtful developer wrote it by hand:

- Clear, specific names (`bananaVelocity`, not `bv` or `data2`).
- Small functions that each do one thing; no giant god-objects.
- Comments explain *why*, not *what*. No boilerplate banners, no comment on
  every line, no "This function does X" restating the signature.
- Consistent, natural formatting. No dead code, no leftover debug logs,
  no placeholder TODOs left behind.
- Prefer plain, readable solutions over clever ones.

## Every port ships with

- `ports/<game>/index.html` — playable on its own; the built output needs no
  server-side code.
- `ports/<game>/README.md` — short: one-paragraph pitch, how to run, links to
  the three docs below, credit to the original.
- `docs/games/<game>.md` — original behaviour notes and a diff log of changes.
- Tests for the engine, and a few screenshots in `ports/<game>/media/`.
- An entry in the Arcade Hall catalog and in `PORTS.md`.

## The three required documents (every port, no exceptions)

All three live in `ports/<game>/docs/`, are Markdown, and draw every diagram
as a fenced ```mermaid block (no images of diagrams). Mermaid must render on
GitHub — validate each block with `npx @mermaid-js/mermaid-cli` before finishing.

1. **`ABOUT.md` — the brochure.** Written to make a stranger want to play.
   - The original: title, developer/author, publisher, year, platform and
     language, and where it first appeared (disk, magazine, book, bundle).
     Only state facts you can support from the source file or well-known
     history; if unsure, say so rather than invent.
   - What made the original special and why people remember it.
   - The port: what it keeps, what is new, why it is worth playing today.
   - Tone: warm, vivid, teaser-like. Include 2–3 screenshots from `media/`.
2. **`HOW-TO-PLAY.md` — the player's guide.**
   - Goal of the game, controls (keyboard, mouse/touch, gamepad) in a table,
     step-by-step first game, every setting and preset and what it changes,
     difficulty levels, scoring rules, power-ups or special items if any,
     tips and tricks (how to win, how not to lose), and a short FAQ.
   - Written for players, no code talk.
3. **`ARCHITECTURE.md` — the programmer's map.**
   - Module overview (Mermaid diagram), folder tree with one line per file,
     game loop and state machine (Mermaid), engine rules and formulas,
     rendering pipeline, where every visual "asset" lives (the code that
     draws each thing, palettes, shaders, audio synth patches), how settings
     flow through the app, how tests are organised, and a "how to extend"
     section (add a power-up, add a world, tweak the AI, etc.).
