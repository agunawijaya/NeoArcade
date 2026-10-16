import { describe, expect, it } from 'vitest';
import { TICKS_PER_MOVE } from './constants';
import { CONVOY_SPEED } from './convoy';
import { createMatch, stepMatch } from './match';
import { CLASSIC_RULES, roundTuning } from './rules';
import { BEAM_REACH, isLit, isSpotted, searchlightBeams } from './sight';
import { airborne, cpuSeat, flatMap, HUMAN, run, testWorld } from './test-worlds';
import { DOWN, RIGHT, UP, cosine, sine } from './trig';
import type { Plane } from './world';

const MOVE = TICKS_PER_MOVE;

describe('the convoy', () => {
  it('crawls towards its destination and gets away unpaid if it arrives', () => {
    const map = flatMap({ targets: [{ kind: 'tank', side: 1, x: 800, drivesTo: 790 }] });
    const world = testWorld(map);
    const lorry = world.targets[0];
    run(world, 5 * MOVE);
    expect(lorry?.x).toBeCloseTo(800 - 5 * CONVOY_SPEED);
    const events = run(world, 30 * MOVE);
    expect(lorry?.standing).toBe(false);
    expect(lorry?.escaped).toBe(true);
    expect(events.some((event) => event.type === 'convoy-escaped')).toBe(true);
    expect(world.score).toEqual([0, 0]);
  });

  it('can be bombed on the move like any target', () => {
    const map = flatMap({ targets: [{ kind: 'tank', side: 1, x: 800, drivesTo: 300 }] });
    const world = testWorld(map);
    run(world, 10 * MOVE);
    const lorry = world.targets[0];
    if (!lorry) throw new Error('No lorry.');
    world.bombs.push({
      id: 999,
      owner: { side: 0, plane: null },
      x: lorry.x,
      y: lorry.y + 20,
      vx: 0,
      vy: -1,
      age: 100,
    });
    run(world, 30);
    expect(lorry.standing).toBe(false);
    expect(lorry.escaped).toBe(false);
    expect(world.score[0]).toBeGreaterThan(0);
  });
});

describe('the night raid', () => {
  it('sweeps a beam from every enemy airfield, the same on every run', () => {
    const world = testWorld(flatMap(), { searchlights: true });
    const first = searchlightBeams(world).map((beam) => beam.heading);
    run(world, 20 * MOVE);
    const later = searchlightBeams(world).map((beam) => beam.heading);
    expect(first).toHaveLength(1);
    expect(later[0]).not.toBe(first[0]);
    const again = testWorld(flatMap(), { searchlights: true });
    run(again, 20 * MOVE);
    expect(searchlightBeams(again).map((beam) => beam.heading)).toEqual(later);
  });

  it('lights up whatever is in a beam, and only that', () => {
    const world = testWorld(flatMap(), { searchlights: true });
    const [beam] = searchlightBeams(world);
    if (!beam) throw new Error('No beam.');
    const along = (distance: number) => ({
      x: beam.x + cosine(beam.heading) * distance,
      y: beam.y + sine(beam.heading) * distance,
    });
    const inside = along(120);
    expect(isLit(world, inside.x, inside.y)).toBe(true);
    const beyond = along(BEAM_REACH + 20);
    expect(isLit(world, beyond.x, beyond.y)).toBe(false);
    expect(isLit(world, inside.x + 80, inside.y)).toBe(false);
  });

  it('hides a plane from gunners and pilots unless it is lit or close', () => {
    const world = testWorld(flatMap(), { searchlights: true }, [HUMAN, cpuSeat()]);
    const [plane] = world.planes as [Plane, Plane];
    airborne(world, plane, 700, 150, RIGHT, 6);
    const lit = isLit(world, plane.x, plane.y);
    expect(isSpotted(world, plane, 1100, 60)).toBe(lit);
    expect(isSpotted(world, plane, 680, 140)).toBe(true);
    const daylight = testWorld(flatMap(), {}, [HUMAN, cpuSeat()]);
    airborne(daylight, daylight.planes[0] as Plane, 700, 150, RIGHT, 6);
    expect(isSpotted(daylight, daylight.planes[0] as Plane, 1100, 60)).toBe(true);
  });

  it('lets the guns reach a lit plane from further off, even in the first round', () => {
    const world = testWorld(flatMap({ targets: [{ kind: 'hangar', side: 1, x: 1300 }] }), {
      searchlights: true,
    });
    const plane = world.planes[0] as Plane;
    expect(roundTuning(0).targetRange).toBe(0);
    // Park the plane in the beam, 150 units from the target.
    const [beam] = searchlightBeams(world);
    if (!beam) throw new Error('No beam.');
    airborne(world, plane, beam.x + cosine(beam.heading) * 140, beam.y + sine(beam.heading) * 140);
    plane.speed = 0;
    plane.state = 'stalled';
    const events = run(world, MOVE);
    expect(events.some((event) => event.type === 'target-gun')).toBe(true);
  });
});

