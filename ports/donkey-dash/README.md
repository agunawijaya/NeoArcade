# Donkey Dash

A country road at golden hour, a little orange hatchback, and donkeys. One
button moves you to the other lane, and that is the whole game, just as it
was in 1981. Donkey Dash keeps the original's duel of Donkey against Driver,
its climb up the road and its gloriously silly crash, then opens the road
up: a Road Trip across five routes, an Endless run that never stops getting
faster, a Daily Road that everyone drives the same, and a two-player mode
where your friend gets to be the donkey. Watch it from behind the car, from
straight above like the original, or as a tiny model world.

*Inspired by DONKEY.BAS, © IBM Corp. 1981, 1982.*

![A donkey trots over the crest of the hill at golden hour](media/chase.jpg)

## Run it

From the repository root:

```sh
npm install
npm run dev     # then open http://localhost:5173/ports/donkey-dash/
npm run build   # the built game is in dist/donkey-dash/
```

Tests: `npm test` runs the engine tests. The browser tests are

```sh
npx playwright test -c ports/donkey-dash --project=smoke --project=phone
npx playwright test -c ports/donkey-dash --project='determinism-*'
npx playwright test -c ports/donkey-dash --project=playtest
npx playwright test -c ports/donkey-dash --project=screens
```

The playtests have a scripted player drive the real page and check it ends
up exactly where the engine says it should; `screens` renders every mode,
view and route for art direction.

## Read more

- [About](docs/ABOUT.md): the original, and what this version adds.
- [How to play](docs/HOW-TO-PLAY.md): controls, modes, settings, tips.
- [Architecture](docs/ARCHITECTURE.md): how the code fits together.
- [Behaviour notes and change log](../../docs/games/donkey-dash.md).
- Decisions: [daily challenges](../../docs/adr/0009-daily-challenges.md),
  [camera views and fair sight](../../docs/adr/0010-camera-views-and-fair-sight.md),
  [the two-player donkey](../../docs/adr/0011-two-player-donkey.md).

## Credit

Based on *DONKEY.BAS*, "The IBM Personal Computer Donkey", © IBM Corp.
1981, 1982, the BASICA sample program that came with the first IBM PC.
This version is a new program written from scratch: no code, drawings or
title screen were copied, and every picture and sound in it is made by code.
