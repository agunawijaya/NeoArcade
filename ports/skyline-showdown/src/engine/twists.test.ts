import { createRng } from '@shared/rng';
import { describe, expect, it } from 'vitest';
import { flatSetup, throwOf } from '../../test/fixtures';
import { gorillaCentre, type PlayerIndex } from './gorillas';
import { createMatch, takeTurn, type MatchOptions, type MatchState } from './match';
import { simulateShot, type ShotRecord } from './shot';
import { WORLDS } from './worlds';
import {
  airAt,
  droneAt,
  gust,
  hazardsAfterThrow,
  NO_HAZARDS,
  type Drone,
  type Hazards,
  type TwistKind,
} from './twists';

const pathOf = (shot: ShotRecord) => shot.tracks[0]?.points ?? [];
const lastEvent = (shot: ShotRecord) => shot.events.at(-1)?.type;

function stage(twists: TwistKind[], seed: number, extra: Partial<MatchOptions> = {}): MatchState {
  return createMatch({
    seed,
    world: 'earth',
    points: 3,
    format: 'firstTo',
    powerUps: [],
    twists,
    ...extra,
  });
}

/** A throw by whoever's turn it is that sails over everything and off the far side. */
function throwAway(state: MatchState) {
  return takeTurn(state, { angle: 20, velocity: 200 });
}

