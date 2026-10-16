import { describe, expect, it } from 'vitest';
import { MAX_THROTTLE, TICKS_PER_MOVE } from './constants';
import { deckHeight, deckOpen, deckX, offsetOnDeck, wireWindow } from './deck';
import { PLANE_HALF_LENGTH, WHEEL_DROP } from './geometry';
import { MODERN_RULES, type Rules } from './rules';
import { step } from './sim';
import { HUMAN, airborne, controls, flatSea, run, testWorld } from './test-worlds';
import { TURN } from './trig';
import type { Controls, Plane, Ship, World } from './world';

function carrierWorld(rules: Partial<Rules> = {}): { world: World; plane: Plane; ship: Ship } {
  const world = testWorld(flatSea(), { ...MODERN_RULES, ...rules }, [HUMAN]);
  return { world, plane: world.planes[0] as Plane, ship: world.ships[0] as Ship };
}

/** Runs until the plane is off the deck or done, holding the controls; returns the events. */
function runUntil(
  world: World,
  plane: Plane,
  done: (plane: Plane) => boolean,
  held: Partial<Controls>,
  limit = 900,
) {
  const events: World['events'] = [];
  for (let tick = 0; tick < limit && !done(plane); tick++) {
    step(world, [controls(held)]);
    events.push(...world.events);
  }
  return events;
}

/**
 * A plane a breath above the deck, heading for the bow, its hook over
 * `hook` units from the stern, at `speed` and descending at `dive` (a
 * heading below level, in 4096ths of a turn).
 */
function onFinal(world: World, plane: Plane, ship: Ship, hook: number, speed: number, dive = 50) {
  const x = deckX(ship, hook + PLANE_HALF_LENGTH);
  airborne(world, plane, x, deckHeight(ship) + WHEEL_DROP + 0.15, TURN - dive, speed);
  plane.throttle = 0;
}

