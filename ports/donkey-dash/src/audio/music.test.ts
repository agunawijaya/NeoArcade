import { compileSong } from '@shared/audio';
import { describe, expect, it } from 'vitest';
import { DAILY_BPM, ENDLESS_BPM } from '../engine/modes';
import { ROUTE_IDS, ROUTES } from '../engine/routes';
import { bpmOf, shift, SONG_IDS, songFor } from './music';

describe('the soundtrack', () => {
  it.each(SONG_IDS)('%s is four bars of sixteenths on every track', (id) => {
    const song = songFor(id);
    const compiled = compileSong(song);
    expect(compiled.lengthSteps).toBe(64);
    for (const track of song.tracks) {
      expect(track.pattern.trim().split(/\s+/)).toHaveLength(64);
    }
  });

  it('plays at the tempo of the road, so donkeys arrive on its beat', () => {
    for (const route of ROUTE_IDS) expect(bpmOf(route)).toBe(ROUTES[route].bpm);
    expect(bpmOf('endless')).toBe(ENDLESS_BPM);
    expect(bpmOf('daily')).toBe(DAILY_BPM);
  });

  it('moves notes by semitones across octaves', () => {
    expect(shift('A2', 12)).toBe('A3');
    expect(shift('B1', 1)).toBe('C2');
    expect(shift('C3', -1)).toBe('B2');
    expect(shift('A#1', 3)).toBe('C#2');
  });
});
