/**
 * The Hall's fixed list of categories (ADR 0018). Every game has exactly one
 * primary category and may have a secondary one; the lobby shows a shelf for
 * each category that has games, in this order. The list is closed on
 * purpose: a port picks from it, it never adds to it.
 */
export const CATEGORY_IDS = [
  'arcade',
  'action',
  'adventure',
  'simulation',
  'strategy',
  'puzzle',
  'sports',
  'card-board',
  'word-trivia',
  'learning',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface Category {
  id: CategoryId;
  name: string;
  /** One line under the heading of the category page. */
  blurb: string;
  /** Accent colours, one per Hall theme; each reads as text on that theme's page. */
  accent: { dark: string; light: string };
  /** The emblem's inner SVG markup on a 24-unit grid, stroked and filled in currentColor. */
  emblem: string;
}

// Shapes that are filled get a translucent wash, so the outline still leads.
const wash = 'fill="currentColor" fill-opacity="0.28"';
const solid = 'fill="currentColor" stroke="none"';

export const CATEGORIES: readonly Category[] = [
  {
    id: 'arcade',
    name: 'Arcade',
    blurb: 'Quick to learn, hard to put down: reflexes, high scores and one more go.',
    accent: { dark: '#ff5fae', light: '#bd1468' },
    // A joystick on its base, with a fire button.
    emblem: `<rect x="3.5" y="14.5" width="17" height="6" rx="2" ${wash}/><path d="M12 14.5V9"/><circle cx="12" cy="6.2" r="3" ${solid}/><circle cx="16.6" cy="17.5" r="1" ${solid}/>`,
  },
  {
    id: 'action',
    name: 'Action',
    blurb: 'Fast hands and quick thinking, from dogfights to daring escapes.',
    accent: { dark: '#ff7a57', light: '#b8381a' },
    // A lightning bolt.
    emblem: `<path d="M13.5 2.5 5 13.5h6.2l-1.7 8 8.5-11h-6.2z" ${wash}/>`,
  },
  {
    id: 'adventure',
    name: 'Adventure',
    blurb: 'Worlds to explore, riddles to untangle and stories to finish.',
    accent: { dark: '#ffbf4d', light: '#8f5a00' },
    // A compass with its needle.
    emblem: `<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3z" ${wash}/><circle cx="12" cy="12" r="1" ${solid}/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21"/>`,
  },
  {
    id: 'simulation',
    name: 'Simulation',
    blurb: 'Real machines and real jobs, modelled closely enough to master.',
    accent: { dark: '#45d98f', light: '#0f7a46' },
    // A dial with its needle, like a speedometer.
    emblem: `<path d="M3.5 16.5a8.5 8.5 0 0 1 17 0z" ${wash}/><path d="m12 16.5 4.2-5"/><circle cx="12" cy="16.5" r="1.5" ${solid}/><path d="M6.6 10.8 7.8 12M12 8v1.7M17.4 10.8 16.2 12M3 20h18"/>`,
  },
  {
    id: 'strategy',
    name: 'Strategy',
    blurb: 'Plans, trade-offs and the long game.',
    accent: { dark: '#7c95ff', light: '#2c4bc7' },
    // A pennant planted on a hill.
    emblem: `<path d="M7 20V3.5"/><path d="M7 4.5h11l-2.8 3.7L18 12H7" ${wash}/><path d="M2.5 20.5c2.5-2.6 6.5-3.4 10-2.4 3 .9 5.8.8 9-.6"/>`,
  },
  {
    id: 'puzzle',
    name: 'Puzzle',
    blurb: 'Brain teasers, logic and the quiet joy of a solution.',
    accent: { dark: '#b08cff', light: '#6233cf' },
    // A T-shaped falling block, four squares.
    emblem: `<path d="M3.5 7.5h17V13h-5.7v5.5H9.2V13H3.5z" ${wash}/><path d="M9.2 7.5V13M14.8 7.5V13M9.2 13h5.6"/>`,
  },
  {
    id: 'sports',
    name: 'Sports',
    blurb: 'Pitches, courts and tracks, and nobody telling you to go outside.',
    accent: { dark: '#c6e65c', light: '#4f7200' },
    // A ball with its seams.
    emblem: `<circle cx="12" cy="12" r="8.8" ${wash}/><path d="M12 3.2v17.6M3.2 12h17.6M6 5.6c2.8 3.4 2.8 9.4 0 12.8M18 5.6c-2.8 3.4-2.8 9.4 0 12.8"/>`,
  },
  {
    id: 'card-board',
    name: 'Card & Board',
    blurb: 'Table games for one, or for the whole family.',
    accent: { dark: '#3fe0c5', light: '#0a776a' },
    // A die showing five.
    emblem: `<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3.6" ${wash}/><circle cx="8.4" cy="8.4" r="1.25" ${solid}/><circle cx="15.6" cy="8.4" r="1.25" ${solid}/><circle cx="12" cy="12" r="1.25" ${solid}/><circle cx="8.4" cy="15.6" r="1.25" ${solid}/><circle cx="15.6" cy="15.6" r="1.25" ${solid}/>`,
  },
  {
    id: 'word-trivia',
    name: 'Word & Trivia',
    blurb: 'Letters, words and the questions you always knew the answer to.',
    accent: { dark: '#55ccff', light: '#086d9f' },
    // A speech bubble asking a question.
    emblem: `<path d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5v-8A2.5 2.5 0 0 1 6.5 3z" ${wash}/><path d="M9.9 7.6a2.1 2.1 0 1 1 2.9 2c-.5.2-.8.6-.8 1.1v.5"/><circle cx="12" cy="13.3" r="0.7" ${solid}/>`,
  },
  {
    id: 'learning',
    name: 'Learning',
    blurb: 'Programs that taught a generation to type, count and code.',
    accent: { dark: '#e57fff', light: '#8e22ad' },
    // A mortarboard with its tassel.
    emblem: `<path d="m2.5 9.5 9.5-4.6 9.5 4.6-9.5 4.6z" ${wash}/><path d="M6.5 11.7v4.6c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.6M21.5 9.5v5.2"/>`,
  },
];

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}

export function categoryById(id: CategoryId): Category {
  return CATEGORIES.find((category) => category.id === id) as Category;
}

/** Custom properties for an element drawn in a category's colour; CSS picks the theme's. */
export function categoryStyle(category: Category): string {
  return `--category-dark: ${category.accent.dark}; --category-light: ${category.accent.light}`;
}
