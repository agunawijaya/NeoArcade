/**
 * Arcade-wide cosmetics: the parts of the player's avatar, the frame around
 * their name plate and the Hall's accent theme. Each has the arcade level
 * that unlocks it. Most levels up to 30 unlock something, and the rank-up
 * levels (5, 10, 15, 20, 30) unlock a little more. Human skin tones are never
 * locked.
 */
interface Option {
  id: string;
  name: string;
  level: number;
}

export const FACES = [
  { id: 'round', name: 'Round', level: 1 },
  { id: 'boxy', name: 'Boxy', level: 1 },
  { id: 'tall', name: 'Tall', level: 5 },
  { id: 'robot', name: 'Robot', level: 10 },
  { id: 'ghost', name: 'Ghost', level: 20 },
] as const satisfies readonly Option[];

export const SKINS = [
  { id: 'porcelain', name: 'Porcelain', level: 1, colour: '#f7dcc6' },
  { id: 'peach', name: 'Peach', level: 1, colour: '#efbd94' },
  { id: 'honey', name: 'Honey', level: 1, colour: '#d59a62' },
  { id: 'bronze', name: 'Bronze', level: 1, colour: '#a86a3d' },
  { id: 'umber', name: 'Umber', level: 1, colour: '#7a4a2c' },
  { id: 'ebony', name: 'Ebony', level: 1, colour: '#4f2e1e' },
  { id: 'mint', name: 'Mint', level: 11, colour: '#8fe8c4' },
  { id: 'lilac', name: 'Lilac', level: 18, colour: '#c3a5ff' },
  { id: 'chrome', name: 'Chrome', level: 26, colour: '#cdd5e4' },
  { id: 'gold', name: 'Gold', level: 29, colour: '#f9c74f' },
] as const satisfies readonly (Option & { colour: string })[];

export const BACKDROPS = [
  { id: 'midnight', name: 'Midnight', level: 1, colours: ['#2d2466', '#140f33'] },
  { id: 'dusk', name: 'Dusk', level: 1, colours: ['#ff8a5c', '#6b2f7d'] },
  { id: 'lagoon', name: 'Lagoon', level: 1, colours: ['#27c2b4', '#0d4a6b'] },
  { id: 'grid', name: 'Synth grid', level: 7, colours: ['#3a1464', '#0c0620'] },
  { id: 'starfield', name: 'Starfield', level: 16, colours: ['#1b2450', '#05060f'] },
  { id: 'sunburst', name: 'Sunburst', level: 27, colours: ['#ffcf5c', '#ff5e8a'] },
] as const satisfies readonly (Option & { colours: readonly [string, string] })[];

export const EYES = [
  { id: 'dots', name: 'Dots', level: 1 },
  { id: 'happy', name: 'Happy', level: 1 },
  { id: 'wink', name: 'Wink', level: 4 },
  { id: 'visor', name: 'Visor', level: 10 },
  { id: 'stars', name: 'Star-struck', level: 15 },
  { id: 'hearts', name: 'Hearts', level: 24 },
] as const satisfies readonly Option[];

export const MOUTHS = [
  { id: 'smile', name: 'Smile', level: 1 },
  { id: 'grin', name: 'Grin', level: 1 },
  { id: 'flat', name: 'Unimpressed', level: 1 },
  { id: 'surprised', name: 'Surprised', level: 1 },
  { id: 'tongue', name: 'Cheeky', level: 9 },
  { id: 'fangs', name: 'Fangs', level: 21 },
] as const satisfies readonly Option[];

export const HEADWEAR = [
  { id: 'none', name: 'None', level: 1 },
  { id: 'cap', name: 'Cap', level: 1 },
  { id: 'headphones', name: 'Headphones', level: 2 },
  { id: 'beanie', name: 'Beanie', level: 8 },
  { id: 'antennae', name: 'Antennae', level: 14 },
  { id: 'propeller', name: 'Propeller cap', level: 19 },
  { id: 'crown', name: 'Crown', level: 25 },
  { id: 'halo', name: 'Halo', level: 30 },
] as const satisfies readonly Option[];

export const ACCESSORIES = [
  { id: 'none', name: 'None', level: 1 },
  { id: 'blush', name: 'Blush', level: 1 },
  { id: 'glasses', name: 'Glasses', level: 6 },
  { id: 'headband', name: 'Headband', level: 12 },
  { id: 'shades', name: 'Shades', level: 17 },
  { id: 'moustache', name: 'Moustache', level: 22 },
  { id: 'bow-tie', name: 'Bow tie', level: 28 },
] as const satisfies readonly Option[];

export const FRAMES = [
  { id: 'plain', name: 'Plain', level: 1 },
  { id: 'neon', name: 'Neon tube', level: 3 },
  { id: 'chrome', name: 'Chrome', level: 10 },
  { id: 'pixel', name: 'Pixel', level: 15 },
  { id: 'gold', name: 'Gold leaf', level: 20 },
  { id: 'legend', name: 'Legend', level: 30 },
] as const satisfies readonly Option[];

