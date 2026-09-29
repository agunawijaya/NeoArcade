import { describe, expect, it } from 'vitest';
import { findThrow, flatSetup, throwOf } from '../../test/fixtures';
import { EXPLOSION_RADIUS, STEP_TIME, SUN } from './constants';
import { throwingHand } from './gorillas';
import { simulateShot, worldAngle, type ShotRecord } from './shot';

const eventTypes = (shot: ShotRecord) => shot.events.map((event) => event.type);

describe('simulateShot trajectory', () => {
  it('follows the original closed-form path, step by step', () => {
    const setup = flatSetup(undefined, { wind: 4, gravity: 9.8 });
    const shot = simulateShot(setup, throwOf(0, 60, 45));
    const hand = throwingHand(setup.gorillas[0], 0);
    const angle = (60 * Math.PI) / 180;
    const [first, , , , fifth] = shot.tracks[0]?.points ?? [];
    expect(first).toEqual(hand);

    const t = 4 * STEP_TIME;
    expect(fifth?.x).toBeCloseTo(hand.x + Math.cos(angle) * 45 * t + 0.5 * (4 / 5) * t * t, 9);
    expect(fifth?.y).toBeCloseTo(hand.y - Math.sin(angle) * 45 * t + 0.5 * 9.8 * t * t, 9);
  });

  it('is deterministic', () => {
    const setup = flatSetup(undefined, { wind: -7 });
    expect(simulateShot(setup, throwOf(1, 52.5, 71))).toEqual(
      simulateShot(setup, throwOf(1, 52.5, 71)),
    );
  });

  it('mirrors player 2’s angle', () => {
    expect(worldAngle(0, 30)).toBe(30);
    expect(worldAngle(1, 30)).toBe(150);
    const setup = flatSetup();
    const left = simulateShot(setup, throwOf(0, 40, 50)).tracks[0]?.points ?? [];
    const right = simulateShot(setup, throwOf(1, 40, 50)).tracks[0]?.points ?? [];
    for (let step = 1; step < 5; step++) {
      const leftStep = (left[step]?.x ?? 0) - (left[step - 1]?.x ?? 0);
      const rightStep = (right[step]?.x ?? 0) - (right[step - 1]?.x ?? 0);
      expect(rightStep).toBeCloseTo(-leftStep, 9);
    }
  });

  it('rounds velocity to a whole number and clamps inputs like the original', () => {
    const shot = simulateShot(flatSetup(), throwOf(0, 400, 50.6));
    expect(shot.input.velocity).toBe(51);
    expect(shot.input.angle).toBe(360);
  });

  it('keeps the angle to a hundredth of a degree, as a challenge link does', () => {
    expect(simulateShot(flatSetup(), throwOf(0, 45.12345, 50)).input.angle).toBe(45.12);
    expect(simulateShot(flatSetup(), throwOf(0, 45.3, 50)).input.angle).toBe(45.3);
  });

  it('lets the wind push bananas downwind', () => {
    const calm = simulateShot(flatSetup(), throwOf(0, 70, 40)).tracks[0]?.points[15];
    const windy = simulateShot(flatSetup(undefined, { wind: 10 }), throwOf(0, 70, 40)).tracks[0]
      ?.points[15];
    expect(windy?.x).toBeGreaterThan(calm?.x ?? Infinity);
    expect(windy?.y).toBeCloseTo(calm?.y ?? 0, 9);
  });
});

describe('leaving the field', () => {
  it('counts a banana past the side edge as a miss', () => {
    const shot = simulateShot(flatSetup(), throwOf(0, 30, 200));
    expect(shot.victim).toBeNull();
    expect(shot.events.at(-1)).toMatchObject({ type: 'offscreen', side: 'right' });
  });

  it('keeps flying above the top edge and comes back down', () => {
    const shot = simulateShot(flatSetup(), throwOf(0, 90, 100));
    const heights = shot.tracks[0]?.points.map((point) => point.y) ?? [];
    expect(Math.min(...heights)).toBeLessThan(-50);
    // Straight up on a calm day: it lands on the thrower's own head.
    expect(shot.victim).toBe(0);
  });

  it('lets a banana dropped into the street go as a miss', () => {
    const heights = Array.from({ length: 12 }, () => 60);
    const setup = flatSetup(heights);
    setup.terrain.craters.push({ x: 300, y: 290, radius: 80 });
    const input = findThrow(setup, 0, (shot) =>
      shot.events.some((event) => event.type === 'street'),
    );
    expect(input).not.toBeNull();
  });
});

