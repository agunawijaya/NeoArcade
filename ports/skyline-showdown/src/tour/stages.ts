import type { CpuLevel } from '../engine/ai';
import type { TwistKind } from '../engine/twists';
import type { WorldId } from '../engine/worlds';
import type { RivalId } from './rivals';

/**
 * The World Tour: four chapters, fifteen stages. A stage is data: a city,
 * its world and look, its twists, a rival and the numbers behind its stars.
 * Stages are short (first to 2); each chapter ends with a boss (first to 3).
 */
export type ChapterId = 'earth' | 'moon' | 'mars' | 'jupiter';

export interface Chapter {
  id: ChapterId;
  number: number;
  name: string;
  world: WorldId;
  /** Stars needed in total to leave for this chapter (the previous boss must be beaten too). */
  starsToUnlock: number;
  /** One line on the map. */
  feel: string;
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'earth',
    number: 1,
    name: 'Earth',
    world: 'earth',
    starsToUnlock: 0,
    feel: 'Six cities, one twist each',
  },
  {
    id: 'moon',
    number: 2,
    name: 'The Moon',
    world: 'moon',
    starsToUnlock: 10,
    feel: 'No wind, huge slow arcs',
  },
  {
    id: 'mars',
    number: 3,
    name: 'Mars',
    world: 'mars',
    starsToUnlock: 17,
    feel: 'Thin air and dust',
  },
  {
    id: 'jupiter',
    number: 4,
    name: 'Jupiter',
    world: 'jupiter',
    starsToUnlock: 24,
    feel: 'Crushing gravity, endless storms',
  },
];

/** Which look a city is painted in (see render/kits.ts). */
export type KitId =
  | 'jakarta'
  | 'tokyo'
  | 'dubai'
  | 'cairo'
  | 'rio'
  | 'newYork'
  | 'moonBase'
  | 'marsColony'
  | 'jupiterStation';

export type StageId =
  | 'jakarta'
  | 'tokyo'
  | 'dubai'
  | 'cairo'
  | 'rio'
  | 'new-york'
  | 'tranquility'
  | 'copernicus'
  | 'earthrise'
  | 'dust-basin'
  | 'red-canyon'
  | 'olympus'
  | 'storm-harbor'
  | 'red-spot'
  | 'the-eye';

export interface Stage {
  id: StageId;
  chapter: ChapterId;
  /** 1–15, in tour order. */
  number: number;
  city: string;
  kit: KitId;
  world: WorldId;
  twists: readonly TwistKind[];
  /** The twist as a player meets it: a name and one sentence. */
  twist: { name: string; line: string };
  rival: RivalId;
  /** Returning rivals come back sharper than they were on Earth. */
  rivalLevel?: CpuLevel;
  points: number;
  boss: boolean;
  /** Star two: win within this many of your own throws. */
  throwBudget: number;
  /** A time of day for the city's light (see render/palette.ts). */
  timeOfDay: number;
  /** Rain and fog for this city, when it has weather. */
  weather: { rain: boolean; fog: boolean };
}

const dry = { rain: false, fog: false };

