import { describe, expect, it } from 'vitest';
import { TICKS_PER_MOVE } from './constants';
import { deckHeight } from './deck';
import { SHIP_CLASSES } from './fleet';
import { SEA_LEVEL, buildMap, type MapSpec, type ShipSite } from './map';
import { hitRaider } from './raiders';
import { SHIP_DAMAGE } from './ships';
import { searchlightBeams } from './sight';
import { MODERN_RULES } from './rules';
import { step } from './sim';
import { HUMAN, airborne, controls, cpuSeat, flatSea, run, testWorld } from './test-worlds';
import { RIGHT, TURN } from './trig';
import type { Plane, Ship, World } from './world';

const OUR_CARRIER: ShipSite = { kind: 'carrier', side: 0, x: 1200, direction: 1 };

function seaWorld(fleet: ShipSite[], extra: Parameters<typeof flatSea>[0] = {}): World {
  return testWorld(flatSea({ fleet, ...extra }), MODERN_RULES, [HUMAN]);
}

function eventsOf(world: World, ticks: number, held: Parameters<typeof run>[2] = {}) {
  return run(world, ticks, held);
}

describe('the sea', () => {
  it('swallows a bomb with a splash, and leaves no crater', () => {
    const world = seaWorld([OUR_CARRIER]);
    world.bombs.push({
      id: 999,
      owner: { side: 0, plane: null },
      x: 800,
      y: 60,
      vx: 0,
      vy: -1,
      age: 0,
    });
    const events = eventsOf(world, 60);
    expect(events.some((event) => event.type === 'splash')).toBe(true);
    expect(events.some((event) => event.type === 'crater')).toBe(false);
    expect(world.terrain.heightAt(800)).toBe(SEA_LEVEL);
  });

  it('fishes a ditched pilot out near a destroyer, and nowhere else; the plane is lost either way', () => {
    const ditch = (fleet: ShipSite[]) => {
      const world = seaWorld(fleet);
      const plane = world.planes[0] as Plane;
      airborne(world, plane, 1700, SEA_LEVEL + 8, TURN - 200, 4.5);
      const events = eventsOf(world, 60);
      return { plane, ditched: events.find((event) => event.type === 'ditched') };
    };
    const alone = ditch([OUR_CARRIER]);
    expect(alone.ditched).toMatchObject({ rescuedBy: null });
    expect(alone.plane.state).toBe('crashed');

    const guarded = ditch([OUR_CARRIER, { kind: 'destroyer', side: 0, x: 1620, direction: -1 }]);
    expect(guarded.ditched).toMatchObject({ rescuedBy: expect.any(Number) });
    expect(guarded.plane.state).toBe('crashed');
  });

  it('goes down with a carrier that sinks under its parked planes', () => {
    const world = seaWorld([OUR_CARRIER]);
    const ship = world.ships[0] as Ship;
    ship.hitPoints = 1;
    world.bombs.push({
      id: 999,
      owner: { side: 1, plane: null },
      x: ship.x,
      y: deckHeight(ship) + 3,
      vx: 0,
      vy: -0.5,
      age: 0,
    });
    const events = eventsOf(world, 20);
    expect(events.some((event) => event.type === 'ship-sinking')).toBe(true);
    expect((world.planes[0] as Plane).state).toBe('crashed');
  });
});