/** The Hall's two neon colours, for its dark and its light theme. */
export const HALL_THEMES = [
  {
    id: 'neon-night',
    name: 'Neon Night',
    level: 1,
    dark: ['#ff3fa4', '#3ff3ff'],
    light: ['#d4157c', '#0a8fa8'],
  },
  {
    id: 'sunset-strip',
    name: 'Sunset Strip',
    level: 5,
    dark: ['#ff6b3d', '#ffc857'],
    light: ['#d2461a', '#b77800'],
  },
  {
    id: 'toxic-glow',
    name: 'Toxic Glow',
    level: 13,
    dark: ['#b4ff39', '#a46bff'],
    light: ['#4f8f00', '#7342d6'],
  },
  {
    id: 'gold-rush',
    name: 'Gold Rush',
    level: 20,
    dark: ['#ffd23f', '#ff8f3f'],
    light: ['#a87600', '#c0530f'],
  },
  {
    id: 'ice-palace',
    name: 'Ice Palace',
    level: 23,
    dark: ['#7fd8ff', '#e0f4ff'],
    light: ['#0b7ab8', '#4a6fa5'],
  },
  {
    id: 'hyperspace',
    name: 'Hyperspace',
    level: 30,
    dark: ['#ff5ec4', '#5effd8'],
    light: ['#c2188e', '#0a9a7c'],
  },
] as const satisfies readonly (Option & {
  dark: readonly [string, string];
  light: readonly [string, string];
})[];

export type FaceId = (typeof FACES)[number]['id'];
export type SkinId = (typeof SKINS)[number]['id'];
export type BackdropId = (typeof BACKDROPS)[number]['id'];
export type EyesId = (typeof EYES)[number]['id'];
export type MouthId = (typeof MOUTHS)[number]['id'];
export type HeadwearId = (typeof HEADWEAR)[number]['id'];
export type AccessoryId = (typeof ACCESSORIES)[number]['id'];
export type FrameId = (typeof FRAMES)[number]['id'];
export type HallThemeId = (typeof HALL_THEMES)[number]['id'];

export interface AvatarLook {
  face: FaceId;
  skin: SkinId;
  backdrop: BackdropId;
  eyes: EyesId;
  mouth: MouthId;
  headwear: HeadwearId;
  accessory: AccessoryId;
}

/** Everything the player wears across the arcade. */
export interface PlayerLook extends AvatarLook {
  frame: FrameId;
  hallTheme: HallThemeId;
}

export type LookSlot = keyof PlayerLook;

export const LOOK_OPTIONS: { readonly [Slot in LookSlot]: readonly Option[] } = {
  face: FACES,
  skin: SKINS,
  backdrop: BACKDROPS,
  eyes: EYES,
  mouth: MOUTHS,
  headwear: HEADWEAR,
  accessory: ACCESSORIES,
  frame: FRAMES,
  hallTheme: HALL_THEMES,
};

/** What a slot is called where players pick it. */
export const LOOK_SLOT_NAMES: Record<LookSlot, string> = {
  face: 'Face',
  skin: 'Colour',
  backdrop: 'Backdrop',
  eyes: 'Eyes',
  mouth: 'Mouth',
  headwear: 'Headwear',
  accessory: 'Extras',
  frame: 'Name plate',
  hallTheme: 'Hall theme',
};

export const DEFAULT_LOOK: PlayerLook = {
  face: 'round',
  skin: 'peach',
  backdrop: 'midnight',
  eyes: 'dots',
  mouth: 'smile',
  headwear: 'none',
  accessory: 'none',
  frame: 'plain',
  hallTheme: 'neon-night',
};

export interface ArcadeUnlock {
  slot: LookSlot;
  id: string;
  name: string;
  level: number;
}

export const ARCADE_UNLOCKS: readonly ArcadeUnlock[] = (
  Object.entries(LOOK_OPTIONS) as [LookSlot, readonly Option[]][]
).flatMap(([slot, options]) => options.map((option) => ({ slot, ...option })));

/** Cosmetics a player gains by going from one level to a higher one. */
export function arcadeUnlocksBetween(fromLevel: number, toLevel: number): ArcadeUnlock[] {
  return ARCADE_UNLOCKS.filter((unlock) => unlock.level > fromLevel && unlock.level <= toLevel);
}

export function lookOption(slot: LookSlot, id: string): Option | undefined {
  return LOOK_OPTIONS[slot].find((option) => option.id === id);
}

export function isLookUnlocked(slot: LookSlot, id: string, level: number): boolean {
  const option = lookOption(slot, id);
  return option !== undefined && option.level <= level;
}
