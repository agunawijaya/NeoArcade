import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../engine/constants';
import type { GameEvent } from '../engine/events';
import { airborne, cpuSeat, flatMap, HUMAN, testWorld } from '../engine/test-worlds';
import { RIGHT, TURN } from '../engine/trig';
import type { Plane } from '../engine/world';
import { goalMet, RoundTally } from './stats';

function tallyFor(events: GameEvent[]) {
  const world = testWorld(
    flatMap({
      targets: [
        { kind: 'depot', side: 1, x: 900 },
        { kind: 'hangar', side: 1, x: 1000 },
      ],
    }),
    {},
    [HUMAN, cpuSeat()],
  );
  const [player, enemy] = world.planes as [Plane, Plane];
  const tally = new RoundTally([player.id], new Set([enemy.id]));
  tally.absorb(world, events);
  return { tally, world, player, enemy };
}

describe('the round tally', () => {
  it('counts targets, depots, own goals and oxen for the side that did it', () => {
    const { tally } = tallyFor([
      { type: 'target-destroyed', target: 1, kind: 'depot', side: 1, by: 0, x: 900, y: 40 },
      { type: 'target-destroyed', target: 2, kind: 'hangar', side: 0, by: 0, x: 300, y: 40 },
      { type: 'ox-hit', ox: 3, x: 500, y: 40, by: 0 },
      { type: 'crater', x: 900, y: 40, cause: 'bomb', by: 0 },
      { type: 'crater', x: 950, y: 40, cause: 'crash', by: 0 },
    ]);
    expect(tally.sides[0]).toMatchObject({
      targets: 1,
      depots: 1,
      ownTargets: 1,
      oxen: 1,
      craters: 1,
    });
  });

  it('credits a plane brought down to whoever did it, and notices the ace', () => {
    const { tally, enemy } = tallyFor([
      { type: 'plane-down', plane: 0, side: 1, cause: 'shot', by: 0, x: 0, y: 0 },
    ]);
    expect(tally.sides[0].planesDowned).toBe(1);
    expect(tally.sides[0].acesDowned).toBe(0);
    const again = tallyFor([
      { type: 'plane-down', plane: enemy.id, side: 1, cause: 'shot', by: 0, x: 0, y: 0 },
    ]);
    expect(again.tally.sides[0].acesDowned).toBe(1);
  });

  it('remembers the lowest fuel a pilot landed with, and a stall into home', () => {
    const { tally, player } = tallyFor([
      { type: 'landed', plane: 0, fuel: 0.5 },
      { type: 'crash', plane: 0, side: 0, x: 0, y: 0, atHome: true, stalled: true },
    ]);
    expect(tally.pilot(player.id)?.lowestLandingFuel).toBeNull();
    const own = tallyFor([]);
    own.tally.absorb(own.world, [
      { type: 'landed', plane: own.player.id, fuel: 0.4 },
      { type: 'landed', plane: own.player.id, fuel: 0.015 },
      { type: 'crash', plane: own.player.id, side: 0, x: 0, y: 0, atHome: true, stalled: true },
    ]);
    expect(own.tally.pilot(own.player.id)).toMatchObject({
      landings: 2,
      lowestLandingFuel: 0.015,
      stalledIntoHome: true,
    });
  });

  it('spots a loop: a full turn the same way within six seconds', () => {
    const { tally, world, player } = tallyFor([]);
    airborne(world, player, 800, 120, RIGHT, 6);
    for (let tick = 0; tick < 3 * TICKS_PER_SECOND; tick++) {
      player.heading = (player.heading + TURN / (2 * TICKS_PER_SECOND)) % TURN;
      tally.absorb(world, []);
    }
    expect(tally.pilot(player.id)?.loops).toBe(1);
  });

  it('judges the campaign’s goals', () => {
    const { tally, player } = tallyFor([
      { type: 'target-destroyed', target: 2, kind: 'hangar', side: 1, by: 0, x: 1000, y: 40 },
    ]);
    const pilot = tally.pilot(player.id);
    // A hangar went up while the depot still stood.
    expect(goalMet({ kind: 'depots-first' }, tally, 0, pilot)).toBe(false);
    expect(goalMet({ kind: 'no-ox-harmed' }, tally, 0, pilot)).toBe(true);
    expect(goalMet({ kind: 'under-time', seconds: 60 }, tally, 0, pilot)).toBe(true);
    expect(goalMet({ kind: 'landed-at-home' }, tally, 0, pilot)).toBe(false);
  });

  it('tells a spot landing on the third wire from the rest, and counts touch-and-goes', () => {
    const pilotAfter = (event: (plane: number) => GameEvent) => {
      const { tally, player } = tallyFor([]);
      tally.absorb(testWorld(flatMap(), {}, [HUMAN]), [event(player.id)]);
      return { tally, pilot: tally.pilot(player.id) };
    };
    const spot = pilotAfter((plane) => ({ type: 'trap', plane, ship: 1, wire: 3 }));
    expect(goalMet({ kind: 'third-wire' }, spot.tally, 0, spot.pilot)).toBe(true);
    const long = pilotAfter((plane) => ({ type: 'trap', plane, ship: 1, wire: 4 }));
    expect(goalMet({ kind: 'third-wire' }, long.tally, 0, long.pilot)).toBe(false);
    const round = pilotAfter((plane) => ({ type: 'touch-and-go', plane, ship: 1 }));
    expect(round.pilot).toMatchObject({ touchAndGoes: 1, bolters: 0, traps: 0 });
  });
});
