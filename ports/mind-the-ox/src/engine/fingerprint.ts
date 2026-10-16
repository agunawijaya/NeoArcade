import { botControls, createBotMemory } from './bot';
import { buildMap, generateMap, type MapSpec } from './map';
import { createMatch, stepMatch, type MatchSetup } from './match';
import { CLASSIC_RULES, MODERN_RULES } from './rules';
import type { Seat } from './sim';
import type { World } from './world';

/**
 * A digest of seeded matches flown by the scripted pilot: every plane,
 * shot, bird and target, a few times a second, folded into one string.
 * The Daily Sortie is the same battle for everyone only if this comes out
 * the same in Node, Chromium, Firefox and WebKit; the determinism tests
 * check that it does (see e2e/engine.determinism.ts).
 */
const TICKS = 2400;
const SAMPLE_EVERY = 20;

/** A small hand-drawn field with a fog bank and a convoy, to exercise the twists. */
const TWISTS: MapSpec = {
  name: 'Fingerprint field',
  seed: 77,
  ground: [
    [0, 44],
    [1500, 64],
    [3000, 48],
  ],
  bases: [
    { side: 0, x: 1250, facing: 1 },
    { side: 1, x: 500, facing: 1 },
    { side: 1, x: 2100, facing: -1 },
  ],
  targets: [
    { kind: 'hangar', side: 0, x: 1000 },
    { kind: 'tank', side: 0, x: 1060 },
    { kind: 'depot', side: 0, x: 1120 },
    ...Array.from({ length: 12 }, (_, index) => ({
      kind: (['hangar', 'factory', 'depot', 'tank'] as const)[index % 4] ?? 'hangar',
      side: 1 as const,
      x: 240 + index * 36 + (index >= 6 ? 1900 : 0),
    })),
    ...[2600, 2640, 2680, 2720, 2760].map((x) => ({
      kind: 'tank' as const,
      side: 1 as const,
      x,
      drivesTo: x - 300,
    })),
  ],
  oxen: [1400, 1470],
  fog: [{ left: 1600, right: 1900, top: 110 }],
};

/**
 * A coast and open sea with both sides' fleets, a raid of bombers and an
 * airship, a torpedo boat on the prowl and a heavy swell: every moving
 * part Carrier Ops added, on its own so the land battles above stay as
 * they were.
 */
const SEA: MapSpec = {
  name: 'Fingerprint coast',
  seed: 78,
  layout: 'sea',
  ground: [
    [0, 52],
    [900, 60],
    [3000, 50],
  ],
  sea: { spans: [{ left: 780, right: 2780, kind: 'sea', shores: ['beach', 'cliff'] }] },
  bases: [
    { side: 0, x: 1700, facing: -1, carrier: 0 },
    { side: 1, x: 2250, facing: -1, carrier: 3 },
    { side: 1, x: 420, facing: 1 },
  ],
  targets: [
    { kind: 'depot', side: 1, x: 560 },
    { kind: 'hangar', side: 1, x: 680 },
  ],
  oxen: [],
  fleet: [
    { kind: 'carrier', side: 0, x: 1700, direction: -1, patrol: { left: 1300, right: 1900 } },
    { kind: 'destroyer', side: 0, x: 2050, direction: -1, patrol: { left: 1600, right: 2300 } },
    { kind: 'battleship', side: 1, x: 1200, direction: 1, patrol: { left: 950, right: 1400 } },
    { kind: 'carrier', side: 1, x: 2250, direction: -1, patrol: { left: 2100, right: 2300 } },
    { kind: 'torpedo-boat', side: 1, x: 1050, direction: 1 },
  ],
  raids: [
    { kind: 'bomber', side: 1, at: 60, x: 900, altitude: 130, count: 3, target: 0 },
    { kind: 'zeppelin', side: 1, at: 200, x: 2700, altitude: 150, count: 1, target: 0 },
  ],
};

function setups(): MatchSetup[] {
  const human: Seat = {
    side: 0,
    pilot: { kind: 'human', level: 'normal', territory: null },
    base: 0,
    maxCrashes: Number.POSITIVE_INFINITY,
  };
  const cpu = (base: number, level: Seat['pilot']['level']): Seat => ({
    side: 1,
    pilot: { kind: 'cpu', level, territory: null },
    base,
    maxCrashes: Number.POSITIVE_INFINITY,
  });
  const daily = generateMap({ seed: 20261016 });
  const twists = buildMap(TWISTS);
  const sea = buildMap(SEA);
  return [
    {
      rules: MODERN_RULES,
      mapFor: () => daily,
      seats: [human, cpu(1, 'normal'), cpu(2, 'easy'), cpu(3, 'hard')],
      seed: 20261016,
      rounds: 1,
      versus: false,
    },
    {
      rules: CLASSIC_RULES,
      mapFor: () => daily,
      seats: [human, cpu(1, 'brutal')],
      seed: 1984,
      rounds: 1,
      versus: false,
    },
    {
      rules: {
        ...MODERN_RULES,
        searchlights: true,
        antiAir: true,
        wind: -0.8,
        secretWeapons: true,
      },
      mapFor: () => twists,
      seats: [human, cpu(1, 'brutal'), cpu(2, 'hard')],
      seed: 3,
      rounds: 1,
      versus: false,
      firstRound: 4,
    },
    {
      rules: { ...MODERN_RULES, seaState: 2, landingAssist: false, wind: 0.4 },
      mapFor: () => sea,
      seats: [human, cpu(1, 'hard'), cpu(1, 'normal'), cpu(2, 'easy')],
      seed: 16,
      rounds: 1,
      versus: false,
    },
  ];
}

function hashText(hash: number, text: string): number {
  let next = hash;
  for (let index = 0; index < text.length; index++) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 0x01000193);
  }
  return next >>> 0;
}

function snapshot(world: World): string {
  const planes = world.planes.map(
    (plane) => `${plane.state}:${plane.x}:${plane.y}:${plane.heading}:${plane.speed}:${plane.fuel}`,
  );
  const things = [
    ...world.shots.map((shot) => `s${shot.x}:${shot.y}`),
    ...world.bombs.map((bomb) => `b${bomb.x}:${bomb.y}`),
    ...world.missiles.map((missile) => `m${missile.x}:${missile.y}`),
    ...world.birds.map((bird) => `w${bird.x}:${bird.y}`),
    ...world.targets.map((target) => `t${target.x}:${Number(target.standing)}:${target.damage}`),
    ...world.ships.map((ship) => `h${ship.x}:${ship.y}:${ship.hitPoints}:${ship.turn}`),
    ...world.torpedoes.map((torpedo) => `o${torpedo.x}:${torpedo.y}`),
    ...world.raiders.map((raider) => `r${raider.x}:${raider.y}:${raider.hitPoints}`),
  ];
  return `${world.tick}|${planes.join(',')}|${things.join(',')}|${world.score.join(',')}`;
}

/** One hash per scenario, then the scores, as "hash/score;…". */
export function engineFingerprint(): string {
  return setups()
    .map((setup) => {
      const match = createMatch(setup);
      const memory = createBotMemory();
      let hash = 0x811c9dc5;
      for (let tick = 0; tick < TICKS; tick++) {
        const player = match.world.planes[0];
        stepMatch(match, [player ? botControls(match.world, player, memory) : undefined]);
        if (tick % SAMPLE_EVERY === 0) hash = hashText(hash, snapshot(match.world));
      }
      return `${hash.toString(16)}/${match.world.score.join(',')}`;
    })
    .join(';');
}
