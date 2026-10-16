import type { Side } from '../engine/map';
import type { CpuLevel } from '../engine/world';
import type { ThemeId } from '../themes';
import { mixHex, type Livery, type Palette, type WingMotif } from './palette';

/** Which paint job a seat's plane wears; the theme turns it into colours. */
export type PlaneLook = 'player' | 'wingman' | 'opponent' | CpuLevel | 'ace';

/**
 * The cosmetics a player can choose in the hangar: paint, scarf, a motif on
 * the upper wing and a contrail. Each is only a colour; none changes how
 * the plane flies or how big it is.
 */
export interface PaintJob {
  paint: PaintId;
  scarf: ScarfId;
  motif: WingMotif;
  contrail: ContrailId;
}

export type PaintId =
  | 'standard'
  | 'racing-green'
  | 'sky-blue'
  | 'crimson'
  | 'midnight'
  | 'sunflower'
  | 'silver'
  | 'sea-grey';
export type ScarfId = 'standard' | 'crimson' | 'sky' | 'gold' | 'emerald' | 'violet' | 'navy';
export type ContrailId = 'none' | 'white' | 'crimson' | 'sky' | 'gold' | 'rainbow';

export const STANDARD_PAINT_JOB: PaintJob = {
  paint: 'standard',
  scarf: 'standard',
  motif: 'none',
  contrail: 'none',
};

/** Fabric and its shade for each paint; "standard" keeps the theme's own. */
export const PAINTS: Readonly<Record<PaintId, readonly [string, string] | null>> = {
  standard: null,
  'racing-green': ['#2f5a3a', '#1f3e28'],
  'sky-blue': ['#6aa8d8', '#4a7eaa'],
  crimson: ['#a8242e', '#741820'],
  midnight: ['#2c3048', '#1b1e30'],
  sunflower: ['#e2b232', '#a8821e'],
  silver: ['#b8bcc2', '#868a92'],
  'sea-grey': ['#7f8b92', '#59646b'],
};

export const SCARVES: Readonly<Record<ScarfId, string | null>> = {
  standard: null,
  crimson: '#c8282e',
  sky: '#7ac0ec',
  gold: '#f2c23c',
  emerald: '#2fa868',
  violet: '#8a52c8',
  navy: '#24365f',
};

/** Contrail colours; "rainbow" is painted a colour per puff. */
export const CONTRAILS: Readonly<Record<ContrailId, string | null>> = {
  none: null,
  white: '#ffffff',
  crimson: '#e0484c',
  sky: '#8acff4',
  gold: '#ffd25a',
  rainbow: 'rainbow',
};

type LookOverride = Partial<Livery>;

/** Each computer pilot's plane in each theme, from the Dogfight roster and the ace. */
const RIVAL_LOOKS: Readonly<Record<ThemeId, Readonly<Record<CpuLevel | 'ace', LookOverride>>>> = {
  'great-war': {
    easy: { fabric: '#c9c2a0', fabricShade: '#a49c7a', linen: '#ece6cc' },
    normal: {},
    hard: {
      fabric: '#d8d4c8',
      fabricShade: '#a8a498',
      wingMotif: 'checks',
      motifColour: '#1c1a1e',
    },
    brutal: {
      fabric: '#8e9094',
      fabricShade: '#5e6064',
      cowling: '#c8412f',
      cowlingShine: '#f08a6a',
    },
    ace: {
      fabric: '#b8282e',
      fabricShade: '#7e1a20',
      linen: '#d8a8a0',
      cowling: '#b8282e',
      cowlingShine: '#ec8a7a',
      rudder: ['#b8282e'],
    },
  },
  'cyan-magenta': {
    easy: { fabric: '#f29ac8', fabricShade: '#c46a9a' },
    normal: {},
    hard: {
      fabric: '#9a6ac2',
      fabricShade: '#6a4690',
      wingMotif: 'checks',
      motifColour: '#ffffff',
    },
    brutal: {
      fabric: '#e0287a',
      fabricShade: '#9a1450',
      wingMotif: 'sunburst',
      motifColour: '#ffd23c',
    },
    ace: {
      fabric: '#7a1a5a',
      fabricShade: '#4a0e36',
      wingMotif: 'stripes',
      motifColour: '#ff4fb8',
      cowling: '#ff4fb8',
    },
  },
  airshow: {
    easy: { fabric: '#f2c230', fabricShade: '#c09420', wingMotif: 'none' },
    normal: {},
    hard: { fabric: '#9a1f3a', fabricShade: '#6a1428', wingMotif: 'chevrons' },
    brutal: {
      fabric: '#2a2a36',
      fabricShade: '#16161e',
      wingMotif: 'sunburst',
      motifColour: '#ffd23c',
    },
    ace: {
      fabric: '#7a2ad8',
      fabricShade: '#4e1a8e',
      wingMotif: 'stripes',
      motifColour: '#ffd23c',
      cowling: '#ffd23c',
      cowlingShine: '#fff4b8',
      scarf: '#ffd23c',
    },
  },
};

/** The second player in Co-op flies the same colours with a difference. */
const WINGMAN_LOOKS: Readonly<Record<ThemeId, LookOverride>> = {
  'great-war': { fabric: '#7e6c46', fabricShade: '#57492e', scarf: '#c8412f' },
  'cyan-magenta': { fabric: '#1f8fa6', fabricShade: '#145f70', scarf: '#ffd23c' },
  airshow: { fabric: '#2aa0c8', fabricShade: '#1a7090', scarf: '#ffffff', wingMotif: 'chevrons' },
};

/** Night takes the light out of any colour that the night palettes did not tune by hand. */
function nightly(look: LookOverride): LookOverride {
  const dim = (colour: string | undefined, toward: string, share: number) =>
    colour === undefined ? undefined : mixHex(colour, toward, share);
  const result: LookOverride = { ...look };
  if (look.fabric) result.fabric = dim(look.fabric, '#1c2240', 0.32);
  if (look.fabricShade) result.fabricShade = dim(look.fabricShade, '#14182e', 0.3);
  if (look.linen) result.linen = dim(look.linen, '#5a6070', 0.4);
  if (look.cowling) result.cowling = dim(look.cowling, '#30344a', 0.3);
  return result;
}

/** The livery a plane wears: its side's, dressed for its look, with the player's cosmetics. */
export function liveryFor(
  palette: Palette,
  side: Side,
  look: PlaneLook,
  paintJob: PaintJob = STANDARD_PAINT_JOB,
): Livery {
  const base = palette.liveries[side];
  let override: LookOverride = {};
  if (look === 'wingman') override = WINGMAN_LOOKS[palette.theme];
  else if (look !== 'player' && look !== 'opponent') override = RIVAL_LOOKS[palette.theme][look];
  if (look === 'player') override = cosmeticOverride(paintJob);
  if (palette.lighting === 'night') override = nightly(override);
  return { ...base, ...override };
}

function cosmeticOverride(job: PaintJob): LookOverride {
  const override: LookOverride = {};
  const paint = PAINTS[job.paint];
  if (paint) {
    override.fabric = paint[0];
    override.fabricShade = paint[1];
  }
  const scarf = SCARVES[job.scarf];
  if (scarf) override.scarf = scarf;
  if (job.motif !== 'none') {
    override.wingMotif = job.motif;
    override.motifColour =
      job.paint === 'silver' || job.paint === 'sunflower' ? '#2a2630' : '#f4efe2';
  }
  return override;
}