function largestStep(points: readonly { x: number; y: number }[]): number {
  let largest = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    if (a && b) largest = Math.max(largest, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return largest;
}

describe('the drone', () => {
  const drone: Drone = { from: 200, to: 400, y: 120, width: 26, height: 11, phase: 0, speed: 0.01 };

  it('glides back and forth along its rail', () => {
    const centre = (step: number) => {
      const rect = droneAt(drone, step);
      return rect.x + rect.width / 2;
    };
    expect(centre(0)).toBeCloseTo(200);
    expect(centre(50)).toBeCloseTo(300);
    expect(centre(100)).toBeCloseTo(400);
    expect(centre(150)).toBeCloseTo(300);
    expect(centre(200)).toBeCloseTo(200);
    expect(droneAt(drone, 70).y).toBeCloseTo(120 - 5.5);
  });

  it('stops a banana without touching the city', () => {
    const open = simulateShot(flatSetup(), throwOf(0, 55, 60));
    const onTheWay = pathOf(open)[30];
    if (!onTheWay) throw new Error('The throw is too short for this test.');
    const inTheWay: Hazards = {
      ...NO_HAZARDS,
      drone: { ...drone, from: onTheWay.x, to: onTheWay.x, y: onTheWay.y },
    };
    const blocked = simulateShot(flatSetup(undefined, { hazards: inTheWay }), throwOf(0, 55, 60));
    expect(lastEvent(blocked)).toBe('drone');
    expect(blocked.victim).toBeNull();
    expect(blocked.terrain.craters).toEqual([]);
    expect(blocked.steps).toBeLessThan(open.steps);
  });

  it('moves on by the length of each throw', () => {
    const gorillas = stage([], 1).round.gorillas;
    const after = hazardsAfterThrow({ ...NO_HAZARDS, drone }, 80, gorillas, createRng(1));
    expect(after.drone?.phase).toBeCloseTo(0.8);
  });
});

describe('the air', () => {
  const band: Hazards = { ...NO_HAZARDS, jetStream: { top: 30, bottom: 70, wind: 15 } };
  const devil: Hazards = {
    ...NO_HAZARDS,
    dustDevil: { x: 320, width: 40, top: 60, push: 3 },
  };

  it('blows with the band’s own wind inside the jet stream', () => {
    expect(airAt(band, -5, 100, 50)).toBeCloseTo(3);
    expect(airAt(band, -5, 100, 150)).toBeCloseTo(-1);
  });

  it('adds the dust devil’s push inside its column only', () => {
    expect(airAt(devil, 5, 320, 200)).toBeCloseTo(4);
    expect(airAt(devil, 5, 320, 40)).toBeCloseTo(1);
    expect(airAt(devil, 5, 400, 200)).toBeCloseTo(1);
  });

  it('bends a lob that climbs through the jet stream, keeping the path unbroken', () => {
    const plain = simulateShot(flatSetup(), throwOf(0, 70, 70));
    const through = simulateShot(flatSetup(undefined, { hazards: band }), throwOf(0, 70, 70));
    expect(Math.min(...pathOf(plain).map((point) => point.y))).toBeLessThan(60);
    const at = 60;
    expect(pathOf(through)[at]?.x ?? 0).toBeGreaterThan((pathOf(plain)[at]?.x ?? 0) + 5);
    expect(largestStep(pathOf(through))).toBeLessThan(largestStep(pathOf(plain)) * 1.5);
  });

  it('shoves a banana sideways as it crosses a dust devil', () => {
    const plain = simulateShot(flatSetup(), throwOf(0, 40, 62));
    const pushed = simulateShot(flatSetup(undefined, { hazards: devil }), throwOf(0, 40, 62));
    const endX = (shot: ShotRecord) => pathOf(shot).at(-1)?.x ?? 0;
    expect(endX(pushed)).toBeGreaterThan(endX(plain) + 3);
  });

  it('is stilled completely by Calm Air', () => {
    const calm = { ...throwOf(0, 70, 70), powerUp: 'calm' as const };
    const stormy = simulateShot(flatSetup(undefined, { wind: 9, hazards: band }), calm);
    const still = simulateShot(flatSetup(), calm);
    expect(pathOf(stormy)).toEqual(pathOf(still));
  });
});

describe('springy ground', () => {
  it('bounces every banana once off the first building it hits', () => {
    const setup = flatSetup(Array.from({ length: 12 }, () => 120));
    const plain = simulateShot(setup, throwOf(0, 30, 40));
    expect(lastEvent(plain)).toBe('explosion');
    const springy = { ...setup, hazards: { ...NO_HAZARDS, bouncy: true } };
    const bounced = simulateShot(springy, throwOf(0, 30, 40));
    const types = bounced.events.map((event) => event.type);
    expect(types.filter((type) => type === 'bounce')).toHaveLength(1);
    expect(types.indexOf('bounce')).toBeLessThan(types.length - 1);
  });

  it('adds to a Bouncer rather than replacing it', () => {
    const setup = flatSetup(Array.from({ length: 12 }, () => 120));
    const springy = { ...setup, hazards: { ...NO_HAZARDS, bouncy: true } };
    const shot = simulateShot(springy, { ...throwOf(0, 30, 40), powerUp: 'bouncer' });
    expect(shot.events.filter((event) => event.type === 'bounce').length).toBeGreaterThanOrEqual(1);
    expect(shot.events.filter((event) => event.type === 'bounce').length).toBeLessThanOrEqual(2);
  });
});

describe('twists in a match', () => {
  it('leave a Quick Match without any hazards', () => {
    const { round } = stage([], 4);
    expect(round.hazards).toEqual(NO_HAZARDS);
    expect(round.lightningTarget).toBeNull();
  });

  it('shift the wind by a few notches after every throw with gusts', () => {
    const state = stage(['gusts'], 11);
    const winds = [state.round.wind];
    for (let turn = 0; turn < 12; turn++) {
      const before = state.round.wind;
      const result = throwAway(state);
      expect(result.between.wind).toBe(state.round.wind);
      const shift = Math.abs(state.round.wind - before);
      expect(shift).toBeGreaterThanOrEqual(2);
      expect(shift).toBeLessThanOrEqual(5);
      expect(Math.abs(state.round.wind)).toBeLessThanOrEqual(15);
      winds.push(state.round.wind);
    }
    expect(new Set(winds).size).toBeGreaterThan(3);
  });

  it('scale gusts with the world: stronger on Jupiter, none on the Moon', () => {
    const rng = createRng(3);
    for (let turn = 0; turn < 20; turn++) {
      expect(gust(WORLDS.moon, 0, rng)).toBe(0);
      const jovian = Math.abs(gust(WORLDS.jupiter, 0, rng));
      expect(jovian).toBeGreaterThanOrEqual(3);
      expect(jovian).toBeLessThanOrEqual(8);
    }
  });

  it('keep the wind for the whole round without gusts', () => {
    const state = stage([], 11);
    const wind = state.round.wind;
    throwAway(state);
    throwAway(state);
    expect(state.round.wind).toBe(wind);
  });

  it('build a supertall tower in the middle of the city', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { buildings } = stage(['supertall'], seed).round.terrain;
      const tallest = buildings.reduce((best, building) =>
        building.top < best.top ? building : best,
      );
      expect(tallest.top).toBeLessThanOrEqual(56);
      expect(Math.abs(tallest.x + tallest.width / 2 - 320)).toBeLessThan(45);
    }
  });

  it('put the gorillas at very different heights on a hillside', () => {
    let steep = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const [left, right] = stage(['hillside'], seed).round.gorillas;
      if (Math.abs(left.y - right.y) > 110) steep++;
    }
    expect(steep).toBeGreaterThan(54);
  });

  it('mark a rooftop for lightning one throw ahead, then strike it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = stage(['lightning'], seed);
      const occupied = state.round.gorillas.map((gorilla) => gorilla.building);
      const target = state.round.lightningTarget;
      expect(target).not.toBeNull();
      for (const building of occupied)
        expect(Math.abs(building - (target ?? 0))).toBeGreaterThan(1);

      const roof = state.round.terrain.buildings[target ?? 0];
      const result = throwAway(state);
      if (result.scorer !== null) continue;
      expect(result.between.strike?.building).toBe(target);
      expect(result.between.strike?.crater.y).toBeCloseTo((roof?.top ?? 0) + 4);
      expect(state.round.terrain.craters).toContainEqual(result.between.strike?.crater);
    }
  });

  it('never strike after the throw that ends a round', () => {
    const state = stage(['lightning'], 3);
    const victim: PlayerIndex = 1;
    // Find a throw that hits the opponent by brute force, as a player would by practice.
    for (let angle = 20; angle <= 80; angle++) {
      for (let velocity = 20; velocity <= 140; velocity++) {
        const shot = simulateShot(
          {
            terrain: state.round.terrain,
            gorillas: state.round.gorillas,
            wind: state.round.wind,
            gravity: state.round.world.gravity,
            balloon: null,
            shields: [false, false],
            hazards: state.round.hazards,
          },
          throwOf(0, angle, velocity),
        );
        if (shot.victim === victim) {
          const result = takeTurn(state, { angle, velocity });
          expect(result.scorer).toBe(0);
          expect(result.between.strike).toBeNull();
          return;
        }
      }
    }
    throw new Error('No hit found in this city.');
  });

  it('let the drone and the dust devil travel between throws', () => {
    const state = stage(['drone', 'dustDevil'], 7);
    const before = state.round.hazards;
    const result = throwAway(state);
    expect(result.hazards).toBe(before);
    expect(state.round.hazards.drone?.phase).not.toBe(before.drone?.phase);
    expect(state.round.hazards.dustDevil?.x).not.toBe(before.dustDevil?.x);
  });

  it('are as deterministic as everything else', () => {
    const twists: TwistKind[] = ['gusts', 'drone', 'jetStream', 'dustDevil', 'lightning'];
    const play = () => {
      const state = stage(twists, 42);
      const results = [0, 1, 2, 3].map(() => throwAway(state));
      return { state: JSON.stringify(state.round.terrain), results: JSON.stringify(results) };
    };
    expect(play()).toEqual(play());
  });

  it('keep the drone and the dust devil in the open air between the gorillas', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = stage(['drone', 'dustDevil'], seed);
      const [left, right] = state.round.gorillas;
      for (let turn = 0; turn < 3; turn++) {
        const { drone, dustDevil } = state.round.hazards;
        expect(drone?.from ?? 0).toBeGreaterThan(left.x + 30 + drone!.width / 2);
        expect(drone?.to ?? 0).toBeLessThan(right.x - drone!.width / 2);
        expect(Math.abs((dustDevil?.x ?? 0) - gorillaCentre(left).x)).toBeGreaterThan(40);
        expect(Math.abs((dustDevil?.x ?? 0) - gorillaCentre(right).x)).toBeGreaterThan(40);
        throwAway(state);
      }
    }
  });

  it('fly the drone clear of every roof under its rail', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { hazards, terrain } = stage(['drone'], seed).round;
      const drone = hazards.drone as Drone;
      const under = terrain.buildings.filter(
        (building) =>
          building.x < drone.to + drone.width / 2 &&
          building.x + building.width > drone.from - drone.width / 2,
      );
      const lowestEdge = drone.y + drone.height / 2;
      // Only a tower too tall to clear under the ceiling may come close.
      for (const building of under) {
        if (building.top > 48 + drone.height + 16) expect(lowestEdge).toBeLessThan(building.top);
      }
    }
  });
});
