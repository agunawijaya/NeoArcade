import { describe, expect, it } from 'vitest';
import { MAX_THROTTLE, TICKS_PER_MOVE } from './constants';
import { deckHeight, deckX } from './deck';
import { PLANE_HALF_LENGTH, WHEEL_DROP } from './geometry';
import type { WorldMap } from './map';
import { createMatch, stepMatch, type Match } from './match';
import type { Objective } from './objectives';
import { MODERN_RULES } from './rules';
import { HUMAN, airborne, controls, flatSea } from './test-worlds';
import { RIGHT, TURN } from './trig';
import type { Plane, Ship } from './world';

function mission(map: WorldMap, objectives: readonly Objective[]): Match {
  return createMatch({
    rules: MODERN_RULES,
    mapFor: () => map,
    seats: [HUMAN],
    seed: 7,
    rounds: 1,
    versus: false,
    objectives,
  });
}

function player(match: Match): Plane {
  return match.world.planes[0] as Plane;
}

/** Steps the match with the controls left alone, until `done` or the limit. */
function fly(match: Match, ticks: number, done: () => boolean = () => false) {
  for (let tick = 0; tick < ticks && !done(); tick++) stepMatch(match, [controls()]);
}

/** Sets the player's plane on the wires' approach to its carrier, ready to trap. */
function onFinal(match: Match) {
  const plane = player(match);
  const ship = match.world.ships[0] as Ship;
  airborne(
    match.world,
    plane,
    deckX(ship, 20 + PLANE_HALF_LENGTH),
    deckHeight(ship) + WHEEL_DROP + 0.15,
    TURN - 50,
    5,
  );
  plane.throttle = 0;
}

describe('mission objectives', () => {
  it('passes gates only in order and only between their heights', () => {
    const map = flatSea({
      gates: [
        { x: 1300, bottom: 80, top: 110 },
        { x: 1500, bottom: 120, top: 150 },
      ],
    });
    const match = mission(map, ['gates']);
    const plane = player(match);
    airborne(match.world, plane, 1250, 135, RIGHT, 5);
    fly(match, 120, () => plane.x > 1350);
    // Over the first gate's top: it does not count, so the second cannot either.
    expect(match.world.gatesPassed).toBe(0);
    airborne(match.world, plane, 1250, 95, RIGHT, 5);
    fly(match, 120, () => plane.x > 1350);
    expect(match.world.gatesPassed).toBe(1);
    airborne(match.world, plane, 1450, 135, RIGHT, 5);
    fly(match, 120, () => match.phase !== 'playing');
    expect(match.world.gatesPassed).toBe(2);
    expect(match.phase).toBe('sun');
  });

  it('only counts a landing aboard once everything else is done', () => {
    const match = mission(flatSea({ gates: [{ x: 1600, bottom: 80, top: 120 }] }), [
      'gates',
      'land-aboard',
    ]);
    onFinal(match);
    fly(match, 240, () => player(match).state === 'parked');
    expect(player(match).state).toBe('parked');
    expect(match.phase).toBe('playing');
    match.world.gatesPassed = 1;
    onFinal(match);
    fly(match, 240, () => match.phase !== 'playing');
    expect(match.phase).toBe('sun');
  });

  it('needs a landing, not just a plane parked on the deck, for a deck trial', () => {
    const match = mission(flatSea(), ['land-aboard']);
    fly(match, 30);
    expect(match.phase).toBe('playing');
    onFinal(match);
    fly(match, 240, () => match.phase !== 'playing');
    expect(match.phase).toBe('sun');
  });

  it('asks a deck trial for a touch-and-go before the landing that ends it', () => {
    const match = mission(flatSea(), ['touch-and-go', 'land-aboard']);
    onFinal(match);
    fly(match, 240, () => player(match).state === 'parked');
    expect(match.phase).toBe('playing');
    onFinal(match);
    player(match).throttle = MAX_THROTTLE;
    for (let tick = 0; tick < 60 && match.world.touchAndGoes === 0; tick++)
      stepMatch(match, [controls({ throttle: 1 })]);
    expect(match.world.touchAndGoes).toBe(1);
    onFinal(match);
    fly(match, 240, () => match.phase !== 'playing');
    expect(match.phase).toBe('sun');
  });

  it('wins a defence of the carrier once every torpedo boat is sunk, whatever else of theirs sails on', () => {
    const map = flatSea({
      fleet: [
        { kind: 'carrier', side: 0, x: 1200, direction: 1 },
        { kind: 'torpedo-boat', side: 1, x: 700, direction: 1 },
        { kind: 'cruiser', side: 1, x: 1900, direction: -1 },
      ],
    });
    const match = mission(map, ['boats']);
    fly(match, 30);
    expect(match.phase).toBe('playing');
    const boat = match.world.ships[1] as Ship;
    boat.state = 'sunk';
    fly(match, 1);
    expect(match.phase).toBe('sun');
  });

  it('wins an intercept once every raid has come and none of it is left in the sky', () => {
    const map = flatSea({
      raids: [{ kind: 'bomber', side: 1, at: 2, x: 600, altitude: 140, count: 2, target: 0 }],
    });
    const match = mission(map, ['raiders']);
    fly(match, TICKS_PER_MOVE);
    expect(match.phase).toBe('playing');
    fly(match, TICKS_PER_MOVE * 2);
    expect(match.world.raiders).toHaveLength(2);
    match.world.raiders = [];
    fly(match, 1);
    expect(match.phase).toBe('sun');
  });

  it('wins an escort with most of the convoy in, and loses it with most of it gone', () => {
    const supply = (x: number, bound: number) => ({
      kind: 'supply' as const,
      side: 0 as const,
      x,
      direction: 1 as const,
      bound,
      convoy: true,
    });
    const fleet = [
      { kind: 'carrier' as const, side: 0 as const, x: 1200, direction: 1 as const },
      supply(900, 1950),
      supply(800, 1900),
      supply(700, 1850),
    ];
    // Two in and one lost: that will do.
    const arriving = mission(flatSea({ fleet }), ['escort']);
    const [, first, second, third] = arriving.world.ships as Ship[];
    if (!first || !second || !third) throw new Error('the convoy is missing');
    first.x = 1945;
    second.x = 1895;
    third.state = 'sinking';
    fly(arriving, 300, () => arriving.phase !== 'playing');
    expect(arriving.phase).toBe('sun');

    // Two lost: the rest cannot make it a success.
    const sinking = mission(flatSea({ fleet }), ['escort']);
    for (const ship of (sinking.world.ships as Ship[]).slice(1, 3)) ship.state = 'sinking';
    fly(sinking, 1);
    expect(sinking.phase).toBe('the-end');
  });
});
