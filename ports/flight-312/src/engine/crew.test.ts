import { beforeAll, describe, expect, it } from 'vitest';
import { loadTerrainSource } from '../data/unpack';
import { applyCommand, quantiseLever } from './crew';
import { createFlight, type FlightSetup } from './flight';
import { createTerrain, type Terrain } from './terrain';

/**
 * The crew's commands: one place for everything a hand does in the
 * cockpit, so the keyboard, the mouse, the pad and a replay all do it the
 * same way.
 */
let terrain: Terrain;

beforeAll(async () => {
  terrain = createTerrain(await loadTerrainSource());
});

const setup = (over: Partial<FlightSetup> = {}): FlightSetup => ({
  mode: 'approach',
  level: 'pilot',
  destination: 'jfk',
  seed: 5,
  ...over,
});

describe('the crew’s commands', () => {
  it('move the levers in steps a replay can keep, and take them from the autothrottle', () => {
    const flight = createFlight(setup(), terrain);
    expect(flight.afds.autothrottle).toBe(true);
    applyCommand(flight, { kind: 'levers', value: 0.4321 });
    expect(flight.panel.levers).toEqual([0.431640625, 0.431640625, 0.431640625, 0.431640625]);
    expect(flight.afds.autothrottle).toBe(false);
    expect(quantiseLever(1.4)).toBe(1);
  });

  it('turn knobs by whole clicks, and tune radios to the band', () => {
    const flight = createFlight(setup(), terrain);
    const bug = flight.panel.headingBug;
    applyCommand(flight, { kind: 'knob', knob: 'heading', clicks: 2.6 });
    expect(flight.panel.headingBug).toBe(((bug + 3 - 1) % 360) + 1);
    applyCommand(flight, { kind: 'tuneNav', radio: 1, frequency: 113.80000001, course: 89.6 });
    expect(flight.panel.nav[1]).toEqual({ frequency: 113.8, course: 90 });
  });

  it('answer the controller and call the checklists through the radio and the book', () => {
    const flight = createFlight(setup({ mode: 'flight' }), terrain);
    applyCommand(flight, { kind: 'readback', choice: 'correct' });
    expect(flight.atc.log).toHaveLength(0);
    applyCommand(flight, { kind: 'completeChecklist', id: 'beforeTakeoff' });
    expect(flight.procedures.completed.beforeTakeoff).toBeNull();
  });

  it('give the glass deck its modes, and leave the classic deck’s alone', () => {
    const glass = createFlight(setup({ deck: 'glass' }), terrain);
    applyCommand(glass, { kind: 'button', button: 'levelChange' });
    expect(glass.afds).toMatchObject({ pitchMode: 'speed', levelChange: true, autothrottle: true });
    applyCommand(glass, { kind: 'button', button: 'altitudeHold' });
    expect(glass.afds).toMatchObject({ levelChange: false, thrustMode: 'speed' });
    applyCommand(glass, { kind: 'fms', edit: { op: 'approach', loaded: false } });
    expect(glass.fms?.pending?.approach).toBe(false);
    const classic = createFlight(setup(), terrain);
    applyCommand(classic, { kind: 'button', button: 'lnav' });
    expect(classic.afds.armedRoute).toBe(false);
  });

  it('do nothing to the autopilot under the 1982 Rules, which had none', () => {
    const flight = createFlight(setup({ level: 'rules1982' }), terrain);
    const before = { ...flight.afds };
    applyCommand(flight, { kind: 'button', button: 'approach' });
    expect(flight.afds).toEqual(before);
  });
});
