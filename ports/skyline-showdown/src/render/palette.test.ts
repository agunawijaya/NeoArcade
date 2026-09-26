import { describe, expect, it } from 'vitest';
import { WORLD_IDS } from '../engine/worlds';
import {
  mixColours,
  paletteFor,
  parseColour,
  shade,
  timeOfDayForRound,
  withAlpha,
} from './palette';

describe('timeOfDayForRound', () => {
  it('stays at dusk without the day cycle', () => {
    expect([1, 2, 5].map((round) => timeOfDayForRound(round, false))).toEqual([0, 0, 0]);
  });

  it('walks from dusk through night to dawn and round again', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((round) => timeOfDayForRound(round, true))).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 0,
    ]);
  });
});

describe('colours', () => {
  it('mixes hex colours, alpha included', () => {
    expect(mixColours('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColours('#ff000000', '#ff0000ff', 0.5)).toBe('#ff000080');
  });

  it('shades and adds transparency', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(withAlpha('#ff8a3d', 0.5)).toBe('rgba(255, 138, 61, 0.5)');
  });
});

describe('paletteFor', () => {
  it('gives each world its own sky', () => {
    const skies = new Set(WORLD_IDS.map((world) => paletteFor(world, 0).skyTop));
    expect(skies.size).toBe(4);
  });

  it('blends smoothly between dusk and night', () => {
    const dusk = paletteFor('earth', 0);
    const night = paletteFor('earth', 1);
    const between = paletteFor('earth', 0.5);
    expect(between.stars).toBeCloseTo((dusk.stars + night.stars) / 2);
    expect(between.skyTop).toBe(mixColours(dusk.skyTop, night.skyTop, 0.5));
  });

  it('comes back to dusk after dawn', () => {
    expect(paletteFor('mars', 3)).toEqual(paletteFor('mars', 0));
  });
});

describe('the light theme', () => {
  it('turns dusk and dawn into daylight', () => {
    for (const time of [0, 2, 2.5]) {
      expect(paletteFor('earth', time, 'light').daylight).toBe(1);
      expect(paletteFor('earth', time, 'dark').daylight).toBe(0);
    }
  });

  it('keeps the night dark', () => {
    expect(paletteFor('earth', 1, 'light')).toEqual(paletteFor('earth', 1, 'dark'));
  });

  it('brightens the sky everywhere but the airless Moon', () => {
    const brightness = (colour: string) =>
      parseColour(colour)
        .slice(0, 3)
        .reduce((sum, channel) => sum + channel, 0);
    for (const world of WORLD_IDS) {
      const light = paletteFor(world, 0, 'light');
      const dark = paletteFor(world, 0, 'dark');
      if (world === 'moon') expect(brightness(light.skyTop)).toBeLessThan(30);
      else expect(brightness(light.skyTop)).toBeGreaterThan(brightness(dark.skyTop) * 2);
      expect(brightness(light.facades[0] ?? '')).toBeGreaterThan(brightness(dark.facades[0] ?? ''));
    }
  });
});
