import { describe, expect, it } from 'vitest';
import { engineFingerprint } from './fingerprint';

/**
 * The land battles as they are flown since Carrier Ops (prompt 016). The
 * sea came in alongside them without touching them; the one deliberate
 * change was the autopilot (H), which used to switch itself off after its
 * first touch of the stick and now flies home and lands, so the scripted
 * pilot's trips home changed (see docs/games/mind-the-ox.md). If this
 * changes again, a land mode changed: make it deliberate, and record it.
 */
const LAND_BATTLES = ['ee0c40e5/175,-50', '41002970/-75,125', '1ab3ab15/225,0'];

describe('the engine fingerprint', () => {
  it('comes out the same every time it is computed', () => {
    expect(engineFingerprint()).toBe(engineFingerprint());
  });

  it('flies the land battles exactly as they are recorded here', () => {
    expect(engineFingerprint().split(';').slice(0, LAND_BATTLES.length)).toEqual(LAND_BATTLES);
  });
});
