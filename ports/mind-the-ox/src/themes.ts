import type { ShipKind } from './engine/fleet';
import type { RaiderKind, TargetKind } from './engine/map';
import type { CpuLevel } from './engine/world';

/**
 * The three themes: one engine and one set of rules, dressed three ways.
 * A theme changes the pictures (render/palette.ts and the painters), the
 * sounds and every word the player reads, never what happens.
 */
export type ThemeId = 'great-war' | 'cyan-magenta' | 'airshow';

export const THEME_IDS: readonly ThemeId[] = ['great-war', 'cyan-magenta', 'airshow'];

/** A computer pilot as the player meets them: a name and a few words of character. */
export interface RivalCopy {
  name: string;
  /** Their plane and their habits, for the Dogfight screen. */
  style: string;
}

export interface ThemeCopy {
  id: ThemeId;
  name: string;
  blurb: string;
  /** Each side's name, for briefings and results. */
  sides: readonly [string, string];
  targets: Readonly<Record<TargetKind, string>>;
  convoy: string;
  /** Each class of ship, and the bombers and airships of a raid, in this theme's words. */
  ships: Readonly<Record<ShipKind, string>>;
  raiders: Readonly<Record<RaiderKind, string>>;
  torpedo: string;
  /** What the guns fire and the racks drop, in this theme's words. */
  guns: string;
  bombs: string;
  /** What happens to a pilot whose plane goes down. */
  downed: 'parachute' | 'glide';
  /** "Shot down", or the theme's kinder word for it. */
  shotDown: string;
  rivals: Readonly<Record<CpuLevel, RivalCopy>>;
  ace: RivalCopy;
  /** Captions over the picture: the winner's flight, and the loser's end card. */
  intoTheSun: string;
  theEnd: string;
}

