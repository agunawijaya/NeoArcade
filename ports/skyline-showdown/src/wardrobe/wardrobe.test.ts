import { describe, expect, it } from 'vitest';
import manifest from '../../pass.manifest';
import { MAX_STARS } from '../tour/progress';
import { RIVAL_IDS } from '../tour/rivals';
import {
  DEFAULT_OUTFITS,
  itemById,
  itemsFor,
  sanitiseOutfit,
  SLOTS,
  WARDROBE,
  type WardrobeItem,
} from './items';
import { isItemUnlocked, wearableOutfit, type UnlockContext } from './unlocks';

const nothingYet: UnlockContext = { stars: 0, rivalsBeaten: [], passUnlocked: () => false };

describe('the wardrobe', () => {
  it('has 40 to 60 items with unique ids, and something free in every slot', () => {
    expect(WARDROBE.length).toBeGreaterThanOrEqual(40);
    expect(WARDROBE.length).toBeLessThanOrEqual(60);
    expect(new Set(WARDROBE.map((item) => item.id)).size).toBe(WARDROBE.length);
    for (const slot of SLOTS) {
      expect(
        itemsFor(slot).some((item) => isItemUnlocked(item, nothingYet)),
        slot,
      ).toBe(true);
    }
  });

  it('dresses both players in free items by default', () => {
    for (const outfit of DEFAULT_OUTFITS) {
      for (const slot of SLOTS) {
        const item = itemById(outfit[slot]) as WardrobeItem;
        expect(item.slot).toBe(slot);
        expect(isItemUnlocked(item, nothingYet)).toBe(true);
      }
    }
  });

  it('only asks for stars and rivals the tour has', () => {
    for (const item of WARDROBE) {
      if ('stars' in item.unlock) expect(item.unlock.stars).toBeLessThanOrEqual(MAX_STARS);
      if ('rival' in item.unlock) expect(RIVAL_IDS).toContain(item.unlock.rival);
      if (item.slot === 'fur') expect(item.colour).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('lists exactly its badge and level items in the Pass manifest, with the same unlocks', () => {
    const fromPass = WARDROBE.filter((item) => 'badge' in item.unlock || 'level' in item.unlock);
    expect(manifest.cosmetics.map((cosmetic) => cosmetic.id).sort()).toEqual(
      fromPass.map((item) => item.id).sort(),
    );
    for (const cosmetic of manifest.cosmetics) {
      const item = itemById(cosmetic.id) as WardrobeItem;
      expect(cosmetic.name).toBe(item.name);
      expect(cosmetic.unlock).toEqual(item.unlock);
    }
  });

  it('unlocks by stars, rivals and the Pass', () => {
    const topHat = itemById('hat-top') as WardrobeItem;
    const helmet = itemById('hat-helmet') as WardrobeItem;
    const crown = itemById('hat-crown') as WardrobeItem;
    expect(isItemUnlocked(topHat, { ...nothingYet, stars: 12 })).toBe(true);
    expect(isItemUnlocked(topHat, { ...nothingYet, stars: 11 })).toBe(false);
    expect(isItemUnlocked(helmet, { ...nothingYet, rivalsBeaten: ['orbit'] })).toBe(true);
    expect(isItemUnlocked(crown, { ...nothingYet, passUnlocked: (id) => id === 'hat-crown' })).toBe(
      true,
    );
  });

  it('takes off anything no longer unlocked', () => {
    const fancy = { ...DEFAULT_OUTFITS[0], headwear: 'hat-crown', eyewear: 'eyes-shades' };
    expect(wearableOutfit(fancy, DEFAULT_OUTFITS[0], nothingYet)).toEqual({
      ...DEFAULT_OUTFITS[0],
      eyewear: 'eyes-shades',
    });
  });

  it('repairs a stored outfit slot by slot', () => {
    expect(sanitiseOutfit({ headwear: 'hat-cap', eyewear: 'hat-cap' }, DEFAULT_OUTFITS[1])).toEqual(
      {
        ...DEFAULT_OUTFITS[1],
        headwear: 'hat-cap',
      },
    );
  });
});
