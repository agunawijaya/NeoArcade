# Skyline Showdown

Two gorillas, two rooftops, one city at dusk, and a lot of exploding
bananas. Skyline Showdown keeps the physics and the rules of QBasic Gorillas
step for step: angle, velocity, wind, gravity, and the holes every miss
leaves in the skyline. Around them it builds a living city, expressive
gorillas, four worlds, a CPU that learns from its misses, and a **World
Tour**: fifteen stops from Jakarta to the eye of Jupiter's storm, each with
a twist and a rival with a style of their own. Earn stars, dress your
gorilla from a wardrobe of sixty items, collect badges on your Arcade Pass,
or play a friend on one keyboard in a Quick Match. For a couple of minutes
a day there is the **Daily Skyline**, one city for the whole planet,
**Trick Shot**, twenty-four one-throw puzzles, and **challenge links** that
send your best shot to a friend.

*Inspired by QBasic Gorillas, © Microsoft Corporation 1990.*

![Skyline Showdown at dusk](media/title.jpg)

## Run it

From the repository root:

```sh
npm install
npm run dev     # then open http://localhost:5173/ports/skyline-showdown/
npm run build   # the built game is in dist/skyline-showdown/
```

Tests: `npm test` runs the engine, tour, wardrobe, Trick Shot, daily and
challenge tests (including the World Tour's tuning and every puzzle's
reference solution). The browser tests are
`npx playwright test -c ports/skyline-showdown --project=smoke`, with
`screens` and `playtest` projects for screenshots, full matches against the
CPU and the whole World Tour played through, and `--project='determinism-*'`
to check the engine throws the same bits in Chromium, Firefox and WebKit
(after `npx playwright install firefox webkit`).

The Puzzle Lab, for designing Trick Shot puzzles, is on the dev server at
`/ports/skyline-showdown/dev/puzzles/`.

## Read more

- [About](docs/ABOUT.md): the original, and what this version adds.
- [How to play](docs/HOW-TO-PLAY.md): controls, the World Tour, Trick Shot,
  the Daily Skyline, challenge links, stars, the wardrobe, badges, settings,
  tips.
- [Architecture](docs/ARCHITECTURE.md): how the code fits together.
- [Behaviour notes and change log](../../docs/games/skyline-showdown.md).

## Credit

Based on *QBasic Gorillas* (`GORILLA.BAS`), © Microsoft Corporation 1990,
the sample program that shipped with QBasic in MS-DOS 5.0. This version is
a new implementation. No original code, graphics or music were copied.