describe('fog', () => {
  it('hides a plane inside it from the guns and the computer pilots', () => {
    const map = flatMap({
      targets: [{ kind: 'depot', side: 1, x: 900 }],
      fog: [{ left: 800, right: 1000, top: 110 }],
    });
    const world = testWorld(map, { round: 3 }, [HUMAN, cpuSeat()]);
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 880, 90, RIGHT, 0);
    plane.state = 'stalled';
    expect(isSpotted(world, plane, 900, 50)).toBe(false);
    const events = run(world, 4 * MOVE);
    expect(events.some((event) => event.type === 'target-gun')).toBe(false);
    airborne(world, plane, 880, 130, RIGHT, 0);
    plane.state = 'stalled';
    expect(isSpotted(world, plane, 900, 50)).toBe(true);
  });
});

describe('anti-aircraft guns', () => {
  it('make depots fire every move from the first round; the other targets hold fire', () => {
    const map = flatMap({
      targets: [
        { kind: 'depot', side: 1, x: 900 },
        { kind: 'factory', side: 1, x: 1040 },
      ],
    });
    const world = testWorld(map, { antiAir: true });
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 960, 120, UP, 0);
    plane.state = 'stalled';
    const events = run(world, 2 * MOVE);
    const firing = events.filter((event) => event.type === 'target-gun');
    expect(firing.length).toBe(2);
    expect(
      firing.every((event) => event.type === 'target-gun' && event.target === world.targets[0]?.id),
    ).toBe(true);
  });
});

describe('crosswind', () => {
  it('carries planes and bombs downwind', () => {
    const still = testWorld();
    const windy = testWorld(flatMap(), { wind: -1 });
    for (const world of [still, windy])
      airborne(world, world.planes[0] as Plane, 600, 150, DOWN + 512, 6);
    run(still, 10 * MOVE);
    run(windy, 10 * MOVE);
    expect((windy.planes[0] as Plane).x).toBeLessThan((still.planes[0] as Plane).x - 5);
  });
});

describe('ghosts', () => {
  it('keep a two-player pilot out of planes flying, harmless and unharmed', () => {
    const world = testWorld(flatMap(), {}, [{ ...HUMAN, ghostWhenOut: true, maxCrashes: 1 }]);
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 600, 60, DOWN, 8);
    const events = run(world, 40 * MOVE);
    expect(events.some((event) => event.type === 'ghost')).toBe(true);
    expect(plane.ghost).toBe(true);
    expect(plane.state).not.toBe('out');
    airborne(world, plane, 600, 120, RIGHT, 6);
    run(world, MOVE, { fire: true });
    expect(world.shots).toHaveLength(0);
    // Into the ground: no wreck, just back on the runway.
    airborne(world, plane, 600, 50, DOWN, 8);
    const crash = run(world, 10 * MOVE);
    expect(crash.some((event) => event.type === 'crash')).toBe(false);
    expect(plane.state).toBe('parked');
  });
});

describe('match goals', () => {
  const twoTargets = flatMap({
    targets: [
      { kind: 'hangar', side: 1, x: 800 },
      { kind: 'tank', side: 0, x: 300 },
    ],
  });

  it('wins a dogfight when every enemy plane is out', () => {
    const match = createMatch({
      rules: CLASSIC_RULES,
      mapFor: () => flatMap(),
      seats: [HUMAN, { ...cpuSeat(), maxCrashes: 1 }],
      seed: 1,
      rounds: 1,
      versus: false,
      goal: 'planes',
    });
    stepMatch(match);
    expect(match.phase).toBe('playing');
    const enemy = match.world.planes[1] as Plane;
    enemy.state = 'out';
    stepMatch(match);
    expect(match.phase).toBe('sun');
  });

  it('gives a versus round to the other side when a pilot runs out of planes', () => {
    const match = createMatch({
      rules: { ...CLASSIC_RULES, lossPenalties: false },
      mapFor: () => twoTargets,
      seats: [HUMAN, { ...HUMAN, side: 1, base: 1 }],
      seed: 1,
      rounds: 3,
      versus: true,
      roundsToWin: 1,
    });
    match.world.score = [400, 0];
    (match.world.planes[0] as Plane).state = 'out';
    stepMatch(match);
    expect(match.lastWinner).toBe(1);
    for (let tick = 0; tick < 72 * MOVE; tick++) stepMatch(match);
    expect(match.phase).toBe('over');
  });

  it('loses a co-op round only when both pilots are out or ghosts', () => {
    const match = createMatch({
      rules: CLASSIC_RULES,
      mapFor: () => twoTargets,
      seats: [
        { ...HUMAN, ghostWhenOut: true },
        { ...HUMAN, base: 0, ghostWhenOut: true },
      ],
      seed: 1,
      rounds: 1,
      versus: false,
    });
    const [first, second] = match.world.planes as [Plane, Plane];
    first.ghost = true;
    stepMatch(match);
    expect(match.phase).toBe('playing');
    second.ghost = true;
    stepMatch(match);
    expect(match.phase).toBe('the-end');
  });
});
