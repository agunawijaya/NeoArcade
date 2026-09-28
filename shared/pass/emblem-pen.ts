/**
 * Badge emblems are drawn by code through a small pen, on a 64 × 64 grid
 * with the centre at 32, 32. The pen only records shapes; the Pass turns
 * them into SVG inside the badge's medal, so every badge gets the same metal,
 * lighting and locked silhouette, in both themes, and manifests stay free of
 * DOM code (the build validates them in Node).
 *
 *   emblem: (pen) => pen.circle(32, 32, 14).path('M32 10v44', { stroke: 'shine', width: 4 })
 *
 * Inks are roles, not colours: `ink` is the engraving, `shine` the light
 * catching it, `accent` a touch of enamel in the game's colour, and `face`
 * the medal's own surface, for cutting holes back out of a shape.
 */
export type EmblemInk = 'ink' | 'shine' | 'accent' | 'face';

export interface EmblemStyle {
  /** Defaults to 'ink' for shapes without a stroke, and to none for stroked ones. */
  fill?: EmblemInk | 'none';
  stroke?: EmblemInk;
  /** Stroke width in grid units; defaults to 3. */
  width?: number;
  opacity?: number;
}

export type EmblemShape =
  | { kind: 'path'; d: string; style: EmblemStyle }
  | { kind: 'circle'; cx: number; cy: number; r: number; style: EmblemStyle }
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
      style: EmblemStyle;
    }
  | { kind: 'polygon'; points: string; style: EmblemStyle };

export interface EmblemPen {
  path(d: string, style?: EmblemStyle): EmblemPen;
  circle(cx: number, cy: number, r: number, style?: EmblemStyle): EmblemPen;
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: EmblemStyle & { radius?: number },
  ): EmblemPen;
  polygon(points: readonly (readonly [number, number])[], style?: EmblemStyle): EmblemPen;
  /** A star with `points` tips between radius `outer` and `inner`, first tip straight up. */
  star(
    cx: number,
    cy: number,
    outer: number,
    inner: number,
    points?: number,
    style?: EmblemStyle,
  ): EmblemPen;
}

export type EmblemDrawer = (pen: EmblemPen) => void;

/** Runs a drawer and returns what it drew. Throws whatever the drawer throws. */
export function recordEmblem(draw: EmblemDrawer): EmblemShape[] {
  const shapes: EmblemShape[] = [];
  const pen: EmblemPen = {
    path(d, style = {}) {
      shapes.push({ kind: 'path', d, style });
      return pen;
    },
    circle(cx, cy, r, style = {}) {
      shapes.push({ kind: 'circle', cx, cy, r, style });
      return pen;
    },
    rect(x, y, width, height, { radius = 0, ...style } = {}) {
      shapes.push({ kind: 'rect', x, y, width, height, radius, style });
      return pen;
    },
    polygon(points, style = {}) {
      shapes.push({ kind: 'polygon', points: pointList(points), style });
      return pen;
    },
    star(cx, cy, outer, inner, points = 5, style = {}) {
      const corners: [number, number][] = [];
      for (let index = 0; index < points * 2; index++) {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (index * Math.PI) / points;
        corners.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }
      shapes.push({ kind: 'polygon', points: pointList(corners), style });
      return pen;
    },
  };
  draw(pen);
  return shapes;
}

function pointList(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
