import type { WorldId } from '../engine/worlds';
import type { KitId } from '../tour/stages';

/**
 * A city's look, as a kit of parts for the painters in city.ts and
 * backdrop.ts: which facades it builds with and how they are tinted, what
 * stands on its roofs, the shapes of its distant towers and what rises
 * behind them. Every city of the World Tour has one; Quick Match uses the
 * classic kit, the look the game has always had.
 *
 * Kits are evocative, never replicas: a tall lattice mast, not any real
 * tower; pyramids on a far horizon, not a map of Giza.
 */
export type FacadeStyle = 'brick' | 'panels' | 'glass' | 'deco';

export type Silhouette =
  'tower' | 'spire' | 'dome' | 'stepped' | 'needle' | 'minaret' | 'deco' | 'mast' | 'house';

export type RoofProp =
  | 'waterTower'
  | 'tank'
  | 'dish'
  | 'billboard'
  | 'helipad'
  | 'smallDome'
  | 'solar'
  | 'rod'
  | 'garden';

export type Horizon = 'none' | 'mountains' | 'pyramids' | 'dunes' | 'mesas' | 'craterRims';

export interface CityKit {
  id: KitId | 'classic';
  /** Hues the facades lean towards (their lightness is kept, so night stays night). */
  tints: readonly string[];
  tintAmount: number;
  styles: readonly FacadeStyle[];
  /** Chance a wide building carries a neon sign down its edge. */
  neon: number;
  /** Props that may stand on a wide roof, and how often one does. */
  props: readonly RoofProp[];
  propChance: number;
  /** How often a roof gets an antenna, a smoking chimney or a flag: the wind readers. */
  antennas: number;
  chimneys: number;
  flags: number;
  skyline: readonly Silhouette[];
  horizon: Horizon;
}

const EARTH_SKYLINE: readonly Silhouette[] = ['tower', 'tower', 'spire', 'stepped'];
const SPACE_SKYLINE: readonly Silhouette[] = ['tower', 'dome', 'dome', 'stepped'];

/** The look before the World Tour, still used by Quick Match. */
export function classicKit(world: WorldId): CityKit {
  return {
    id: 'classic',
    tints: [],
    tintAmount: 0,
    styles: ['brick', 'panels', 'glass', 'deco'],
    neon: 0.22,
    props: ['waterTower'],
    propChance: 0.3,
    antennas: 0.3,
    chimneys: 0.22,
    flags: 0.14,
    skyline: world === 'earth' || world === 'jupiter' ? EARTH_SKYLINE : SPACE_SKYLINE,
    horizon: 'none',
  };
}