describe('a carrier deck', () => {
  it('parks its planes on the deck and carries them along as it steams', () => {
    const { world, plane, ship } = carrierWorld();
    const offset = offsetOnDeck(ship, plane.x);
    expect(plane.state).toBe('parked');
    expect(plane.y).toBeCloseTo(deckHeight(ship) + WHEEL_DROP);
    run(world, 120);
    expect(ship.x).toBeGreaterThan(1200);
    expect(offsetOnDeck(ship, plane.x)).toBeCloseTo(offset);
    expect(plane.state).toBe('parked');
  });

  it('launches a plane at full throttle off the bow with flying speed to spare', () => {
    const { world, plane } = carrierWorld();
    const events = runUntil(world, plane, (it) => it.state === 'flying', { throttle: 1 });
    expect(events.some((event) => event.type === 'takeoff')).toBe(true);
    expect(plane.speed).toBeGreaterThan(world.tuning.minSpeed + 1);
    run(world, 120, { throttle: 1, pitch: 0.4 });
    expect(plane.state).toBe('flying');
    expect(plane.y).toBeGreaterThan(deckHeight(world.ships[0] as Ship));
  });

  it('lets a plane barely throttled up run off the bow too slow, into the sea', () => {
    const { world, plane } = carrierWorld();
    // About a fifth of the throttle, then hands off.
    run(world, 7, { throttle: 1 });
    const events = runUntil(world, plane, (it) => it.state === 'crashed', {}, 900);
    expect(events.some((event) => event.type === 'ditched')).toBe(true);
  });

  it('drops a plane pushed nose down off the bow into the sea', () => {
    const { world, plane } = carrierWorld();
    const events = runUntil(world, plane, (it) => it.state === 'crashed', {
      throttle: 1,
      pitch: -1,
    });
    expect(events.some((event) => event.type === 'ditched')).toBe(true);
  });

  it('catches a plane that comes down gently in the wire window', () => {
    const { world, plane, ship } = carrierWorld({ landingAssist: false });
    const wires = wireWindow(world);
    onFinal(world, plane, ship, (wires.first + wires.last) / 2, 4.2);
    const events = runUntil(world, plane, (it) => it.state === 'parked', {});
    const trap = events.find((event) => event.type === 'trap');
    expect(trap).toBeDefined();
    expect(plane.state).toBe('parked');
    // Wheeled forward to its spot, clear of the wires.
    expect(offsetOnDeck(ship, plane.x)).toBeGreaterThan(wires.last);
  });

  it('sends a plane that lands long round again: a bolter, off the bow under power', () => {
    const { world, plane, ship } = carrierWorld({ landingAssist: false });
    onFinal(world, plane, ship, wireWindow(world).last + 12, 4.2);
    const events = runUntil(world, plane, (it) => it.state !== 'flying', {}, 40);
    expect(events.some((event) => event.type === 'bolter')).toBe(true);
    expect(events.some((event) => event.type === 'trap')).toBe(false);
    runUntil(world, plane, (it) => it.state === 'flying', { throttle: 1 }, 400);
    run(world, 60, { throttle: 1, pitch: 0.3 });
    expect(plane.state).toBe('flying');
  });

  it('lets a plane touch down with the throttle wide open and go round: a touch-and-go, no wire', () => {
    const { world, plane, ship } = carrierWorld({ landingAssist: false });
    const wires = wireWindow(world);
    onFinal(world, plane, ship, wires.first, 6.5);
    plane.throttle = MAX_THROTTLE;
    const events = runUntil(world, plane, (it) => it.state !== 'flying', { throttle: 1 }, 40);
    expect(events.some((event) => event.type === 'touch-and-go')).toBe(true);
    expect(events.some((event) => event.type === 'trap' || event.type === 'bolter')).toBe(false);
    expect(world.touchAndGoes).toBe(1);
    runUntil(world, plane, (it) => it.state === 'flying', { throttle: 1 }, 400);
    run(world, 60, { throttle: 1, pitch: 0.3 });
    expect(plane.state).toBe('flying');
  });

  it('takes a plane that comes in short into the round-down', () => {
    const { world, plane, ship } = carrierWorld();
    onFinal(world, plane, ship, -2, 4.2);
    const events = runUntil(world, plane, (it) => it.state === 'crashed', {}, 30);
    expect(events.some((event) => event.type === 'ditched')).toBe(true);
  });

  it('damages a plane that comes down too hard, and wrecks one that dives at the deck', () => {
    const hard = carrierWorld({ landingAssist: false });
    onFinal(hard.world, hard.plane, hard.ship, 18, 6.5, 200);
    const bumped = runUntil(hard.world, hard.plane, (it) => it.state !== 'flying', {}, 30);
    expect(bumped.some((event) => event.type === 'hard-landing')).toBe(true);
    expect(hard.plane.wounded).toBe(true);

    const dive = carrierWorld();
    onFinal(dive.world, dive.plane, dive.ship, 18, 5, 320);
    const wrecked = runUntil(dive.world, dive.plane, (it) => it.state === 'crashed', {}, 30);
    expect(wrecked.some((event) => event.type === 'ditched')).toBe(true);
  });

  it('opens a wider window for the wires with the landing assist on', () => {
    const plain = carrierWorld({ landingAssist: false });
    const assisted = carrierWorld({ landingAssist: true });
    const hook = wireWindow(plain.world).last + 4;
    expect(wireWindow(assisted.world).last).toBeGreaterThan(hook);
    for (const { world, plane, ship } of [plain, assisted]) onFinal(world, plane, ship, hook, 4.2);
    const missed = runUntil(plain.world, plain.plane, (it) => it.state !== 'flying', {}, 30);
    const caught = runUntil(assisted.world, assisted.plane, (it) => it.state !== 'flying', {}, 30);
    expect(missed.some((event) => event.type === 'bolter')).toBe(true);
    expect(caught.some((event) => event.type === 'trap')).toBe(true);
  });

  it('rises and falls on the swell without the assist, and holds steady with it', () => {
    const heaving = (rules: Partial<Rules>) => {
      const { world, ship } = carrierWorld(rules);
      const heights: number[] = [];
      for (let tick = 0; tick < 400; tick++) {
        step(world, []);
        heights.push(deckHeight(ship));
      }
      return Math.max(...heights) - Math.min(...heights);
    };
    expect(heaving({ seaState: 2, landingAssist: false })).toBeGreaterThan(4);
    expect(heaving({ seaState: 2, landingAssist: true })).toBe(0);
    expect(heaving({ seaState: 0, landingAssist: false })).toBe(0);
  });

  it('closes the deck while the ship comes round, and keeps a parked plane on it', () => {
    const world = testWorld(
      flatSea({
        fleet: [
          { kind: 'carrier', side: 0, x: 1200, direction: 1, patrol: { left: 900, right: 1210 } },
        ],
      }),
      MODERN_RULES,
      [HUMAN],
    );
    const plane = world.planes[0] as Plane;
    const ship = world.ships[0] as Ship;
    let closed = false;
    for (let tick = 0; tick < 80 * TICKS_PER_MOVE; tick++) {
      step(world, []);
      if (!deckOpen(ship)) closed = true;
    }
    expect(closed).toBe(true);
    expect(ship.direction).toBe(-1);
    expect(deckOpen(ship)).toBe(true);
    expect(plane.state).toBe('parked');
    expect(offsetOnDeck(ship, plane.x)).toBeGreaterThan(0);
  });

  it('patches a fouled deck until its planes can take off again, and no further', () => {
    const { world, plane, ship } = carrierWorld();
    ship.hitPoints = ship.maxHitPoints * 0.2;
    expect(deckOpen(ship)).toBe(false);
    run(world, 30, { throttle: 1 });
    expect(plane.state).toBe('parked');
    runUntil(world, plane, () => deckOpen(ship), { throttle: 1 }, 60 * 120);
    expect(deckOpen(ship)).toBe(true);
    expect(ship.hitPoints).toBeLessThan(ship.maxHitPoints * 0.45);
    runUntil(world, plane, (it) => it.state === 'flying', { throttle: 1 });
    expect(plane.state).toBe('flying');
  });

  it('flies its circuit short of a cliff astern rather than into it', () => {
    // The carrier steams east with the shore close astern: a downwind leg of the full length would end in the hills.
    const sea = flatSea({
      sea: { left: 700, right: 2200 },
      fleet: [
        { kind: 'carrier', side: 0, x: 1100, direction: 1, patrol: { left: 1050, right: 1250 } },
      ],
      bases: [
        { side: 0, x: 1100, facing: 1, carrier: 0 },
        { side: 1, x: 260, facing: 1 },
      ],
    });
    const cliffs = {
      ...sea,
      heights: sea.heights.map((height, x) => (x < 690 ? Math.max(height, 110) : height)),
    };
    const world = testWorld(cliffs, MODERN_RULES, [HUMAN]);
    const plane = world.planes[0] as Plane;
    airborne(world, plane, 1500, 100, TURN / 2, world.tuning.minSpeed + 1);
    plane.homing = true;
    const events = runUntil(world, plane, (it) => it.state === 'parked', {}, 2400);
    expect(events.some((event) => event.type === 'crash' || event.type === 'ditched')).toBe(false);
    expect(events.some((event) => event.type === 'trap')).toBe(true);
  });

  it('flies a plane home to the wires on autopilot, from anywhere, in a swell and into the wind', () => {
    const starts = [
      { x: 900, y: 90, heading: 0, rules: {} },
      { x: 1500, y: 120, heading: 0, rules: {} },
      { x: 900, y: 120, heading: TURN / 2, rules: {} },
      { x: 900, y: 90, heading: 0, rules: { seaState: 2 as const, landingAssist: false } },
      { x: 900, y: 90, heading: 0, rules: { wind: -0.8 } },
      // A late round's faster planes: the window opens as much wider.
      { x: 900, y: 90, heading: 0, rules: { round: 3, landingAssist: false } },
    ];
    for (const start of starts) {
      const { world, plane } = carrierWorld(start.rules);
      airborne(world, plane, start.x, start.y, start.heading, world.tuning.minSpeed + 1);
      plane.homing = true;
      const events = runUntil(world, plane, (it) => it.state === 'parked', {}, 2400);
      expect(events.some((event) => event.type === 'trap')).toBe(true);
      // The autopilot never comes in wide open, so it never turns a landing into a touch-and-go.
      expect(events.some((event) => event.type === 'touch-and-go')).toBe(false);
    }
  });
});
