// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { badgeCount } from './badge-count';

describe('badgeCount', () => {
  it('stays hidden until the game has been played', () => {
    const count = badgeCount();
    expect(count.element.hidden).toBe(true);
    count.set({ unlocked: 7, total: 24, byTier: {} as never });
    expect(count.element.hidden).toBe(false);
    expect(count.element.textContent).toBe('7 / 24 badges');
    count.set(null);
    expect(count.element.hidden).toBe(true);
  });
});