export const KITS: Record<KitId, CityKit> = {
  // Rain-washed towers in greens and teals, water tanks and dishes on every roof.
  jakarta: {
    id: 'jakarta',
    tints: ['#2f8f7a', '#3d7fa0', '#5aa06a', '#c0784a'],
    tintAmount: 0.45,
    styles: ['panels', 'panels', 'brick', 'glass'],
    neon: 0.12,
    props: ['tank', 'tank', 'dish', 'garden'],
    propChance: 0.55,
    antennas: 0.45,
    chimneys: 0.1,
    flags: 0.18,
    skyline: ['tower', 'tower', 'mast', 'stepped'],
    horizon: 'none',
  },
  // Night, neon and glass; billboards on the roofs and masts on the horizon.
  tokyo: {
    id: 'tokyo',
    tints: ['#5a4ab0', '#3a5ac0', '#8a3aa0', '#2a6a9a'],
    tintAmount: 0.4,
    styles: ['glass', 'glass', 'panels', 'deco'],
    neon: 0.6,
    props: ['billboard', 'billboard', 'dish'],
    propChance: 0.6,
    antennas: 0.5,
    chimneys: 0.08,
    flags: 0.1,
    skyline: ['tower', 'mast', 'stepped', 'needle'],
    horizon: 'none',
  },
  // Sand-gold glass and dunes; helipads on the tall ones.
  dubai: {
    id: 'dubai',
    tints: ['#c8a060', '#b08a60', '#8aa0b8', '#d0b070'],
    tintAmount: 0.5,
    styles: ['glass', 'glass', 'panels', 'deco'],
    neon: 0.1,
    props: ['helipad', 'helipad', 'dish'],
    propChance: 0.45,
    antennas: 0.2,
    chimneys: 0.05,
    flags: 0.2,
    skyline: ['needle', 'needle', 'tower', 'stepped'],
    horizon: 'dunes',
  },
  // Sandstone, little domes and dishes, and lots of flags and smoke to read the hidden wind by.
  cairo: {
    id: 'cairo',
    tints: ['#c09060', '#b07a50', '#d0a870', '#a08060'],
    tintAmount: 0.55,
    styles: ['brick', 'brick', 'deco', 'panels'],
    neon: 0.05,
    props: ['smallDome', 'dish', 'dish', 'tank'],
    propChance: 0.5,
    antennas: 0.25,
    chimneys: 0.4,
    flags: 0.45,
    skyline: ['minaret', 'dome', 'tower', 'stepped'],
    horizon: 'pyramids',
  },
  // Bright houses stacked up the hillside, gardens on the roofs, peaks behind.
  rio: {
    id: 'rio',
    tints: ['#e0a040', '#e0607a', '#40b0a0', '#f07a40', '#7a8ae0', '#e0c040'],
    tintAmount: 0.6,
    styles: ['brick', 'panels', 'brick', 'deco'],
    neon: 0.06,
    props: ['garden', 'tank', 'tank'],
    propChance: 0.5,
    antennas: 0.3,
    chimneys: 0.15,
    flags: 0.2,
    skyline: ['house', 'house', 'tower', 'stepped'],
    horizon: 'mountains',
  },
  // Brick and deco in the fog; water towers, of course.
  newYork: {
    id: 'newYork',
    tints: ['#a05a48', '#7a6a60', '#5a6a80', '#8a5a50'],
    tintAmount: 0.45,
    styles: ['brick', 'brick', 'deco', 'panels'],
    neon: 0.18,
    props: ['waterTower', 'waterTower', 'tank'],
    propChance: 0.55,
    antennas: 0.35,
    chimneys: 0.3,
    flags: 0.15,
    skyline: ['deco', 'deco', 'spire', 'tower'],
    horizon: 'none',
  },
  moonBase: {
    id: 'moonBase',
    tints: ['#8a9ab0', '#a0a0b0', '#7a8aa0'],
    tintAmount: 0.3,
    styles: ['panels', 'panels', 'glass'],
    neon: 0.2,
    props: ['smallDome', 'solar', 'dish'],
    propChance: 0.65,
    antennas: 0.4,
    chimneys: 0,
    flags: 0,
    skyline: ['dome', 'dome', 'mast', 'stepped'],
    horizon: 'craterRims',
  },
  marsColony: {
    id: 'marsColony',
    tints: ['#b05a3a', '#a06a4a', '#c07a50'],
    tintAmount: 0.35,
    styles: ['panels', 'brick', 'panels', 'deco'],
    neon: 0.12,
    props: ['smallDome', 'solar', 'solar', 'dish'],
    propChance: 0.6,
    antennas: 0.35,
    chimneys: 0.25,
    flags: 0.25,
    skyline: ['dome', 'tower', 'stepped', 'mast'],
    horizon: 'mesas',
  },
  // Dark metal towers with lightning rods, for the planet of storms.
  jupiterStation: {
    id: 'jupiterStation',
    tints: ['#6a4a70', '#5a5a80', '#7a4a50'],
    tintAmount: 0.35,
    styles: ['panels', 'glass', 'deco', 'panels'],
    neon: 0.3,
    props: ['rod', 'rod', 'dish', 'solar'],
    propChance: 0.6,
    antennas: 0.3,
    chimneys: 0.2,
    flags: 0.2,
    skyline: ['spire', 'needle', 'tower', 'mast'],
    horizon: 'none',
  },
};
