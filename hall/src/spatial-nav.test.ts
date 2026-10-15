import { describe, expect, it } from 'vitest';
import { nearestInDirection, stepAcrossRows, type Box } from './spatial-nav';

const box = (left: number, top: number, width = 100, height = 100): Box => ({
  left,
  top,
  width,
  height,
});

// A 3 × 2 grid of cards with a search field above the first column.
const search = box(0, -80, 300, 40);
const grid = [box(0, 0), box(120, 0), box(240, 0), box(0, 120), box(120, 120)];
const [topLeft, topMiddle, topRight, bottomLeft, bottomMiddle] = grid as [Box, Box, Box, Box, Box];
const everything = [search, ...grid];

describe('nearestInDirection', () => {
  it('moves along a row', () => {
    expect(nearestInDirection(topLeft, everything, 'right')).toBe(topMiddle);
    expect(nearestInDirection(topRight, everything, 'left')).toBe(topMiddle);
  });

  it('stays in the column when moving up and down', () => {
    expect(nearestInDirection(topMiddle, everything, 'down')).toBe(bottomMiddle);
    expect(nearestInDirection(bottomLeft, everything, 'up')).toBe(topLeft);
  });

  it('finds the nearest box when the column below is empty', () => {
    expect(nearestInDirection(topRight, everything, 'down')).toBe(bottomMiddle);
  });

  it('reaches boxes of a different size, like a search field', () => {
    expect(nearestInDirection(topMiddle, everything, 'up')).toBe(search);
  });

  it('returns null at the edge', () => {
    expect(nearestInDirection(topRight, everything, 'right')).toBeNull();
    expect(nearestInDirection(bottomLeft, everything, 'down')).toBeNull();
  });
});

describe('stepAcrossRows', () => {
  const card = (left: number, top: number) => ({ left, top, width: 100, height: 80 });
  // Three shelves: the middle one is scrolled sideways, the last is empty.
  const rows = [
    [card(0, 0), card(120, 0), card(240, 0)],
    [card(-180, 200), card(-60, 200), card(60, 200), card(180, 200)],
    [],
    [card(0, 600)],
  ];

  it('steps along a row and stops at its ends', () => {
    expect(stepAcrossRows(rows, { row: 0, index: 1 }, 'right')).toEqual({ row: 0, index: 2 });
    expect(stepAcrossRows(rows, { row: 0, index: 2 }, 'right')).toBeNull();
    expect(stepAcrossRows(rows, { row: 0, index: 0 }, 'left')).toBeNull();
  });

  it('lands on the closest item across in the next row', () => {
    expect(stepAcrossRows(rows, { row: 0, index: 1 }, 'down')).toEqual({ row: 1, index: 2 });
    expect(stepAcrossRows(rows, { row: 1, index: 0 }, 'up')).toEqual({ row: 0, index: 0 });
  });

  it('skips empty rows and says when there is nowhere to go', () => {
    expect(stepAcrossRows(rows, { row: 1, index: 3 }, 'down')).toEqual({ row: 3, index: 0 });
    expect(stepAcrossRows(rows, { row: 0, index: 0 }, 'up')).toBeNull();
    expect(stepAcrossRows(rows, { row: 3, index: 0 }, 'down')).toBeNull();
  });
});
