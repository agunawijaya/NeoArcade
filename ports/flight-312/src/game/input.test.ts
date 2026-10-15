import { describe, expect, it } from 'vitest';
import { bindingsFor, type ControlScheme, type FlightKey } from './input';

/** The digit keys pick a view, or a readback while a controller waits: one key, two jobs, on purpose. */
const SHARED_ON_PURPOSE: FlightKey[][] = [
  ['answer1', 'viewMain'],
  ['answer2', 'viewPedestal'],
  ['answer3', 'viewOverhead'],
];

function clashes(scheme: ControlScheme): string[] {
  const actionsByKey = new Map<string, FlightKey[]>();
  for (const [action, keys] of Object.entries(bindingsFor(scheme)) as [FlightKey, string[]][]) {
    for (const key of keys) actionsByKey.set(key, [...(actionsByKey.get(key) ?? []), action]);
  }
  return [...actionsByKey.entries()]
    .filter(([, actions]) => actions.length > 1)
    .filter(
      ([, actions]) =>
        !SHARED_ON_PURPOSE.some(
          (pair) => pair.length === actions.length && pair.every((a) => actions.includes(a)),
        ),
    )
    .map(([key, actions]) => `${key}: ${actions.join(', ')}`);
}

describe('the keyboard layouts', () => {
  for (const scheme of ['modern', 'singleFile', 'ibm'] as const) {
    it(`never give one key two jobs in the ${scheme} layout`, () => {
      expect(clashes(scheme)).toEqual([]);
    });
  }

  it('keep the program’s own keys in both 1982 layouts', () => {
    const single = bindingsFor('singleFile');
    const ibm = bindingsFor('ibm');
    expect(single.pitchUp).toContain('key:KeyU');
    expect(single.pitchDown).toContain('key:KeyD');
    expect(single.flare).toContain('key:KeyC');
    // CHR$(50), the 2, is nose up in the IBM listing.
    expect(ibm.pitchUp).toContain('key:Numpad2');
    expect(ibm.pitchDown).toContain('key:Numpad8');
    expect(ibm.flare).toContain('key:Numpad6');
    for (const layout of [single, ibm]) {
      expect(layout.goAround).toContain('key:KeyM');
      expect(layout.chart).toContain('key:KeyN');
      expect(layout.thrustUp).toContain('key:KeyF');
      expect(layout.gear).toContain('key:KeyW');
    }
  });
});
