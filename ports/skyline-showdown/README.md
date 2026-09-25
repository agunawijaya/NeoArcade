# Skyline Showdown

Two gorillas, two rooftops, one city at dusk, and a lot of exploding
bananas. Skyline Showdown keeps the physics and the rules of QBasic Gorillas
step for step: angle, velocity, wind, gravity, and the holes every miss
leaves in the skyline. Around them it builds a living city, expressive
gorillas, four worlds, a CPU that learns from its misses, power-ups on
balloons and slow-motion replays. Play a friend on one keyboard, or take on
the CPU from Easy to Brutal.

*Inspired by QBasic Gorillas, © Microsoft Corporation 1990.*

![Skyline Showdown at dusk](media/title.jpg)

## Run it

From the repository root:

```sh
npm install
npm run dev     # then open http://localhost:5173/ports/skyline-showdown/
npm run build   # the built game is in dist/skyline-showdown/
```

Tests: `npm test` runs the engine tests. The browser tests are
`npx playwright test -c ports/skyline-showdown --project=smoke`, with
`screens` and `playtest` projects for screenshots and full matches against
the CPU.

## Read more

- [About](docs/ABOUT.md): the original, and what this version adds.
- [How to play](docs/HOW-TO-PLAY.md): controls, settings, power-ups, tips.
- [Architecture](docs/ARCHITECTURE.md): how the code fits together.
- [Behaviour notes and change log](../../docs/games/skyline-showdown.md).

## Credit

Based on *QBasic Gorillas* (`GORILLA.BAS`), © Microsoft Corporation 1990,
the sample program that shipped with QBasic in MS-DOS 5.0. This version is
a new implementation. No original code, graphics or music were copied.
