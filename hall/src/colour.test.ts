import { describe, expect, it } from 'vitest';
import { inkOn, shade, withAlpha } from './colour';

describe('colour helpers', () => {
  it('adds transparency to a hex colour', () => {
    expect(withAlpha('#ff8a3d', 0.5)).toBe('rgba(255, 138, 61, 0.5)');
  });

  it('mixes towards black or white', () => {
    expect(shade('#ff8a3d', -1)).toBe('rgb(0, 0, 0)');
    expect(shade('#000000', 0.5)).toBe('rgb(128, 128, 128)');
  });

  it('picks readable ink for accent-filled buttons', () => {
    expect(inkOn('#3ff3ff')).toBe('#140a1c');
    expect(inkOn('#ff8a3d')).toBe('#140a1c');
    expect(inkOn('#5b21b6')).toBe('#ffffff');
  });
});
