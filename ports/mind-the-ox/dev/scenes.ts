import { generateMap } from '../src/engine/map';
import { createMatch, stepMatch, type Match, type MatchSetup } from '../src/engine/match';
import { MODERN_RULES } from '../src/engine/rules';
import { searchlightBeams } from '../src/engine/sight';
import type { Seat } from '../src/engine/sim';
import { RIGHT, cosine, sine } from '../src/engine/trig';
import type { Plane } from '../src/engine/world';
import { botControls, createBotMemory } from '../src/engine/bot';
import { chapterById } from '../src/game/campaign';
import { planMode } from '../src/game/modes';
import { buildSeaScene, SEA_SCENES, type SeaSceneId } from './sea-scenes';
import { base, benchComputers, fly, place, type Scene } from './staging';

/**
 * Staged moments for the hero frames and the screenshots: each builds a
 * real match, flies it with scripted pilots for a while so the smoke,
 * craters and wreckage are genuine, and says where to point the camera.
 */
export type SceneId =
  'dogfight' | 'bombing' | 'sun' | 'fog' | 'night' | 'convoy' | 'herd' | SeaSceneId;

const SEED = 1917;

function seats(): Seat[] {
  return [
    { side: 0, pilot: { kind: 'human', level: 'normal', territory: null }, base: 0, maxCrashes: 5 },
    {
      side: 1,
      pilot: { kind: 'cpu', level: 'normal', territory: null },
      base: 1,
      maxCrashes: Number.POSITIVE_INFINITY,
    },
  ];
}

function newMatch(): Match {
  const map = generateMap({ seed: SEED });
  return createMatch({
    rules: MODERN_RULES,
    mapFor: () => map,
    seats: seats(),
    seed: SEED,
    rounds: Number.POSITIVE_INFINITY,
    versus: false,
  });
}

function chapterMatch(id: string): Match {
  const plan = planMode(
    { kind: 'campaign', chapter: id },
    { seed: SEED, flight: 'smooth', autoRoll: true, secretWeapons: false },
  );
  const setup: MatchSetup = plan.setup;
  return createMatch(setup);
}

export function buildScene(id: SceneId, onTick: (match: Match) => void): Scene {
  if ((SEA_SCENES as readonly string[]).includes(id))
    return buildSeaScene(id as SeaSceneId, onTick);
  if (id === 'fog' || id === 'night' || id === 'convoy' || id === 'herd')
    return chapterScene(id, onTick);
  const match = newMatch();
  const [player, enemy] = match.world.planes as [Plane, Plane];
  const home = match.world.map.bases[0]?.x ?? 1200;

  if (id === 'dogfight') {
    // On an enemy's tail over the farmland, guns hammering; the enemy already smoking.
    place(player, home + 300, 128, RIGHT + 90, 7);
    place(enemy, home + 352, 142, RIGHT + 150, 6);
    enemy.pilot = { ...enemy.pilot, kind: 'human' };
    enemy.wounded = true;
    fly(
      match,
      70,
      (tick) => [
        { throttle: 1, fire: tick > 30, pitch: tick % 40 < 18 ? 0.25 : 0 },
        { pitch: 0.2, throttle: 1 },
      ],
      onTick,
    );
    return base(
      { match, focus: player, cameraX: (player.x + enemy.x) / 2 + 20, sun: null },
      { scoreShown: 650 },
    );
  }

  if (id === 'bombing') {
    // A low pass over enemy targets: the first bomb has left a burning crater, the second is on its way.
    const terrain = match.world.terrain;
    const clearAhead = (x: number, height: number) =>
      terrain.highestBetween(x, x + 260) < height - 18;
    const middle = match.world.map.width / 2;
    const candidates = match.world.targets
      .filter((candidate) => candidate.side === 1 && clearAhead(candidate.x - 92, candidate.y + 50))
      .sort(
        (a, b) =>
          Number(b.kind === 'depot') - Number(a.kind === 'depot') ||
          Math.abs(a.x - middle) - Math.abs(b.x - middle),
      );
    const target =
      candidates[0] ??
      (match.world.targets.find((candidate) => candidate.side === 1) as NonNullable<
        (typeof match.world.targets)[number]
      >);
    benchComputers(match);
    // A bomb dropped from fifty units up at speed five lands about sixty units on.
    place(player, target.x - 92, target.y + 50, RIGHT, 5);
    player.throttle = 1;
    fly(match, 200, (tick) => [{ bomb: tick === 30 || tick === 176 }], onTick);
    return base({ match, focus: player, cameraX: target.x + 20, sun: null }, { scoreShown: 1250 });
  }

  // The round is won; the winner climbs away into the sun.
  for (const target of match.world.targets) if (target.side === 1) target.standing = false;
  place(player, home + 520, 120, RIGHT + 120, 6);
  benchComputers(match);
  fly(match, 285, () => [{}], onTick);
  return base(
    { match, focus: player, cameraX: undefined, sun: Math.min(1, match.phaseTicks / 360) },
    { scoreShown: 2400 },
  );
}