export const STAGES: readonly Stage[] = [
  {
    id: 'jakarta',
    chapter: 'earth',
    number: 1,
    city: 'Jakarta',
    kit: 'jakarta',
    world: 'earth',
    twists: ['gusts'],
    twist: {
      name: 'Monsoon gusts',
      line: 'The monsoon never settles: the wind changes after every throw, so check the gauge each turn.',
    },
    rival: 'drizzle',
    points: 2,
    boss: false,
    throwBudget: 12,
    timeOfDay: 0.1,
    weather: { rain: true, fog: false },
  },
  {
    id: 'tokyo',
    chapter: 'earth',
    number: 2,
    city: 'Tokyo',
    kit: 'tokyo',
    world: 'earth',
    twists: ['drone'],
    twist: {
      name: 'Billboard drone',
      line: 'A billboard drone patrols above the street and stops any banana it touches. It only moves while a banana flies: learn its timing.',
    },
    rival: 'glitch',
    points: 2,
    boss: false,
    throwBudget: 9,
    timeOfDay: 1,
    weather: dry,
  },
  {
    id: 'dubai',
    chapter: 'earth',
    number: 3,
    city: 'Dubai',
    kit: 'dubai',
    world: 'earth',
    twists: ['supertall', 'jetStream'],
    twist: {
      name: 'Supertall and jet stream',
      line: 'A supertall tower splits the city, and high above it the jet stream blows with a wind of its own.',
    },
    rival: 'summit',
    points: 2,
    boss: false,
    throwBudget: 11,
    timeOfDay: 0,
    weather: dry,
  },
  {
    id: 'cairo',
    chapter: 'earth',
    number: 4,
    city: 'Cairo',
    kit: 'cairo',
    world: 'earth',
    twists: ['hiddenWind'],
    twist: {
      name: 'Heat haze',
      line: 'The heat haze hides the wind gauge. Read the flags, the smoke and the clouds instead.',
    },
    rival: 'mirage',
    points: 2,
    boss: false,
    throwBudget: 10,
    timeOfDay: 2.6,
    weather: { rain: false, fog: true },
  },
  {
    id: 'rio',
    chapter: 'earth',
    number: 5,
    city: 'Rio',
    kit: 'rio',
    world: 'earth',
    twists: ['hillside'],
    twist: {
      name: 'Hillside city',
      line: 'The city climbs a steep hill: one of you throws uphill, the other down.',
    },
    rival: 'tempo',
    points: 2,
    boss: false,
    throwBudget: 8,
    timeOfDay: 2.8,
    weather: dry,
  },
  {
    id: 'new-york',
    chapter: 'earth',
    number: 6,
    city: 'New York',
    kit: 'newYork',
    world: 'earth',
    twists: ['drone', 'gusts'],
    twist: {
      name: 'Rush hour',
      line: 'Two old headaches at once: the patrol drone is back, and gusts change the wind after every throw.',
    },
    rival: 'landlord',
    points: 3,
    boss: true,
    throwBudget: 18,
    timeOfDay: 0.55,
    weather: { rain: false, fog: true },
  },
  {
    id: 'tranquility',
    chapter: 'moon',
    number: 7,
    city: 'Tranquility Flats',
    kit: 'moonBase',
    world: 'moon',
    twists: [],
    twist: {
      name: 'No air at all',
      line: 'No wind and a sixth of Earth’s gravity: bananas float in huge, slow arcs. Throw softer than you think.',
    },
    rival: 'drizzle',
    rivalLevel: 'normal',
    points: 2,
    boss: false,
    throwBudget: 9,
    timeOfDay: 0,
    weather: dry,
  },
  {
    id: 'copernicus',
    chapter: 'moon',
    number: 8,
    city: 'Copernicus Rim',
    kit: 'moonBase',
    world: 'moon',
    twists: ['bouncy'],
    twist: {
      name: 'Springy ground',
      line: 'The ground is springy here: every banana bounces once off the first building it hits. Bank shots welcome.',
    },
    rival: 'tempo',
    rivalLevel: 'normal',
    points: 2,
    boss: false,
    throwBudget: 7,
    timeOfDay: 1,
    weather: dry,
  },
  {
    id: 'earthrise',
    chapter: 'moon',
    number: 9,
    city: 'Earthrise Heights',
    kit: 'moonBase',
    world: 'moon',
    twists: ['bouncy', 'drone'],
    twist: {
      name: 'Low orbit',
      line: 'Springy ground, and a patrol drone gliding through the long lunar arcs.',
    },
    rival: 'orbit',
    points: 3,
    boss: true,
    throwBudget: 13,
    timeOfDay: 2.2,
    weather: dry,
  },
  {
    id: 'dust-basin',
    chapter: 'mars',
    number: 10,
    city: 'Dust Basin',
    kit: 'marsColony',
    world: 'mars',
    twists: ['dustDevil'],
    twist: {
      name: 'Dust devil',
      line: 'A dust devil whirls between you, shoving bananas sideways as they pass. It wanders after every throw.',
    },
    rival: 'glitch',
    rivalLevel: 'normal',
    points: 2,
    boss: false,
    throwBudget: 8,
    timeOfDay: 0,
    weather: { rain: false, fog: true },
  },
  {
    id: 'red-canyon',
    chapter: 'mars',
    number: 11,
    city: 'Red Canyon',
    kit: 'marsColony',
    world: 'mars',
    twists: ['hillside', 'hiddenWind'],
    twist: {
      name: 'Dust storm',
      line: 'A canyon slope, and a dust storm thick enough to hide the wind gauge. Watch the dust.',
    },
    rival: 'mirage',
    rivalLevel: 'hard',
    points: 2,
    boss: false,
    throwBudget: 8,
    timeOfDay: 2.5,
    weather: { rain: false, fog: true },
  },
  {
    id: 'olympus',
    chapter: 'mars',
    number: 12,
    city: 'Olympus Summit',
    kit: 'marsColony',
    world: 'mars',
    twists: ['hillside', 'dustDevil'],
    twist: {
      name: 'Summit storm',
      line: 'The city climbs the mountain’s slope, and a dust devil prowls between you, shoving bananas sideways.',
    },
    rival: 'rust',
    points: 3,
    boss: true,
    throwBudget: 11,
    timeOfDay: 1.2,
    weather: dry,
  },
  {
    id: 'storm-harbor',
    chapter: 'jupiter',
    number: 13,
    city: 'Storm Harbor',
    kit: 'jupiterStation',
    world: 'jupiter',
    twists: ['gusts'],
    twist: {
      name: 'Jovian storms',
      line: 'Crushing gravity, and storms that change the wind after every throw. Throw hard and read fast.',
    },
    rival: 'summit',
    points: 2,
    boss: false,
    throwBudget: 9,
    timeOfDay: 0,
    weather: { rain: true, fog: false },
  },
  {
    id: 'red-spot',
    chapter: 'jupiter',
    number: 14,
    city: 'Red Spot Ring',
    kit: 'jupiterStation',
    world: 'jupiter',
    twists: ['lightning'],
    twist: {
      name: 'Lightning',
      line: 'Lightning marks a rooftop one throw ahead, then blasts it between throws. The city changes shape as you play.',
    },
    rival: 'thunder',
    points: 2,
    boss: false,
    throwBudget: 8,
    timeOfDay: 1,
    weather: { rain: true, fog: false },
  },
  {
    id: 'the-eye',
    chapter: 'jupiter',
    number: 15,
    city: 'The Eye',
    kit: 'jupiterStation',
    world: 'jupiter',
    twists: ['lightning', 'gusts', 'jetStream'],
    twist: {
      name: 'Eye of the storm',
      line: 'Everything at once: lightning, gusts and a jet stream roaring overhead.',
    },
    rival: 'colossus',
    points: 3,
    boss: true,
    throwBudget: 15,
    timeOfDay: 1.4,
    weather: { rain: true, fog: true },
  },
];

export function stageById(id: string): Stage | undefined {
  return STAGES.find((stage) => stage.id === id);
}

export function chapterOf(stage: Stage): Chapter {
  return CHAPTERS.find((chapter) => chapter.id === stage.chapter) as Chapter;
}

export function stagesIn(chapter: ChapterId): Stage[] {
  return STAGES.filter((stage) => stage.chapter === chapter);
}
