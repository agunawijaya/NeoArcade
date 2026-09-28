import type { Store } from '@shared/storage';

/**
 * The garage: how the car looks and sounds, and what the second player's
 * donkey wears in Donkey vs Driver. Purely cosmetic. A few items are there
 * from the start; the rest are Arcade Pass rewards listed in pass.manifest.ts.
 */
export type GarageSlot = 'body' | 'paint' | 'horn' | 'trail' | 'hat';

export const GARAGE_SLOTS: readonly GarageSlot[] = ['body', 'paint', 'horn', 'trail', 'hat'];

export const SLOT_NAMES: Record<GarageSlot, string> = {
  body: 'Body',
  paint: 'Paint',
  horn: 'Horn',
  trail: 'Trail',
  hat: 'Donkey hat',
};

export interface BodyShape {
  /** Metres. */
  length: number;
  width: number;
  height: number;
  /** Where the cabin starts and ends, as fractions of the length from the back. */
  cabin: readonly [number, number];
  /** Cabin height above the body, metres. */
  cabinHeight: number;
  /** 0 boxy … 1 bubble. */
  round: number;
  /** An open bed behind the cabin. */
  bed: boolean;
  /** No roof. */
  open: boolean;
}

export interface Paint {
  body: string;
  shade: string;
  trim: string;
}

export type HornSound = 'beep' | 'toot' | 'bell' | 'air' | 'hee-haw';
export type TrailStyle = 'dust' | 'hearts' | 'notes' | 'sparkles' | 'rainbow';
export type HatStyle = 'straw' | 'cowboy' | 'party' | 'flower' | 'top' | 'crown';

interface ItemBase {
  id: string;
  name: string;
  /** Owned from the start, without the Pass. */
  starter?: boolean;
}

export type GarageItem =
  | (ItemBase & { slot: 'body'; shape: BodyShape })
  | (ItemBase & { slot: 'paint'; paint: Paint })
  | (ItemBase & { slot: 'horn'; horn: HornSound })
  | (ItemBase & { slot: 'trail'; trail: TrailStyle })
  | (ItemBase & { slot: 'hat'; hat: HatStyle });

const HATCHBACK: BodyShape = {
  length: 4,
  width: 1.8,
  height: 0.9,
  cabin: [0.08, 0.66],
  cabinHeight: 0.62,
  round: 0.45,
  bed: false,
  open: false,
};

