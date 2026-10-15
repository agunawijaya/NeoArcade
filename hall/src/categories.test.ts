import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_IDS, categoryById, isCategoryId } from './categories';
import { contrastRatio } from './colour';

// The page colours from styles/base.css, dark and light.
const PAGE = { dark: '#06050d', light: '#f4f1fa' };

describe('categories', () => {
  it('lists the fixed categories once each, in shelf order', () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual([...CATEGORY_IDS]);
    expect(CATEGORIES.map((category) => category.name)).toEqual([
      'Arcade',
      'Action',
      'Adventure',
      'Simulation',
      'Strategy',
      'Puzzle',
      'Sports',
      'Card & Board',
      'Word & Trivia',
      'Learning',
    ]);
  });

  it.each(CATEGORIES.map((category) => [category.name, category] as const))(
    '%s reads as text on both themes and has an emblem',
    (_name, category) => {
      expect(contrastRatio(category.accent.dark, PAGE.dark)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(category.accent.light, PAGE.light)).toBeGreaterThanOrEqual(4.5);
      expect(category.emblem).toMatch(/^<(path|rect|circle)/);
    },
  );

  it('knows its own ids and nothing else', () => {
    expect(isCategoryId('card-board')).toBe(true);
    expect(isCategoryId('Card & Board')).toBe(false);
    expect(categoryById('simulation').name).toBe('Simulation');
  });
});
