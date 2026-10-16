import type { Livery, WingMotif } from './palette';

/** A flat outline in unit coordinates: radius 1 around the middle of the mark. */
export type Outline = readonly (readonly [number, number])[];

export interface InsigniaLayer {
  colour: string;
  outline: Outline;
}

function circle(radius: number, points = 20): Outline {
  return Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
}

function crossPattee(radius: number): Outline {
  const arm = radius;
  const waist = radius * 0.28;
  const flare = radius * 0.62;
  return [
    [waist, waist],
    [flare, arm],
    [-flare, arm],
    [-waist, waist],
    [-arm, flare],
    [-arm, -flare],
    [-waist, -waist],
    [-flare, -arm],
    [flare, -arm],
    [waist, -waist],
    [arm, -flare],
    [arm, flare],
  ];
}

function diamond(radius: number): Outline {
  return [
    [radius, 0],
    [0, radius * 0.72],
    [-radius, 0],
    [0, -radius * 0.72],
  ];
}

function star(outer: number, inner: number): Outline {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = Math.PI / 2 + (index / 10) * Math.PI * 2;
    const radius = index % 2 === 0 ? outer : inner;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
}

/**
 * A side's mark as layers painted outside in: the rings of a roundel, the
 * cross pattée with its white border, the kite's diamond, the star on its
 * disc. Both views draw these same outlines, the side view through its
 * projection and the diorama onto its textures.
 */
export function insigniaLayers(livery: Livery): InsigniaLayer[] {
  const [first = '#ffffff', second = first, third] = livery.insigniaColours;
  switch (livery.insignia) {
    case 'roundel':
      return livery.insigniaColours.map((colour, index) => ({
        colour,
        outline: circle(1 - index * 0.32),
      }));
    case 'cross':
      return [
        { colour: first, outline: crossPattee(1) },
        { colour: second, outline: crossPattee(0.77) },
      ];
    case 'diamond':
      return [
        { colour: first, outline: diamond(1.1) },
        { colour: second, outline: diamond(0.82) },
        ...(third ? [{ colour: third, outline: diamond(0.42) }] : []),
      ];
    case 'star':
      return [
        { colour: first, outline: circle(1) },
        { colour: second, outline: star(0.9, 0.38) },
      ];
  }
}

/**
 * The cells of a wing motif in wing coordinates: `c` across the chord from
 * the leading edge (0) to the trailing edge (1), `s` along the span from
 * the root (0) to the tip (1).
 */
export function motifCells(motif: WingMotif): Outline[] {
  switch (motif) {
    case 'none':
      return [];
    case 'stripes':
      return [0.3, 0.42].map((s) => [
        [0, s],
        [1, s],
        [1, s + 0.06],
        [0, s + 0.06],
      ]);
    case 'checks': {
      const cells: Outline[] = [];
      for (let row = 0; row < 2; row++) {
        for (let column = 0; column < 4; column++) {
          if ((row + column) % 2 === 1) continue;
          const s = 0.8 + column * 0.05;
          const c = row * 0.5;
          cells.push([
            [c, s],
            [c + 0.5, s],
            [c + 0.5, s + 0.05],
            [c, s + 0.05],
          ]);
        }
      }
      return cells;
    }
    case 'chevrons':
      return [0.22, 0.4].map((s) => [
        [0.15, s],
        [0.85, s + 0.07],
        [0.15, s + 0.14],
        [0.15, s + 0.09],
        [0.6, s + 0.07],
        [0.15, s + 0.05],
      ]);
    case 'sunburst':
      return Array.from({ length: 5 }, (_, index) => {
        const middle = 0.1 + index * 0.2;
        return [
          [0.5, 0],
          [middle - 0.06, 0.72],
          [middle + 0.06, 0.72],
        ];
      });
  }
}