export const GARAGE: readonly GarageItem[] = [
  { id: 'body-hatchback', slot: 'body', name: 'Hatchback', starter: true, shape: HATCHBACK },
  {
    id: 'body-beetle',
    slot: 'body',
    name: 'Bubble Beetle',
    shape: { ...HATCHBACK, length: 3.8, cabin: [0.22, 0.72], cabinHeight: 0.7, round: 1 },
  },
  {
    id: 'body-pickup',
    slot: 'body',
    name: 'Farm Pickup',
    shape: {
      ...HATCHBACK,
      length: 4.4,
      cabin: [0.48, 0.78],
      cabinHeight: 0.66,
      round: 0.2,
      bed: true,
    },
  },
  {
    id: 'body-camper',
    slot: 'body',
    name: 'Camper Van',
    shape: {
      ...HATCHBACK,
      length: 4.3,
      height: 1.1,
      cabin: [0.04, 0.9],
      cabinHeight: 0.9,
      round: 0.35,
    },
  },
  {
    id: 'body-roadster',
    slot: 'body',
    name: 'Roadster',
    shape: {
      ...HATCHBACK,
      length: 4.1,
      height: 0.7,
      cabin: [0.3, 0.55],
      cabinHeight: 0.34,
      round: 0.7,
      open: true,
    },
  },
  {
    id: 'paint-sunset',
    slot: 'paint',
    name: 'Sunset',
    starter: true,
    paint: { body: '#ff7a3d', shade: '#c9502a', trim: '#fff1d6' },
  },
  {
    id: 'paint-sky',
    slot: 'paint',
    name: 'Sky',
    starter: true,
    paint: { body: '#46a8e8', shade: '#2c76b3', trim: '#f2f8ff' },
  },
  {
    id: 'paint-mint',
    slot: 'paint',
    name: 'Mint',
    paint: { body: '#5cd6a6', shade: '#34a07a', trim: '#f4fff9' },
  },
  {
    id: 'paint-cherry',
    slot: 'paint',
    name: 'Cherry',
    paint: { body: '#e8364f', shade: '#a81f36', trim: '#fff0f2' },
  },
  {
    id: 'paint-lilac',
    slot: 'paint',
    name: 'Lilac',
    paint: { body: '#b48cf0', shade: '#7f5ec0', trim: '#fbf6ff' },
  },
  {
    id: 'paint-butter',
    slot: 'paint',
    name: 'Butter',
    paint: { body: '#ffd65c', shade: '#d6a52f', trim: '#fffbea' },
  },
  {
    id: 'paint-midnight',
    slot: 'paint',
    name: 'Midnight',
    paint: { body: '#2d3a6e', shade: '#1b2449', trim: '#ffd978' },
  },
  {
    id: 'paint-chrome',
    slot: 'paint',
    name: 'Chrome',
    paint: { body: '#d9dee6', shade: '#8f97a6', trim: '#ffffff' },
  },
  { id: 'horn-beep', slot: 'horn', name: 'Beep-beep', starter: true, horn: 'beep' },
  { id: 'horn-toot', slot: 'horn', name: 'Toot-toot', horn: 'toot' },
  { id: 'horn-bell', slot: 'horn', name: 'Bicycle bell', horn: 'bell' },
  { id: 'horn-air', slot: 'horn', name: 'Air horn', horn: 'air' },
  { id: 'horn-hee-haw', slot: 'horn', name: 'Hee-haw horn', horn: 'hee-haw' },
  { id: 'trail-dust', slot: 'trail', name: 'Dust', starter: true, trail: 'dust' },
  { id: 'trail-hearts', slot: 'trail', name: 'Hearts', trail: 'hearts' },
  { id: 'trail-notes', slot: 'trail', name: 'Music notes', trail: 'notes' },
  { id: 'trail-sparkles', slot: 'trail', name: 'Sparkles', trail: 'sparkles' },
  { id: 'trail-rainbow', slot: 'trail', name: 'Rainbow', trail: 'rainbow' },
  { id: 'hat-straw', slot: 'hat', name: 'Straw hat', starter: true, hat: 'straw' },
  { id: 'hat-cowboy', slot: 'hat', name: 'Cowboy hat', hat: 'cowboy' },
  { id: 'hat-party', slot: 'hat', name: 'Party hat', hat: 'party' },
  { id: 'hat-flower', slot: 'hat', name: 'Flower crown', hat: 'flower' },
  { id: 'hat-top', slot: 'hat', name: 'Top hat', hat: 'top' },
  { id: 'hat-crown', slot: 'hat', name: 'Golden crown', hat: 'crown' },
];

export type Loadout = Record<GarageSlot, string>;

export const STARTER_LOADOUT: Loadout = {
  body: 'body-hatchback',
  paint: 'paint-sunset',
  horn: 'horn-beep',
  trail: 'trail-dust',
  hat: 'hat-straw',
};

/** What the car and the rival donkey look like, resolved from a loadout. */
export interface Look {
  shape: BodyShape;
  paint: Paint;
  horn: HornSound;
  trail: TrailStyle;
  hat: HatStyle;
}

export function itemsFor(slot: GarageSlot): GarageItem[] {
  return GARAGE.filter((item) => item.slot === slot);
}

export function lookOf(loadout: Loadout): Look {
  const find = <S extends GarageSlot>(slot: S) =>
    (GARAGE.find((item) => item.slot === slot && item.id === loadout[slot]) ??
      GARAGE.find((item) => item.slot === slot && item.id === STARTER_LOADOUT[slot])) as Extract<
      GarageItem,
      { slot: S }
    >;
  return {
    shape: find('body').shape,
    paint: find('paint').paint,
    horn: find('horn').horn,
    trail: find('trail').trail,
    hat: find('hat').hat,
  };
}

/**
 * The saved loadout, keeping only items the player still owns: a restored
 * Pass backup from before a reward was earned sends the car back to its
 * starter parts instead of wearing something locked.
 */
export function loadLoadout(store: Store, owns: (itemId: string) => boolean): Loadout {
  const stored = store.get<Partial<Record<GarageSlot, unknown>>>('garage', {});
  const loadout = { ...STARTER_LOADOUT };
  for (const slot of GARAGE_SLOTS) {
    const id = stored[slot];
    const item = GARAGE.find((candidate) => candidate.id === id && candidate.slot === slot);
    if (item && (item.starter || owns(item.id))) loadout[slot] = item.id;
  }
  return loadout;
}

export function saveLoadout(store: Store, loadout: Loadout) {
  store.set('garage', loadout);
}
