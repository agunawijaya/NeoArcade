import { createLoop } from '@shared/loop';
import { otherPlayer } from '../../src/engine/gorillas';
import { previewTurn } from '../../src/engine/match';
import { METRES_PER_UNIT } from '../../src/game/so-close';
import { lookFor, PLAYER_ACCENTS } from '../../src/render/gorilla';
import { classicKit } from '../../src/render/kits';
import { Scene } from '../../src/render/scene';
import { Stage } from '../../src/render/stage';
import { marksFor, TargetView } from '../../src/render/targets';
import { judgeThrow } from '../../src/tricks/judge';
import { PACKS, PUZZLES } from '../../src/tricks/packs';
import { buildPuzzle, PAD_RADIUS_METRES, type BuiltPuzzle } from '../../src/tricks/puzzle';
import { puzzleProblems } from '../../src/tricks/validate';
import { DEFAULT_OUTFITS } from '../../src/wardrobe/items';
import {
  COARSE,
  FINE,
  scanPuzzle,
  summarise,
  type Outcome,
  type SolutionMap,
} from './solution-map';

/**
 * The puzzle lab, on the dev server only (the build never sees this page):
 * a puzzle in the game's own renderer with its reference solution drawn in,
 * what the validator thinks of it, and a map of every throw a player could
 * make, sorted into misses, solves and stylish solves. Edit a pack file and
 * the page reloads with the change.
 */
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = element<HTMLSelectElement>('puzzle');
const gridPicker = element<HTMLSelectElement>('grid');
const mapCanvas = element<HTMLCanvasElement>('map');
const stage = new Stage(element('stage'));
const COLOURS: Record<Outcome, string> = {
  miss: '#1a1530',
  solved: '#3fa9ff',
  styled: '#ffd23f',
  selfHit: '#ff4d6d',
};

for (const pack of PACKS) {
  const group = document.createElement('optgroup');
  group.label = pack.name;
  for (const puzzle of pack.puzzles) group.append(new Option(puzzle.name, puzzle.id));
  picker.append(group);
}
const fromAddress = new URLSearchParams(location.search).get('puzzle');
if (fromAddress) picker.value = fromAddress;

let built: BuiltPuzzle;
let scene: Scene;
let scan: Generator<SolutionMap> | null = null;
let map: SolutionMap | null = null;

function open() {
  const puzzle = PUZZLES.find((candidate) => candidate.id === picker.value) ?? PUZZLES[0];
  if (!puzzle) return;
  history.replaceState(null, '', `?puzzle=${puzzle.id}`);
  built = buildPuzzle(puzzle);
  const you = lookFor(DEFAULT_OUTFITS[0], PLAYER_ACCENTS[0]);
  const dummy = lookFor(DEFAULT_OUTFITS[1], '#ff5d5d');
  scene = new Scene(built.round, {
    timeOfDay: puzzle.timeOfDay ?? 0,
    theme: 'dark',
    weather: false,
    kit: classicKit(puzzle.world),
    looks: built.thrower === 0 ? [you, dummy] : [dummy, you],
    onThunder: () => undefined,
  });
  scene.targets = new TargetView(marksFor(built.targets, PAD_RADIUS_METRES / METRES_PER_UNIT));
  scene.markedTarget = built.targets.some((target) => target.kind === 'dummy')
    ? otherPlayer(built.thrower)
    : null;
  stage.setScene(scene);
  element('brief').textContent = `${puzzle.brief} Par ${puzzle.par}. Hint: ${puzzle.hint}`;
  const problems = puzzleProblems(puzzle);
  element('problems').replaceChildren(
    ...(problems.length > 0 ? problems : ['No problems.']).map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }),
  );
  tryThrow(puzzle.solution.angle, puzzle.solution.velocity);
  scan = scanPuzzle(built, gridPicker.value === 'fine' ? FINE : COARSE);
  map = null;
}

function tryThrow(angle: number, velocity: number) {
  const shot = previewTurn(built.start(), { angle, velocity, usePowerUp: true });
  const verdict = judgeThrow(built, shot);
  scene.guide = { shot, whole: true };
  element('tried').textContent =
    `${angle}° · ${velocity}: ${verdict.solved ? (verdict.styled ? 'solved with style' : 'solved') : `${verdict.failure}, ${verdict.metres} m`}`;
}

function drawMap() {
  if (!map) return;
  const context = mapCanvas.getContext('2d');
  if (!context) return;
  const width = map.angles.length;
  const height = map.velocities.length;
  if (mapCanvas.width !== width || mapCanvas.height !== height) {
    mapCanvas.width = width;
    mapCanvas.height = height;
  }
  context.fillStyle = COLOURS.miss;
  context.fillRect(0, 0, width, height);
  map.outcomes.forEach((row, x) =>
    row.forEach((outcome, y) => {
      if (outcome === 'miss') return;
      context.fillStyle = COLOURS[outcome];
      context.fillRect(x, y, 1, 1);
    }),
  );
  const { solution } = built.puzzle;
  const x = map.angles.findIndex((angle) => angle >= solution.angle);
  const y = map.velocities.findIndex((velocity) => velocity >= solution.velocity);
  context.fillStyle = '#ffffff';
  context.fillRect(x - 3, y, 7, 1);
  context.fillRect(x, y - 3, 1, 7);
  const summary = summarise(map);
  element('stats').textContent =
    `Solves ${(summary.solved * 100).toFixed(2)}% of the grid, with style ${(summary.styled * 100).toFixed(2)}%${
      summary.widest
        ? ` · widest stylish run ${summary.widest.width} around ${summary.widest.angle}° · ${summary.widest.velocity}`
        : ''
    }`;
}

mapCanvas.addEventListener('click', (event) => {
  if (!map) return;
  const bounds = mapCanvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * map.angles.length);
  const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * map.velocities.length);
  const angle = map.angles[x];
  const velocity = map.velocities[y];
  if (angle !== undefined && velocity !== undefined) tryThrow(angle, velocity);
});
picker.addEventListener('change', open);
gridPicker.addEventListener('change', open);

createLoop({
  update(step) {
    // A few rows of the map each frame, so the page stays responsive while it fills in.
    for (let row = 0; row < 6 && scan; row++) {
      const next = scan.next();
      if (next.done) scan = null;
      else map = next.value;
    }
    drawMap();
    scene.update(step, false);
    stage.camera.update(step);
  },
  render() {
    stage.render();
  },
}).start();

open();
