import { WARDROBE, type Outfit, type Slot, type WardrobeItem } from './items';

/**
 * Whether an item can be worn. Stars and rivals come from the game's own
 * save; badges and levels are the Arcade Pass's call, through the manifest.
 */
export interface UnlockContext {
  stars: number;
  rivalsBeaten: readonly string[];
  /** The Pass's answer for a badge- or level-unlocked item. */
  passUnlocked(id: string): boolean;
}

export function isItemUnlocked(item: WardrobeItem, context: UnlockContext): boolean {
  const { unlock } = item;
  if ('free' in unlock) return true;
  if ('stars' in unlock) return context.stars >= unlock.stars;
  if ('rival' in unlock) return context.rivalsBeaten.includes(unlock.rival);
  return context.passUnlocked(item.id);
}

/** Swaps anything no longer unlocked (say, after a Pass reset) for that slot's free default. */
export function wearableOutfit(outfit: Outfit, fallback: Outfit, context: UnlockContext): Outfit {
  const wearable = { ...outfit };
  for (const slot of Object.keys(outfit) as Slot[]) {
    const item = WARDROBE.find((candidate) => candidate.id === outfit[slot]);
    if (!item || !isItemUnlocked(item, context)) wearable[slot] = fallback[slot];
  }
  return wearable;
}
