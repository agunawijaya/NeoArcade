import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('keeps a player’s choice', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows the device otherwise, whatever was stored', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
    expect(resolveTheme('sepia', true)).toBe('light');
    expect(resolveTheme(undefined, false)).toBe('dark');
  });
});