describe('ships', () => {
  it('turn round at the ends of their patrol', () => {
    const world = seaWorld([
      OUR_CARRIER,
      { kind: 'destroyer', side: 1, x: 900, direction: 1, patrol: { left: 700, right: 950 } },
    ]);
    const destroyer = world.ships[1] as Ship;
    const events = eventsOf(world, 200 * TICKS_PER_MOVE);
    expect(events.some((event) => event.type === 'ship-turn' && event.ship === destroyer.id)).toBe(
      true,
    );
    expect(destroyer.x).toBeGreaterThan(650);
    expect(destroyer.x).toBeLessThan(1000);
  });

  it('take bombs until they sink, and pay the side that sank them', () => {
    const world = seaWorld([OUR_CARRIER, { kind: 'destroyer', side: 1, x: 1700, direction: -1 }]);
    const destroyer = world.ships[1] as Ship;
    const events: World['events'] = [];
    const bombs = Math.ceil(SHIP_CLASSES.destroyer.hitPoints / SHIP_DAMAGE.bomb);
    for (let bomb = 0; bomb < bombs; bomb++) {
      world.bombs.push({
        id: 900 + bomb,
        owner: { side: 0, plane: null },
        x: destroyer.x,
        y: destroyer.y + 20,
        vx: destroyer.vx,
        vy: -0.6,
        age: 0,
      });
      events.push(...eventsOf(world, 40));
    }
    expect(events.filter((event) => event.type === 'ship-hit')).toHaveLength(bombs);
    expect(destroyer.state).toBe('sinking');
    expect(world.score[0]).toBe(SHIP_CLASSES.destroyer.score);
    eventsOf(world, 130 * TICKS_PER_MOVE);
    expect(destroyer.state).toBe('sunk');
  });

  it('remember where they were struck, settle lower and slow down as the water comes in', () => {
    const world = seaWorld([OUR_CARRIER, { kind: 'battleship', side: 1, x: 1700, direction: -1 }]);
    const battleship = world.ships[1] as Ship;
    const cruise = battleship.speed;
    const afloat = battleship.y;
    // Ahead of amidships: the battleship steams west, so its bow is to the west.
    world.bombs.push({
      id: 901,
      owner: { side: 0, plane: null },
      x: battleship.x - 30,
      y: battleship.y + 40,
      vx: battleship.vx,
      vy: -0.6,
      age: 0,
    });
    eventsOf(world, 40);
    expect(battleship.wounds).toHaveLength(1);
    expect(battleship.wounds[0]).toMatchObject({ cause: 'bomb' });
    expect(battleship.wounds[0]?.along).toBeGreaterThan(20);
    expect(battleship.wounds[0]?.height).toBeGreaterThan(0);
    eventsOf(world, 80 * TICKS_PER_MOVE);
    expect(battleship.flooded).toBeCloseTo(SHIP_DAMAGE.bomb / SHIP_CLASSES.battleship.hitPoints);
    expect(battleship.y).toBeLessThan(afloat - 0.5);
    expect(battleship.speed).toBeLessThan(cruise * 0.95);
  });

  it('sweep the sky with a searchlight from every enemy cruiser, battleship and monitor', () => {
    const world = seaWorld([
      OUR_CARRIER,
      { kind: 'cruiser', side: 1, x: 1700, direction: -1 },
      { kind: 'destroyer', side: 1, x: 1900, direction: -1 },
      { kind: 'cruiser', side: 0, x: 1450, direction: -1 },
    ]);
    const atSea = () => searchlightBeams(world).filter((beam) => world.terrain.isWater(beam.x));
    expect(atSea()).toHaveLength(1);
    const cruiser = world.ships[1] as Ship;
    const lamp = SHIP_CLASSES.cruiser.searchlight?.along ?? 0;
    expect(atSea()[0]?.x).toBeCloseTo(cruiser.x + lamp * cruiser.direction);
    const first = atSea()[0]?.heading;
    eventsOf(world, 30 * TICKS_PER_MOVE);
    expect(atSea()[0]?.heading).not.toBe(first);
  });

  it('let our own planes fly past our escorts, but not theirs', () => {
    const escort: ShipSite = { kind: 'cruiser', side: 0, x: 1700, direction: -1 };
    const ours = seaWorld([OUR_CARRIER, escort]);
    const plane = ours.planes[0] as Plane;
    const cruiser = ours.ships[1] as Ship;
    airborne(ours, plane, 1640, cruiser.y + 15, RIGHT, 5);
    const passing = eventsOf(ours, 120);
    expect(passing.some((event) => event.type === 'plane-down')).toBe(false);
    expect(plane.x).toBeGreaterThan(1740);

    const theirs = seaWorld([OUR_CARRIER, { ...escort, side: 1 }]);
    const rammer = theirs.planes[0] as Plane;
    airborne(theirs, rammer, 1640, (theirs.ships[1] as Ship).y + 15, RIGHT, 5);
    const ramming = eventsOf(theirs, 120);
    expect(ramming.some((event) => event.type === 'plane-down' && event.cause === 'ship')).toBe(
      true,
    );
  });

  it('fire their guns at an enemy plane in reach', () => {
    const world = seaWorld([OUR_CARRIER, { kind: 'cruiser', side: 1, x: 1700, direction: -1 }]);
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 1650, 120, RIGHT, 5);
    const events = eventsOf(world, 60);
    expect(events.some((event) => event.type === 'ship-gun')).toBe(true);
  });

  it('cannot lay their guns on a plane low over the water a way off', () => {
    const world = seaWorld([OUR_CARRIER, { kind: 'battleship', side: 1, x: 1700, direction: -1 }]);
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 1580, SEA_LEVEL + 14, RIGHT, 4);
    const events = eventsOf(world, 20, { pitch: 0 });
    expect(events.some((event) => event.type === 'ship-gun')).toBe(false);
  });

  it('never hit our own planes with their shells', () => {
    const world = seaWorld([OUR_CARRIER]);
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 1500, 120, RIGHT, 5);
    world.shots.push({
      id: 990,
      owner: { side: 0, plane: null },
      x: plane.x + 30,
      y: plane.y,
      vx: -2,
      vy: 0,
      life: 60,
      shell: true,
    });
    eventsOf(world, 30);
    expect(plane.wounded).toBe(false);
  });
});

