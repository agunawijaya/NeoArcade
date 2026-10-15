import { CATEGORY_IDS, type CategoryId } from '../src/categories';
import type { GameEntry } from '../src/catalog';
import { MACHINE_IDS } from '../src/machines';

/**
 * Forty games for the dev server (`/hall/?fixture=big`): the real catalog
 * plus pretend ones spread unevenly over the categories, as a big
 * collection would be, to prove the shelves, the Today panel and the
 * timeline scale. Pretend games have no port and no screenshots, so they
 * show the real games' covers, or the generic one.
 */
const TITLES = [
  'Neon Nibbles',
  'Moon Lander',
  'Star Trader',
  'Hammurabi Rising',
  'Lunar Garden',
  'Tank Duel',
  'Fox and Geese',
  'Word Ladder',
  'Typing Tutor Turbo',
  'Pinball Pastel',
  'Cave Crawler',
  'Sea Battle',
  'Mastermind Deluxe',
  'Paddle Party',
  'Rally Ridge',
  'Golf Nine',
  'Reversi Nights',
  'Solitaire Sunrise',
  'Trivia Tower',
  'Hangman Hotel',
  'Number Munchers',
  'Snake Pit',
  'Asteroid Belt',
  'Frogger Lane',
  'Bouncing Bolt',
  'Dungeon of Doors',
  'Space Freighter',
  'Railway Baron',
  'Castle Siege',
  'Lights Out',
  'Sokoban Shelf',
  'Tennis Ace',
  'Checkers Club',
  'Spelling Bee',
  'Abacus Academy',
  'Night Racer',
  'Robot Rescue',
];

// Uneven on purpose: a real collection is mostly arcade games and a few of everything else.
const SPREAD: CategoryId[] = [
  'arcade',
  'action',
  'puzzle',
  'strategy',
  'arcade',
  'action',
  'card-board',
  'word-trivia',
  'learning',
  'arcade',
  'adventure',
  'strategy',
  'puzzle',
  'arcade',
  'sports',
  'sports',
  'card-board',
  'card-board',
  'word-trivia',
  'word-trivia',
  'learning',
  'arcade',
  'action',
  'arcade',
  'arcade',
  'adventure',
  'simulation',
  'simulation',
  'strategy',
  'puzzle',
  'puzzle',
  'sports',
  'card-board',
  'learning',
  'learning',
  'action',
  'adventure',
];
const ACCENTS = ['#ff5fae', '#4cc9ff', '#ffbf4d', '#45d98f', '#b08cff', '#ff7a57', '#3fe0c5'];
const COVERS = ['skyline-showdown', 'donkey-dash', 'long-haul', 'pretend'];

export function bigCatalog(real: unknown): GameEntry[] {
  const games = Array.isArray(real) ? [...(real as GameEntry[])] : [];
  TITLES.forEach((title, index) => {
    const category = SPREAD[index % SPREAD.length] as CategoryId;
    const secondary = index % 7 === 3 ? CATEGORY_IDS[(index + 4) % CATEGORY_IDS.length] : undefined;
    const year = 1980 + ((index * 7) % 23);
    const slug = `fixture-${String(index + 1).padStart(2, '0')}`;
    games.push({
      slug,
      title,
      tagline: `A pretend ${category.replace('-', ' and ')} game, here to fill the shelves.`,
      origin: {
        title:
          title
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .slice(0, 8) + '.BAS',
        author: 'A pretend author',
        ...(index % 5 === 2
          ? { era: { label: `around ${year + 1}`, from: year, to: year + 3 } }
          : { year }),
        platform: 'A pretend computer',
        language: 'BASIC',
        machine: MACHINE_IDS[index % MACHINE_IDS.length] ?? 'ibm-pc',
      },
      category,
      ...(secondary && secondary !== category ? { secondaryCategory: secondary } : {}),
      genres: [index % 2 ? 'Reflex' : 'Thinking', index % 3 ? 'Classic' : 'Duel'],
      players: { min: 1, max: 1 + (index % 3) },
      accent: ACCENTS[index % ACCENTS.length] ?? '#ff5fae',
      path: `${slug}/`,
      cover: COVERS[index % COVERS.length] ?? 'pretend',
      docs: { howToPlay: 'docs/HOW-TO-PLAY.md', about: 'docs/ABOUT.md' },
      added: `2026-${String(1 + (index % 9)).padStart(2, '0')}-${String(1 + ((index * 3) % 27)).padStart(2, '0')}`,
      ...(index % 9 === 4
        ? { daily: { name: `Daily ${title.split(' ')[0]}`, launch: '2026-10-01', mode: 'daily' } }
        : {}),
    });
  });
  return games;
}
