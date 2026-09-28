/**
 * Everything a gorilla can wear: 60 items over eight slots. Cosmetics
 * only: none of them changes a hitbox, the physics, or what a player can
 * read on screen (the Golden Banana power-up keeps its own gold look
 * whatever banana skin is worn).
 *
 * Items unlock in four ways: they are free, they come with World Tour
 * stars, with an Arcade Pass badge, or at an Arcade Pass level. A few come
 * from beating a rival. The badge and level ones are also listed in the
 * Pass manifest, so the Hall can tell players what a badge unlocks.
 */
export type Slot =
  'fur' | 'headwear' | 'eyewear' | 'neckwear' | 'banana' | 'trail' | 'explosion' | 'dance';

export const SLOTS: readonly Slot[] = [
  'fur',
  'headwear',
  'eyewear',
  'neckwear',
  'banana',
  'trail',
  'explosion',
  'dance',
];

export const SLOT_NAMES: Record<Slot, string> = {
  fur: 'Fur',
  headwear: 'Headwear',
  eyewear: 'Eyewear',
  neckwear: 'Bandana & scarf',
  banana: 'Banana skin',
  trail: 'Trail',
  explosion: 'Explosion',
  dance: 'Victory dance',
};

export type Unlock =
  { free: true } | { stars: number } | { badge: string } | { level: number } | { rival: string };

export interface WardrobeItem {
  id: string;
  slot: Slot;
  name: string;
  unlock: Unlock;
  /** Fur colour for the fur slot. */
  colour?: string;
}

const free = { free: true } as const;
const stars = (count: number) => ({ stars: count });
const badge = (id: string) => ({ badge: id });
const level = (value: number) => ({ level: value });
const rival = (id: string) => ({ rival: id });

export const WARDROBE: readonly WardrobeItem[] = [
  { id: 'fur-bronze', slot: 'fur', name: 'Bronze', unlock: free, colour: '#6e4a3a' },
  { id: 'fur-slate', slot: 'fur', name: 'Slate', unlock: free, colour: '#56627e' },
  { id: 'fur-charcoal', slot: 'fur', name: 'Charcoal', unlock: free, colour: '#3c3844' },
  { id: 'fur-cocoa', slot: 'fur', name: 'Cocoa', unlock: free, colour: '#5c3b2c' },
  { id: 'fur-ginger', slot: 'fur', name: 'Ginger', unlock: stars(3), colour: '#a8663a' },
  { id: 'fur-rose', slot: 'fur', name: 'Rose', unlock: level(5), colour: '#a96482' },
  { id: 'fur-silverback', slot: 'fur', name: 'Silverback', unlock: stars(9), colour: '#858b95' },
  { id: 'fur-midnight', slot: 'fur', name: 'Midnight', unlock: stars(16), colour: '#2c3160' },
  { id: 'fur-snow', slot: 'fur', name: 'Snow', unlock: stars(25), colour: '#d6dbe6' },
  {
    id: 'fur-gilded',
    slot: 'fur',
    name: 'Gilded',
    unlock: badge('globetrotter'),
    colour: '#b98f35',
  },

  { id: 'hat-none', slot: 'headwear', name: 'Nothing', unlock: free },
  { id: 'hat-cap', slot: 'headwear', name: 'Cap', unlock: free },
  { id: 'hat-headphones', slot: 'headwear', name: 'Headphones', unlock: level(3) },
  { id: 'hat-beanie', slot: 'headwear', name: 'Beanie', unlock: stars(4) },
  { id: 'hat-party', slot: 'headwear', name: 'Party hat', unlock: badge('first-banana') },
  { id: 'hat-propeller', slot: 'headwear', name: 'Propeller cap', unlock: level(10) },
  { id: 'hat-top', slot: 'headwear', name: 'Top hat', unlock: stars(12) },
  { id: 'hat-helmet', slot: 'headwear', name: 'Space helmet', unlock: rival('orbit') },
  { id: 'hat-crown', slot: 'headwear', name: 'Crown', unlock: badge('rival-collector') },
  { id: 'hat-halo', slot: 'headwear', name: 'Storm halo', unlock: badge('eye-of-the-storm') },

  { id: 'eyes-none', slot: 'eyewear', name: 'Nothing', unlock: free },
  { id: 'eyes-shades', slot: 'eyewear', name: 'Shades', unlock: free },
  { id: 'eyes-aviators', slot: 'eyewear', name: 'Aviators', unlock: stars(6) },
  { id: 'eyes-3d', slot: 'eyewear', name: '3D glasses', unlock: level(7) },
  { id: 'eyes-goggles', slot: 'eyewear', name: 'Dust goggles', unlock: rival('rust') },
  { id: 'eyes-monocle', slot: 'eyewear', name: 'Monocle', unlock: stars(19) },
  { id: 'eyes-visor', slot: 'eyewear', name: 'Neon visor', unlock: badge('drone-whisperer') },

  { id: 'neck-bandana', slot: 'neckwear', name: 'Head bandana', unlock: free },
  { id: 'neck-none', slot: 'neckwear', name: 'Nothing', unlock: free },
  { id: 'neck-scarf', slot: 'neckwear', name: 'Scarf', unlock: stars(2) },
  { id: 'neck-bow', slot: 'neckwear', name: 'Bow tie', unlock: stars(10) },
  { id: 'neck-cape', slot: 'neckwear', name: 'Cape', unlock: level(18) },
  { id: 'neck-medal', slot: 'neckwear', name: 'Gold medal', unlock: badge('three-star-general') },

  { id: 'banana-classic', slot: 'banana', name: 'Classic', unlock: free },
  { id: 'banana-green', slot: 'banana', name: 'Not quite ripe', unlock: free },
  { id: 'banana-ripe', slot: 'banana', name: 'Extra ripe', unlock: stars(1) },
  { id: 'banana-pixel', slot: 'banana', name: 'Pixel', unlock: level(8) },
  { id: 'banana-fire', slot: 'banana', name: 'Fire', unlock: badge('sunburn') },
  { id: 'banana-candy', slot: 'banana', name: 'Candy stripe', unlock: level(15) },
  { id: 'banana-glow', slot: 'banana', name: 'Glow-stick', unlock: stars(20) },
  { id: 'banana-chrome', slot: 'banana', name: 'Chrome', unlock: badge('demolition') },

  { id: 'trail-classic', slot: 'trail', name: 'Classic streak', unlock: free },
  { id: 'trail-hearts', slot: 'trail', name: 'Hearts', unlock: level(4) },
  { id: 'trail-sparkle', slot: 'trail', name: 'Sparkle', unlock: stars(5) },
  { id: 'trail-neon', slot: 'trail', name: 'Neon', unlock: level(12) },
  { id: 'trail-smoke', slot: 'trail', name: 'Smoke', unlock: stars(14) },
  { id: 'trail-rainbow', slot: 'trail', name: 'Rainbow', unlock: badge('moonshot') },
  { id: 'trail-bubbles', slot: 'trail', name: 'Bubbles', unlock: stars(28) },

  { id: 'boom-classic', slot: 'explosion', name: 'Classic', unlock: free },
  { id: 'boom-pixel', slot: 'explosion', name: 'Pixel burst', unlock: level(6) },
  { id: 'boom-confetti', slot: 'explosion', name: 'Confetti', unlock: stars(8) },
  { id: 'boom-fireworks', slot: 'explosion', name: 'Fireworks', unlock: stars(17) },
  { id: 'boom-stars', slot: 'explosion', name: 'Starburst', unlock: level(20) },
  { id: 'boom-paint', slot: 'explosion', name: 'Paint splat', unlock: stars(32) },

  { id: 'dance-classic', slot: 'dance', name: 'Classic', unlock: free },
  { id: 'dance-jump', slot: 'dance', name: 'Jump for joy', unlock: level(2) },
  { id: 'dance-robot', slot: 'dance', name: 'Robot', unlock: stars(7) },
  { id: 'dance-spin', slot: 'dance', name: 'Spin', unlock: level(9) },
  { id: 'dance-flex', slot: 'dance', name: 'Flex', unlock: badge('landlord-evicted') },
  { id: 'dance-thump', slot: 'dance', name: 'Chest thump', unlock: stars(22) },
];

