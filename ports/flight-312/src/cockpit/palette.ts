/**
 * The flight deck's colours under day, dusk and night lighting. The panels
 * of the classic jumbo are a mid grey, the glareshield black, the faces
 * black with white markings. At night the floodlights go down to a warm
 * glow and the instruments' integral lighting takes over, so the white
 * markings turn a soft lit cream and everything else falls into shadow.
 */
export type Lighting = 'day' | 'dusk' | 'night';

export interface Palette {
  panel: string;
  panelShade: string;
  panelEdge: string;
  glareshield: string;
  face: string;
  marking: string;
  dim: string;
  rim: string;
  needle: string;
  bug: string;
  warning: string;
  caution: string;
  advisory: string;
  green: string;
  screen: string;
  frame: string;
  /** Light falling across the panel: a gradient overlay. */
  flood: string;
}

export const PALETTES: Record<Lighting, Palette> = {
  day: {
    panel: '#666b70',
    panelShade: '#585c61',
    panelEdge: '#7b8085',
    glareshield: '#1b1c1e',
    face: '#0d0e0f',
    marking: '#f1f1ec',
    dim: '#a9aaa6',
    rim: '#3d4044',
    needle: '#f5f5f0',
    bug: '#f3f0e6',
    warning: '#ff3b2f',
    caution: '#ffb52e',
    advisory: '#7fd1ff',
    green: '#3be36a',
    screen: '#1a2e1f',
    frame: '#2c2e31',
    flood: 'rgba(255, 250, 240, 0.05)',
  },
  dusk: {
    panel: '#474b50',
    panelShade: '#3c4044',
    panelEdge: '#575b60',
    glareshield: '#141516',
    face: '#0a0b0c',
    marking: '#ece8da',
    dim: '#8e8c84',
    rim: '#2e3033',
    needle: '#efece0',
    bug: '#e9e3d3',
    warning: '#ff3b2f',
    caution: '#ffb52e',
    advisory: '#7fd1ff',
    green: '#3be36a',
    screen: '#152618',
    frame: '#1f2123',
    flood: 'rgba(255, 196, 140, 0.06)',
  },
  night: {
    panel: '#25272a',
    panelShade: '#1f2123',
    panelEdge: '#2f3236',
    glareshield: '#0b0b0c',
    face: '#060607',
    marking: '#f4dfb4',
    dim: '#8f7d5f',
    rim: '#1c1d1f',
    needle: '#f7e2b8',
    bug: '#f0d8a8',
    warning: '#ff3b2f',
    caution: '#ffb52e',
    advisory: '#7fd1ff',
    green: '#46f07a',
    screen: '#10200f',
    frame: '#121314',
    flood: 'rgba(255, 170, 90, 0.07)',
  },
};

/** The lighting that suits the sky outside: night once the world is dark, dusk in the half-light. */
export function lightingFor(night: number): Lighting {
  if (night > 0.7) return 'night';
  if (night > 0.25) return 'dusk';
  return 'day';
}