describe('collisions', () => {
  it('hits a gorilla before the roof it stands on', () => {
    const setup = flatSetup();
    const input = findThrow(setup, 0, (shot) => shot.victim === 1);
    expect(input).not.toBeNull();
    const shot = simulateShot(setup, input!);
    expect(eventTypes(shot)).toContain('gorilla');
    expect(eventTypes(shot)).not.toContain('explosion');
  });

  it('carves a round hole into a building and lets the next banana through it', () => {
    const heights = Array.from({ length: 12 }, (_, index) => (index === 5 ? 250 : 60));
    const setup = flatSetup(heights);
    const input = throwOf(0, 20, 70);
    const first = simulateShot(setup, input);
    const blast = first.events.find((event) => event.type === 'explosion');
    expect(blast).toMatchObject({ building: 5, radius: EXPLOSION_RADIUS });
    expect(first.terrain.craters).toHaveLength(1);
    expect(setup.terrain.craters).toHaveLength(0);

    const second = simulateShot({ ...setup, terrain: first.terrain }, input);
    const deeper = second.events.find((event) => event.type === 'explosion');
    expect(deeper?.x).toBeGreaterThan(blast?.x ?? Infinity);
  });

  it('passes through the sun, which gasps once', () => {
    const setup = flatSetup();
    const input = findThrow(setup, 0, (shot) => shot.events.some((event) => event.type === 'sun'));
    expect(input).not.toBeNull();
    const shot = simulateShot(setup, input!);
    const sunEvent = shot.events.find((event) => event.type === 'sun');
    expect(shot.events.filter((event) => event.type === 'sun')).toHaveLength(1);
    expect(Math.hypot((sunEvent?.x ?? 0) - SUN.x, (sunEvent?.y ?? 0) - SUN.y)).toBeLessThan(
      SUN.radius + 4,
    );
    expect(shot.steps).toBeGreaterThan((sunEvent?.step ?? 0) + 3);
  });

  it('pops a balloon, collects its crate and keeps flying', () => {
    const setup = flatSetup();
    const path = simulateShot(setup, throwOf(0, 50, 60));
    const passing = path.tracks[0]?.points[12];
    const balloon = {
      x: passing?.x ?? 0,
      y: (passing?.y ?? 0) - 15,
      drift: 0,
      kind: 'tri' as const,
    };
    const shot = simulateShot({ ...setup, balloon }, throwOf(0, 50, 60));
    expect(shot.collected).toBe('tri');
    expect(shot.balloon).toBeNull();
    expect(eventTypes(shot)[0]).toBe('balloon');
    expect(shot.steps).toBe(path.steps);
  });

  it('makes a throw slower than 2 fall on the thrower', () => {
    for (const velocity of [0, 1]) {
      const shot = simulateShot(flatSetup(), throwOf(1, 45, velocity));
      expect(shot.victim).toBe(1);
      expect(shot.events.at(-1)).toMatchObject({ type: 'gorilla', player: 1, cause: 'fumble' });
    }
  });

  it('checks between steps so fast bananas cannot tunnel through a gorilla', () => {
    const setup = flatSetup();
    const hit = findThrow(setup, 0, (shot) => shot.victim === 1);
    expect(hit).not.toBeNull();
    const fast = [150, 200, 250].map((velocity) => findThrowAt(setup, velocity));
    expect(fast.some((shot) => shot?.victim === 1)).toBe(true);
  });
});

function findThrowAt(setup: ReturnType<typeof flatSetup>, velocity: number) {
  for (let angle = 1; angle < 60; angle += 0.25) {
    const shot = simulateShot(setup, throwOf(0, angle, velocity));
    if (shot.victim === 1) return shot;
  }
  return null;
}