describe('torpedoes', () => {
  function torpedoRun(target: ShipSite, drop: { height: number; speed: number }) {
    const world = testWorld(flatSea({ fleet: [OUR_CARRIER, target] }), MODERN_RULES, [
      { ...HUMAN, loadout: 'torpedo' },
    ]);
    const plane = world.planes[0] as Plane;
    airborne(world, plane, target.x - 260, SEA_LEVEL + drop.height, RIGHT, drop.speed);
    plane.torpedoes = 1;
    const events = eventsOf(world, 1, { bomb: true });
    events.push(...eventsOf(world, 700));
    return { world, events, ship: world.ships[1] as Ship };
  }

  it('run true when dropped low, level and slow, and hit the ship in their way', () => {
    const { events, ship } = torpedoRun(
      { kind: 'battleship', side: 1, x: 1700, direction: 1 },
      {
        height: 18,
        speed: 4.5,
      },
    );
    expect(events.some((event) => event.type === 'torpedo-running')).toBe(true);
    expect(events.some((event) => event.type === 'torpedo-hit')).toBe(true);
    expect(ship.hitPoints).toBeLessThan(ship.maxHitPoints);
  });

  it('sink anything up to a cruiser with one hit, and a battleship or carrier with two', () => {
    for (const kind of ['torpedo-boat', 'destroyer', 'supply', 'monitor', 'cruiser'] as const)
      expect(SHIP_CLASSES[kind].hitPoints).toBeLessThanOrEqual(SHIP_DAMAGE.torpedo);
    for (const kind of ['battleship', 'carrier'] as const) {
      expect(SHIP_CLASSES[kind].hitPoints).toBeGreaterThan(SHIP_DAMAGE.torpedo);
      expect(SHIP_CLASSES[kind].hitPoints).toBeLessThanOrEqual(SHIP_DAMAGE.torpedo * 2);
    }
    expect(SHIP_CLASSES.battleship.hitPoints).toBeLessThanOrEqual(SHIP_DAMAGE.bomb * 5);
    const { ship } = torpedoRun(
      { kind: 'cruiser', side: 1, x: 1700, direction: 1 },
      { height: 18, speed: 4.5 },
    );
    expect(ship.state).not.toBe('afloat');
    expect(ship.wounds.some((wound) => wound.cause === 'torpedo')).toBe(true);
  });

  it('break up when dropped too high', () => {
    const { events } = torpedoRun(
      { kind: 'battleship', side: 1, x: 1700, direction: 1 },
      {
        height: 60,
        speed: 4.5,
      },
    );
    expect(events.some((event) => event.type === 'torpedo-broke')).toBe(true);
    expect(events.some((event) => event.type === 'torpedo-hit')).toBe(false);
  });

  it('run under a torpedo boat, which draws too little water to be hit', () => {
    const { events } = torpedoRun(
      { kind: 'torpedo-boat', side: 1, x: 1700, direction: 1, speed: 0.2 },
      {
        height: 18,
        speed: 4.5,
      },
    );
    expect(events.some((event) => event.type === 'torpedo-running')).toBe(true);
    expect(events.some((event) => event.type === 'torpedo-hit')).toBe(false);
  });

  it('miss a destroyer that turns to comb their track', () => {
    const { events, ship } = torpedoRun(
      { kind: 'destroyer', side: 1, x: 1700, direction: -1 },
      {
        height: 18,
        speed: 4.5,
      },
    );
    expect(events.some((event) => event.type === 'ship-turn' && event.ship === ship.id)).toBe(true);
    expect(events.some((event) => event.type === 'torpedo-hit')).toBe(false);
  });

  it('are carried one at a time, and loaded by the ground crew when asked for', () => {
    const world = seaWorld([OUR_CARRIER]);
    const plane = world.planes[0] as Plane;
    expect(plane.loadout).toBe('bombs');
    expect(plane.bombs).toBe(5);
    eventsOf(world, 25 * TICKS_PER_MOVE, { loadout: 'torpedo' });
    expect(plane.loadout).toBe('torpedo');
    expect(plane.bombs).toBe(0);
    expect(plane.torpedoes).toBe(1);
  });
});

