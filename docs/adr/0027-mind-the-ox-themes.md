# ADR 0027 — One engine, three themes

- **Status:** accepted
- **Date:** 2026-10-16
- **Context:** Mind the Ox (prompt 011)

## Context

The owner wanted three themes for Mind the Ox, all available from the
start: **Great War 1917** (historical flavour, roundels and crosses,
trenches, kite balloons), **Cyan vs Magenta** (a cartoon war between two
air corps named after the original's CGA colours, everyone bails out) and
**Airshow** (no combat with people: balloons, ribbons, markers, flour
bags). A theme must change the look, the names, the sounds and the words,
and never the game: a Daily Sortie flown in the Airshow must score exactly
what it scores in the Great War.

## Decision

1. **The engine has no theme.** Nothing in `src/engine/` knows which theme
   is chosen. Targets are `hangar`, `factory`, `depot` and `tank`; sides are
   `0` and `1`; a downed plane is a `plane-down` event. Themes live entirely
   above the engine.
2. **Three places hold a theme.**
   - `src/themes.ts`: the words. Each theme's name, its two sides, what each
     target kind is called, what the guns and bombs are, what happens to a
     downed pilot (`parachute` or `glide`), the four Dogfight rivals and the
     ace, and the captions ("Into the sun", "The End"). Campaign briefings
     and titles are written per theme in `game/campaign.ts`, in each
     theme's own voice, rather than templated.
   - `src/render/palette.ts` and `render/liveries.ts`: the colours. One
     palette per theme for day and for night (six in all), each side's
     livery and insignia (roundel, cross pattée, the Magenta diamond, the
     Bluebirds' star), the computer pilots' paint jobs per theme, and the
     player's cosmetics laid on top.
   - The painters: `render/side/targets*.ts` and `render/diorama/targets.ts`
     draw each target kind per theme; `render/scenery.ts` places themed
     props (trenches and kite balloons, signposts and blimps, marquees,
     grandstands and a big wheel); the particle and projectile painters
     turn explosions into confetti and bombs into flour bags at the
     Airshow; `audio/sounds.ts` swaps the gun's crack for a paint gun's pop.
3. **The Frame carries the theme.** `Frame.theme` and `Frame.palette`
   reach every painter; `Frame.liveries` gives each plane its paint for this
   theme and light, so the views never decide who wears what.
4. **Downed pilots follow the theme, by owner decision.** In the Great War
   every pilot bails out under a parachute in their side's colour (the
   owner preferred it to the historical 1917 picture, where only balloon
   observers had them). In Cyan vs Magenta everyone always bails out. At the
   Airshow nobody is shot down: a tagged plane trails smoke and glides in,
   and its crash is a puff of dust.
5. **Great War 1917 is the default** on first launch; the theme is a
   setting (title card arrows, Settings) and changes at once.

## Consequences

- Adding a theme means: a `ThemeCopy` in `themes.ts`, a day and night
  palette, rival looks and wingman look in `liveries.ts`, and a painter
  for each target kind in both views (or a fallback to an existing one),
  plus campaign copy. No engine change, no test change beyond copy checks.
- The engine's tests cover every theme at once, because there is only one
  engine; `campaign.test.ts` checks every theme has its copy.
- Gameplay words in the HUD and the results come from `themes.ts`, so a
  theme can never leave a "landship" in the Airshow.