export type Outfit = Record<Slot, string>;

export const DEFAULT_OUTFITS: readonly [Outfit, Outfit] = [
  {
    fur: 'fur-bronze',
    headwear: 'hat-none',
    eyewear: 'eyes-none',
    neckwear: 'neck-bandana',
    banana: 'banana-classic',
    trail: 'trail-classic',
    explosion: 'boom-classic',
    dance: 'dance-classic',
  },
  {
    fur: 'fur-slate',
    headwear: 'hat-none',
    eyewear: 'eyes-none',
    neckwear: 'neck-bandana',
    banana: 'banana-classic',
    trail: 'trail-classic',
    explosion: 'boom-classic',
    dance: 'dance-classic',
  },
];

export function itemById(id: string): WardrobeItem | undefined {
  return WARDROBE.find((item) => item.id === id);
}

export function itemsFor(slot: Slot): WardrobeItem[] {
  return WARDROBE.filter((item) => item.slot === slot);
}

/** The fur colour of an outfit. */
export function furColour(outfit: Outfit): string {
  return itemById(outfit.fur)?.colour ?? '#6e4a3a';
}

/** Keeps only items that exist in the right slot; anything else falls back to the default. */
export function sanitiseOutfit(value: unknown, fallback: Outfit): Outfit {
  const stored =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const outfit = { ...fallback };
  for (const slot of SLOTS) {
    const id = stored[slot];
    if (typeof id === 'string' && itemById(id)?.slot === slot) outfit[slot] = id;
  }
  return outfit;
}

/** What unlocks an item, in a player's words. */
export function unlockText(
  unlock: Unlock,
  badgeName: (id: string) => string,
  rivalName: (id: string) => string,
): string {
  if ('free' in unlock) return 'Free';
  if ('stars' in unlock)
    return `Collect ${unlock.stars} World Tour star${unlock.stars === 1 ? '' : 's'}`;
  if ('badge' in unlock) return `Earn the “${badgeName(unlock.badge)}” badge`;
  if ('level' in unlock) return `Reach Arcade Pass level ${unlock.level}`;
  return `Beat ${rivalName(unlock.rival)} on the World Tour`;
}
