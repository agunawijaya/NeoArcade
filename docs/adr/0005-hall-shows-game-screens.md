# ADR 0005 — The Hall shows the games themselves

- **Status:** accepted
- **Date:** 2026-09-26
- **Amends:** [ADR 0002](0002-hall-catalog-and-covers.md)

## Context

The first Hall was an arcade room: drifting coloured lights, a neon floor
grid, and each game drawn as a cabinet with a marquee, joystick and coin
door, its screen showing a small code-drawn cover. With a real game in it,
the owner found it unappealing. The cabinet took most of the space while
the game itself was a thumbnail, and the cover was a simplified sketch that
no longer looked like the game. The one line of text under it did little
to say why anyone should play.

## Decision

- **Show the game, not a machine.** Each game is shown through its own
  screenshots from `ports/<slug>/media/`, listed in a new catalog field,
  `screens`, each with a short caption. They cross-fade in the spotlight
  and the detail panel; cards show the first one.
- **Invite, briefly.** Two more optional fields, `pitch` (two or three
  sentences) and `highlights` (up to four short lines), say what makes the
  game worth playing. The Hall shows them next to the screens with Play,
  How to play and About.
- **A spotlight, then the collection.** The newest game fills the top of
  the page. The full collection appears as cards once there are two or
  more games; search, genres and sorting from six. The room (ambience
  canvas, floor grid, cabinets, FREE PLAY lamp) is gone; the backdrop is
  the featured game's first screen, blurred into coloured light.
- **Covers stay, as the fallback.** A game with no screens, or whose images
  fail to load, still shows its animated cover, and the empty Hall still
  shows the self-test screens. The cover API is unchanged.

Screenshots are the port's own renders, not assets taken from the original
game, so this fits the project's "graphics by code" rule: the games are
still drawn by code, and the Hall simply shows what they look like.

## Consequences

- What players see in the Hall is exactly what they get when they press
  Play.
- Each port now owes the Hall a handful of good screenshots and a few lines
  of copy; the catalog test fails if a listed screenshot is missing.
- The Hall page loads a few hundred kilobytes of JPEG for the spotlight;
  images below the first are lazy-loaded.
- Cycling screens are motion. They pause on hover and focus, stop when the
  player picks one, wait while the tab is hidden, and never start with
  reduced motion.
