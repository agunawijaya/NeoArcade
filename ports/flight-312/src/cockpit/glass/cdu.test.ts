import { beforeAll, describe, expect, it } from 'vitest';
import { loadTerrainSource } from '../../data/unpack';
import { applyCommand } from '../../engine/crew';
import { createFlight, type Flight } from '../../engine/flight';
import { STATIONS } from '../../engine/navdata';
import { createTerrain, type Terrain } from '../../engine/terrain';
import { Cdu } from './cdu';

/**
 * The CDU turns keys into the crew's commands: what is typed and where it
 * is put becomes a route edit, a radio tuned, a speed accepted — or a
 * message in the scratchpad when it makes no sense.
 */
let terrain: Terrain;

beforeAll(async () => {
  terrain = createTerrain(await loadTerrainSource());
});

const glassFlight = () =>
  createFlight(
    { mode: 'flight', level: 'pilot', destination: 'bos', seed: 312, deck: 'glass' },
    terrain,
  );
const station = (ident: string) => STATIONS.findIndex((one) => one.ident === ident);

function typeText(cdu: Cdu, text: string, flight: Flight) {
  for (const character of text) cdu.type(character, flight);
}

describe('the CDU', () => {
  it('inserts a typed station into the route at the line chosen', () => {
    const flight = glassFlight();
    const cdu = new Cdu();
    typeText(cdu, 'ood', flight);
    expect(cdu.scratchpad).toBe('OOD');
    expect(cdu.press({ lsk: 'R', line: 3 }, flight)).toEqual([
      { kind: 'fms', edit: { op: 'insert', index: 0, station: station('OOD') } },
    ]);
    expect(cdu.scratchpad).toBe('');
  });

  it('deletes a leg with DEL and its line select key', () => {
    const flight = glassFlight();
    const cdu = new Cdu();
    cdu.press({ edit: 'DEL' }, flight);
    expect(cdu.scratchpad).toBe('DELETE');
    expect(cdu.press({ lsk: 'R', line: 3 }, flight)).toEqual([
      { kind: 'fms', edit: { op: 'delete', index: 0 } },
    ]);
  });

  it('executes a modification with EXEC, and lights EXEC only while there is one', () => {
    const flight = glassFlight();
    const cdu = new Cdu();
    expect(cdu.execLit(flight)).toBe(false);
    expect(cdu.press({ edit: 'EXEC' }, flight)).toEqual([]);
    typeText(cdu, 'OOD', flight);
    for (const command of cdu.press({ lsk: 'R', line: 3 }, flight)) applyCommand(flight, command);
    expect(cdu.execLit(flight)).toBe(true);
    expect(cdu.type('Enter', flight)).toEqual([{ kind: 'fms', edit: { op: 'execute' } }]);
  });

  it('flies direct to a waypoint typed onto the first line of LEGS', () => {
    const flight = glassFlight();
    const cdu = new Cdu();
    cdu.press({ page: 'LEGS' }, flight);
    typeText(cdu, 'BOS', flight);
    const target = flight.fms?.route.indexOf(station('BOS')) ?? -1;
    expect(target).toBeGreaterThan(0);
    expect(cdu.press({ lsk: 'L', line: 1 }, flight)).toEqual([
      { kind: 'fms', edit: { op: 'direct', index: target } },
    ]);
  });

  it('tunes a VOR and its course from the NAV RAD page', () => {
    const flight = glassFlight();
    const cdu = new Cdu();
    cdu.press({ page: 'NAV RAD' }, flight);
    typeText(cdu, '113.8/090', flight);
    expect(cdu.press({ lsk: 'L', line: 1 }, flight)).toEqual([
      { kind: 'tuneNav', radio: 0, frequency: 113.8, course: 90 },
    ]);
    typeText(cdu, '/120', flight);
    expect(cdu.press({ lsk: 'R', line: 2 }, flight)).toEqual([
      { kind: 'tuneNav', radio: 1, frequency: flight.panel.nav[1].frequency, course: 120 },
    ]);
  });

  it('accepts the takeoff speeds on the ground from INIT REF', () => {
    const flight = glassFlight();
    const cdu = new Cdu();
    cdu.press({ page: 'INIT REF' }, flight);
    expect(cdu.press({ lsk: 'R', line: 6 }, flight)).toEqual([
      { kind: 'fms', edit: { op: 'acceptTakeoffSpeeds' } },
    ]);
  });

  it('answers a bad entry with a message, which CLR takes away', () => {
    const flight = glassFlight();
    const cdu = new Cdu();
    typeText(cdu, 'XYZ', flight);
    expect(cdu.press({ lsk: 'R', line: 3 }, flight)).toEqual([]);
    expect(cdu.scratchpad).toBe('NOT IN DATA BASE');
    cdu.press({ edit: 'CLR' }, flight);
    expect(cdu.scratchpad).toBe('XYZ');
    cdu.press({ page: 'NAV RAD' }, flight);
    cdu.type('Backspace', flight);
    cdu.type('Backspace', flight);
    cdu.type('Backspace', flight);
    typeText(cdu, '120.5', flight);
    expect(cdu.press({ lsk: 'L', line: 1 }, flight)).toEqual([]);
    expect(cdu.scratchpad).toBe('INVALID ENTRY');
  });
});