export const THEMES: Readonly<Record<ThemeId, ThemeCopy>> = {
  'great-war': {
    id: 'great-war',
    name: 'Great War 1917',
    blurb:
      'Camel-type scouts over the Western Front: roundels and crosses, trenches and kite balloons.',
    sides: ['the Allies', 'the Central Powers'],
    targets: {
      hangar: 'hangar',
      factory: 'munitions works',
      depot: 'fuel depot',
      tank: 'landship',
      shed: 'airship shed',
    },
    convoy: 'supply column',
    ships: {
      carrier: 'carrier',
      battleship: 'dreadnought',
      cruiser: 'cruiser',
      destroyer: 'destroyer',
      supply: 'supply ship',
      'torpedo-boat': 'torpedo boat',
      monitor: 'monitor',
    },
    raiders: { bomber: 'heavy bomber', zeppelin: 'Zeppelin' },
    torpedo: 'torpedo',
    guns: 'guns',
    bombs: 'bombs',
    downed: 'parachute',
    shotDown: 'shot down',
    rivals: {
      easy: {
        name: 'Cadet Emil Sperling',
        style: 'A pale trainer. Cautious, and only shoots close.',
      },
      normal: { name: 'Leutnant Otto Falk', style: 'A mottled scout. Flies by the 1984 book.' },
      hard: {
        name: 'Hauptmann Kurt Adler',
        style: 'Black and white checks. Leads his aim, mends his wounds.',
      },
      brutal: {
        name: 'The Grey Baron',
        style: 'All grey but the nose. Slides into your line of fire.',
      },
    },
    ace: { name: 'The Crimson Kestrel', style: 'Scarlet from spinner to rudder, and hunting.' },
    intoTheSun: 'Into the sun',
    theEnd: 'The End',
  },
  'cyan-magenta': {
    id: 'cyan-magenta',
    name: 'Cyan vs Magenta',
    blurb: 'A cartoon war between two air corps named after the 1984 colours. Everyone bails out.',
    sides: ['the Cyan Air Corps', 'the Magenta Flying Circus'],
    targets: {
      hangar: 'hangar',
      factory: 'factory',
      depot: 'fuel depot',
      tank: 'supply truck',
      shed: 'blimp hangar',
    },
    convoy: 'truck convoy',
    ships: {
      carrier: 'flat-top',
      battleship: 'big boat',
      cruiser: 'cruiser',
      destroyer: 'destroyer',
      supply: 'supply boat',
      'torpedo-boat': 'zippy boat',
      monitor: 'gun barge',
    },
    raiders: { bomber: 'bomber', zeppelin: 'blimp' },
    torpedo: 'fish',
    guns: 'guns',
    bombs: 'bombs',
    downed: 'parachute',
    shotDown: 'shot down',
    rivals: {
      easy: { name: 'Private Pinky', style: 'Wobbly wings and good intentions.' },
      normal: { name: 'Sergeant Rosa', style: 'Straight out of the 1984 manual.' },
      hard: { name: 'Major Mauve', style: 'Patient, precise, polka-dotted.' },
      brutal: { name: 'Colonel Fuchsia', style: 'Never misses a chance, or a pun.' },
    },
    ace: {
      name: 'The Magenta Menace',
      style: 'Stripes, a moustache on the cowling, and no mercy.',
    },
    intoTheSun: 'Into the sun',
    theEnd: 'The End',
  },
  airshow: {
    id: 'airshow',
    name: 'Airshow',
    blurb:
      'No war at all: pop balloons, cut ribbons, flour-bomb the markers and outfly the rival team.',
    sides: ['the Bluebirds', 'the Red Kites'],
    targets: {
      hangar: 'balloon stand',
      factory: 'stunt marker',
      depot: 'fireworks stand',
      tank: 'ribbon gate',
      shed: 'blimp hangar',
    },
    convoy: 'parade of floats',
    ships: {
      carrier: 'show carrier',
      battleship: 'target barge',
      cruiser: "judges' launch",
      destroyer: 'safety boat',
      supply: 'ferry',
      'torpedo-boat': 'speedboat',
      monitor: 'float barge',
    },
    raiders: { bomber: 'banner plane', zeppelin: 'blimp' },
    torpedo: 'skimmer',
    guns: 'paint guns',
    bombs: 'flour bags',
    downed: 'glide',
    shotDown: 'tagged out',
    rivals: {
      easy: { name: 'Daisy Loop', style: 'A yellow trainer that loves a slow roll.' },
      normal: { name: 'Barnstorm Bill', style: 'Flies the classic routine, every time.' },
      hard: { name: 'Ruby Stall-Turn', style: 'Reads your line and gets there first.' },
      brutal: { name: 'Captain Corkscrew', style: 'Wins every show he enters, somehow.' },
    },
    ace: { name: 'The Flying Fandango', style: 'Sequins, smoke and a perfect record.' },
    intoTheSun: 'Into the sunset',
    theEnd: 'Show over',
  },
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** A theme's word at the start of a sentence: "the Allies" becomes "The Allies". */
export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Fills {enemy}, {friends}, {depot}, {convoy}, {bombs}, {guns}, {carrier}, {zeppelin} … in a line of copy. */
export function themed(text: string, theme: ThemeCopy): string {
  const words: Record<string, string> = {
    friends: theme.sides[0],
    enemy: theme.sides[1],
    hangar: theme.targets.hangar,
    factory: theme.targets.factory,
    depot: theme.targets.depot,
    tank: theme.targets.tank,
    convoy: theme.convoy,
    shed: theme.targets.shed,
    carrier: theme.ships.carrier,
    battleship: theme.ships.battleship,
    destroyer: theme.ships.destroyer,
    supply: theme.ships.supply,
    boat: theme.ships['torpedo-boat'],
    bomber: theme.raiders.bomber,
    zeppelin: theme.raiders.zeppelin,
    torpedo: theme.torpedo,
    guns: theme.guns,
    bombs: theme.bombs,
    ace: theme.ace.name,
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => words[key] ?? match);
}