describe('power-ups', () => {
  const wall = Array.from({ length: 12 }, (_, index) => (index === 5 ? 250 : 60));

  it('Calm Air throws as if there were no wind', () => {
    const calmDay = simulateShot(flatSetup(), throwOf(0, 45, 60));
    const gale = simulateShot(flatSetup(undefined, { wind: 15 }), throwOf(0, 45, 60, 'calm'));
    expect(gale.tracks[0]?.points).toEqual(calmDay.tracks[0]?.points);
    expect(gale.wind).toBe(0);
  });

  it('Golden Banana blasts twice as wide', () => {
    const shot = simulateShot(flatSetup(wall), throwOf(0, 20, 70, 'golden'));
    expect(shot.events.find((event) => event.type === 'explosion')).toMatchObject({
      radius: EXPLOSION_RADIUS * 2,
    });
  });

  it('Golden Banana knocks off a roof section, taking a gorilla on it along', () => {
    const setup = flatSetup();
    const input = findThrow(
      setup,
      0,
      (shot) => shot.events.some((event) => event.type === 'topple') && shot.victim === 1,
      'golden',
    );
    expect(input).not.toBeNull();
    const shot = simulateShot(setup, input!);
    expect(shot.terrain.cuts).toHaveLength(1);
    expect(shot.events.at(-1)).toMatchObject({ type: 'gorilla', player: 1 });
  });

  it('Bouncer comes back off a wall once, then explodes', () => {
    const shot = simulateShot(flatSetup(wall), throwOf(0, 20, 70, 'bouncer'));
    const types = eventTypes(shot);
    expect(types.filter((type) => type === 'bounce')).toHaveLength(1);
    const bounce = shot.events.find((event) => event.type === 'bounce');
    const points = shot.tracks[0]?.points ?? [];
    expect(points.at(-1)?.x).toBeLessThan(bounce?.x ?? 0);
    expect(types.indexOf('bounce')).toBeLessThan(types.length - 1);
  });

  it('Tri-Banana splits into three at the top of its arc', () => {
    const shot = simulateShot(flatSetup(), throwOf(0, 60, 60, 'tri'));
    const split = shot.events.find((event) => event.type === 'split');
    expect(split).toMatchObject({ children: [1, 2, 3] });
    expect(shot.tracks).toHaveLength(4);
    const parent = shot.tracks[0]?.points ?? [];
    const lowest = Math.min(...parent.map((point) => point.y));
    expect(parent.at(-1)?.y).toBeCloseTo(lowest, 0);
  });

  it('a shield absorbs one hit and is used up', () => {
    const setup = flatSetup();
    const input = findThrow(setup, 0, (shot) => shot.victim === 1)!;
    const shielded = simulateShot({ ...setup, shields: [false, true] }, input);
    expect(shielded.victim).toBeNull();
    expect(shielded.shields).toEqual([false, false]);
    expect(eventTypes(shielded)).toContain('shield');
  });
});

describe('Trick Shot targets', () => {
  const crateInTheWay = (setup = flatSetup()) => {
    const path = simulateShot(setup, throwOf(0, 45, 60)).tracks[0]?.points ?? [];
    return path[Math.floor(path.length / 2)] ?? { x: 0, y: 0 };
  };

  it('stops a banana at a crate, once', () => {
    const at = crateInTheWay();
    const setup = flatSetup(undefined, { targets: [{ kind: 'crate', ...at }] });
    const shot = simulateShot(setup, throwOf(0, 45, 60));
    expect(eventTypes(shot)).toEqual(['target']);
    expect(shot.events[0]).toMatchObject({ target: 0 });
  });

  it('lets a banana fly on through a hoop', () => {
    const at = crateInTheWay();
    const plain = simulateShot(flatSetup(), throwOf(0, 45, 60));
    const threaded = simulateShot(
      flatSetup(undefined, { targets: [{ kind: 'hoop', ...at }] }),
      throwOf(0, 45, 60),
    );
    expect(eventTypes(threaded)).toEqual(['target', ...eventTypes(plain)]);
    expect(threaded.tracks).toEqual(plain.tracks);
  });
});
