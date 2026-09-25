import { describe, expect, it } from 'vitest';
import { aimFromDrag, formatAim, swing } from './aim';

const hand = { x: 100, y: 200 };

describe('aimFromDrag', () => {
  it('throws opposite to the pull, like a slingshot', () => {
    // Pull down-left from player 1: the banana goes up-right at 45°.
    const aim = aimFromDrag(0, hand, { x: 60, y: 240 });
    expect(aim?.angle).toBeCloseTo(45);
    expect(aim?.power).toBe(Math.round(Math.hypot(40, 40) * 1.35));
  });

  it('measures player 2’s angle from its own side', () => {
    // Pull down-right from player 2: up-left, which is 45° from its side.
    expect(aimFromDrag(1, hand, { x: 140, y: 240 })?.angle).toBeCloseTo(45);
  });

  it('ignores tiny pulls so a tap does not throw', () => {
    expect(aimFromDrag(0, hand, { x: 98, y: 202 })).toBeNull();
  });

  it('keeps pulls upward along the roof instead of flipping backwards', () => {
    expect(aimFromDrag(0, hand, { x: 50, y: 150 })?.angle).toBe(0);
    expect(aimFromDrag(0, hand, { x: 150, y: 150 })?.angle).toBe(180);
  });

  it('caps the power', () => {
    expect(aimFromDrag(0, hand, { x: -400, y: 600 })?.power).toBe(200);
  });
});

describe('swing', () => {
  it('moves the arm the way the key points, for either gorilla', () => {
    expect(swing(0, { angle: 45, power: 50 }, 1).angle).toBe(46);
    expect(swing(1, { angle: 45, power: 50 }, 1).angle).toBe(44);
    expect(swing(0, { angle: 180, power: 50 }, 5).angle).toBe(180);
  });

  it('keeps tenths of a degree tidy', () => {
    expect(swing(0, { angle: 45, power: 50 }, 0.1 + 0.2).angle).toBe(45.3);
  });
});

describe('formatAim', () => {
  it('reads like the numbers the original asked for', () => {
    expect(formatAim({ angle: 45, power: 62.4 })).toBe('45° · 62');
    expect(formatAim({ angle: 45.5, power: 62 })).toBe('45.5° · 62');
  });
});