describe('raids', () => {
  const RAID = {
    kind: 'bomber' as const,
    side: 1 as const,
    at: 2,
    x: 2050,
    altitude: 120,
    count: 2,
    target: 0,
  };

  it('come in on their move, fly to their ship and bomb it', () => {
    const world = seaWorld([OUR_CARRIER], { raids: [RAID] });
    const carrier = world.ships[0] as Ship;
    const events = eventsOf(world, 1400);
    expect(events.find((event) => event.type === 'raid')).toBeDefined();
    expect(events.filter((event) => event.type === 'raider-bombs')).toHaveLength(2);
    expect(carrier.hitPoints).toBeLessThan(carrier.maxHitPoints);
  });

  it('can be shot down before they get there, and pay whoever does it', () => {
    const world = seaWorld([OUR_CARRIER], { raids: [RAID] });
    eventsOf(world, 20);
    for (const raider of [...world.raiders]) hitRaider(world, raider, 99, 0);
    const events = eventsOf(world, 1400);
    expect(events.some((event) => event.type === 'raider-bombs')).toBe(false);
    expect(world.score[0]).toBeGreaterThan(0);
    expect((world.ships[0] as Ship).hitPoints).toBe((world.ships[0] as Ship).maxHitPoints);
  });
});

describe('computer pilots at sea', () => {
  it('take off from their carrier, and land back on it to have a wound seen to', () => {
    const world = testWorld(
      // The player flies from the shore, so no gunners of ours are near the enemy's carrier.
      flatSea({
        fleet: [{ kind: 'carrier', side: 1, x: 1500, direction: -1 }],
        bases: [
          { side: 0, x: 260, facing: 1 },
          { side: 1, x: 1500, facing: -1, carrier: 0 },
        ],
      }),
      MODERN_RULES,
      [HUMAN, cpuSeat('normal', 1)],
    );
    const cpu = world.planes[1] as Plane;
    const human = world.planes[0] as Plane;
    // The player is far off and out of sight, so the computer pilot only patrols.
    human.state = 'out';
    const launch = eventsOf(world, 400);
    expect(launch.some((event) => event.type === 'takeoff' && event.plane === cpu.id)).toBe(true);
    eventsOf(world, 300);
    expect(cpu.state).toBe('flying');
    cpu.wounded = true;
    const home = eventsOf(world, 3000);
    expect(home.some((event) => event.type === 'trap' && event.plane === cpu.id)).toBe(true);
  });
});

describe('a map at sea', () => {
  const COAST: MapSpec = {
    name: 'Test coast',
    seed: 5,
    layout: 'sea',
    ground: [
      [0, 50],
      [3000, 50],
    ],
    sea: { spans: [{ left: 900, right: 2700, kind: 'sea', shores: ['beach', 'cliff'] }] },
    bases: [
      { side: 0, x: 1800, facing: 1, carrier: 0 },
      { side: 1, x: 500, facing: 1 },
    ],
    targets: [{ kind: 'depot', side: 1, x: 700 }],
    oxen: [],
    fleet: [
      { kind: 'carrier', side: 0, x: 1800, direction: -1, patrol: { left: 1300, right: 2300 } },
    ],
  };

  it('floods its water to the sea level, eases its beaches down and stands its cliffs up', () => {
    const map = buildMap(COAST);
    expect(map.heights[1500]).toBe(SEA_LEVEL);
    expect(map.heights[880]).toBeLessThan(map.heights[700] as number);
    expect(map.heights[2710]).toBeGreaterThan(SEA_LEVEL + 15);
  });

  it('refuses ships aground, targets in the water and decks that are not carriers', () => {
    expect(() =>
      buildMap({ ...COAST, fleet: [{ kind: 'destroyer', side: 0, x: 600, direction: 1 }] }),
    ).toThrow(/aground|not one of/);
    expect(() => buildMap({ ...COAST, targets: [{ kind: 'depot', side: 1, x: 1500 }] })).toThrow(
      /in the sea/,
    );
    expect(() =>
      buildMap({
        ...COAST,
        fleet: [{ kind: 'battleship', side: 0, x: 1800, direction: -1 }],
      }),
    ).toThrow(/not one of its side's carriers/);
  });

  it('builds a world with its fleet afloat and its planes on deck', () => {
    const world = testWorld(buildMap(COAST), MODERN_RULES, [HUMAN, cpuSeat('easy', 1)]);
    expect(world.ships).toHaveLength(1);
    expect((world.planes[0] as Plane).state).toBe('parked');
    expect(world.terrain.isWater(1500)).toBe(true);
    step(world, [controls()]);
    expect((world.ships[0] as Ship).x).toBeLessThan(1800);
  });
});