/** Moments from the campaign's twists, on the chapters' own hand-drawn maps. */
function chapterScene(
  id: 'fog' | 'night' | 'convoy' | 'herd',
  onTick: (match: Match) => void,
): Scene {
  const chapterId = {
    fog: 'pea-soup',
    night: 'lantern-raid',
    convoy: 'supply-road',
    herd: 'ox-pasture',
  }[id];
  const match = chapterMatch(chapterId);
  const chapter = chapterById(chapterId);
  const player = match.world.planes[0] as Plane;
  benchComputers(match);
  const label = chapter?.title['great-war'] ?? 'Round 1';

  if (id === 'fog') {
    // Sliding down into the fog bank over the hidden works, the guns gone quiet.
    const bank = match.world.map.fog[1] ?? match.world.map.fog[0];
    const x = (bank?.left ?? 1800) - 60;
    place(player, x, (bank?.top ?? 90) + 30, RIGHT - 160, 6);
    fly(match, 90, () => [{ pitch: 0.15 }], onTick);
    return base({ match, focus: player, cameraX: x + 140, sun: null }, { label, scoreShown: 900 });
  }

  if (id === 'night') {
    // Caught in a searchlight over the enemy airfield, the guns opening up.
    fly(match, 1, () => [{}], onTick);
    const [beam] = searchlightBeams(match.world);
    const reach = 150;
    const x = (beam?.x ?? 1900) + cosine(beam?.heading ?? 1024) * reach;
    const y = (beam?.y ?? 50) + sine(beam?.heading ?? 1024) * reach;
    place(player, x - 40, y, RIGHT + 40, 6);
    fly(match, 45, () => [{ fire: true }], onTick);
    return base(
      { match, focus: player, cameraX: x, sun: null },
      { night: true, label, scoreShown: 1400 },
    );
  }

  if (id === 'herd') {
    // A low, careful pass over the herd, the targets between the oxen.
    const oxen = match.world.oxen;
    const herd = oxen[oxen.length - 2] ?? oxen[0];
    place(player, (herd?.x ?? 2000) - 120, (herd?.y ?? 50) + 34, RIGHT - 40, 5);
    fly(match, 60, () => [{ pitch: 0.2 }], onTick);
    return base(
      { match, focus: player, cameraX: (herd?.x ?? 2000) + 20, sun: null },
      { label, scoreShown: 300 },
    );
  }

  // The convoy rolling west, a bomb whistling down on the second lorry, the first already burning.
  // The scene holds the gunners' fire, so the picture is of the bombing and not of flak.
  match.world.tuning = { ...match.world.tuning, targetRange: 0 };
  fly(match, 400, () => [{}], onTick);
  const lorries = match.world.targets.filter((target) => target.drivesTo !== null);
  const lead = lorries[0];
  const memory = createBotMemory('hard', false);
  place(player, (lead?.x ?? 2400) - 140, (lead?.y ?? 50) + 58, RIGHT, 5);
  let bombed = 0;
  for (let tick = 0; tick < 600 && bombed < 2; tick++) {
    const asked = botControls(match.world, player, memory);
    if (asked.bomb) bombed += 1;
    stepMatch(match, [{ ...asked, home: false }]);
    onTick(match);
  }
  fly(match, 24, () => [{}], onTick);
  return base(
    { match, focus: player, cameraX: (lead?.x ?? 2400) + 30, sun: null },
    { label, scoreShown: 700 },
  );
}
