import { describe, expect, it } from 'vitest';
import { resolveTheme, sanitiseThemeChoice } from './theme';

describe('theme choice', () => {
  it('follows the device on auto and obeys an explicit choice', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('falls back to auto for anything unexpected in storage', () => {
    expect(sanitiseThemeChoice('light')).toBe('light');
    expect(sanitiseThemeChoice('sepia')).toBe('auto');
    expect(sanitiseThemeChoice(null)).toBe('auto');
  });
});
