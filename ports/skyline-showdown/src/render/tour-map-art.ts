import { createRng } from '@shared/rng';
import type { Point } from '../engine/geometry';
import type { ChapterId, StageId } from '../tour/stages';
import { withAlpha } from './palette';

/**
 * The World Tour map: a globe with the six Earth cities, then the route
 * out to the Moon, Mars and Jupiter, each chapter's stops ringed around its
 * world. Drawn on a 1600 × 900 board that the screen fits to its space;
 * the stops themselves are buttons laid over it (see ui/tour-map.ts).
 */
export const BOARD = { width: 1600, height: 900 } as const;

export interface Body {
  x: number;
  y: number;
  radius: number;
}

export const BODIES: Record<ChapterId, Body> = {
  earth: { x: 400, y: 490, radius: 300 },
  moon: { x: 830, y: 200, radius: 75 },
  mars: { x: 1080, y: 600, radius: 100 },
  jupiter: { x: 1400, y: 300, radius: 145 },
};

/** Where each stop sits on the board. Earth's are on the globe, the rest ring their world. */
export const STOPS: Record<StageId, Point> = {
  jakarta: { x: 565, y: 650 },
  tokyo: { x: 620, y: 430 },
  dubai: { x: 470, y: 500 },
  cairo: { x: 350, y: 400 },
  rio: { x: 250, y: 670 },
  'new-york': { x: 190, y: 320 },
  tranquility: { x: 700, y: 130 },
  copernicus: { x: 830, y: 72 },
  earthrise: { x: 960, y: 130 },
  'dust-basin': { x: 930, y: 540 },
  'red-canyon': { x: 1040, y: 440 },
  olympus: { x: 1230, y: 560 },
  'storm-harbor': { x: 1260, y: 440 },
  'red-spot': { x: 1330, y: 110 },
  'the-eye': { x: 1555, y: 420 },
};

/** Where each chapter's name goes, clear of its stops. */
export const CHAPTER_LABELS: Record<ChapterId, Point> = {
  earth: { x: 400, y: 815 },
  moon: { x: 830, y: 290 },
  mars: { x: 1080, y: 715 },
  jupiter: { x: 1400, y: 465 },
};

export interface MapInk {
  space: [string, string];
  star: string;
  route: string;
  routeAhead: string;
}

const DARK: MapInk = {
  space: ['#06040e', '#1c1142'],
  star: '#ffffff',
  route: '#ffd23f',
  routeAhead: 'rgba(255, 255, 255, 0.28)',
};

const LIGHT: MapInk = {
  space: ['#cfe2f3', '#f3ebf6'],
  star: 'rgba(60, 70, 140, 0.4)',
  route: '#c07000',
  routeAhead: 'rgba(28, 25, 60, 0.28)',
};

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

/** Continents as rough blobs on the unit disc: a playful globe, not an atlas. */
const LAND: readonly (readonly [number, number])[][] = [
  [
    [-0.78, -0.42],
    [-0.5, -0.72],
    [-0.12, -0.66],
    [0.04, -0.38],
    [-0.18, -0.16],
    [-0.36, 0.04],
    [-0.62, -0.04],
    [-0.84, -0.2],
  ],
  [
    [-0.46, 0.12],
    [-0.22, 0.2],
    [-0.14, 0.46],
    [-0.3, 0.84],
    [-0.5, 0.62],
    [-0.6, 0.34],
  ],
  [
    [0.04, -0.58],
    [0.4, -0.74],
    [0.8, -0.46],
    [0.84, -0.08],
    [0.58, 0.06],
    [0.34, -0.02],
    [0.22, 0.16],
    [0.04, -0.2],
  ],
  [
    [-0.02, -0.06],
    [0.26, 0.04],
    [0.32, 0.36],
    [0.16, 0.68],
    [0.02, 0.48],
    [-0.08, 0.16],
  ],
  [
    [0.44, 0.34],
    [0.74, 0.28],
    [0.8, 0.52],
    [0.56, 0.62],
  ],
];

export class TourMapArt {
  private readonly stars: Star[];

  constructor() {
    const rng = createRng(7);
    // Stars spill past the board, so a screen wider or taller than it is never bare.
    this.stars = Array.from({ length: 360 }, () => ({
      x: rng.float(-BOARD.width / 2, BOARD.width * 1.5),
      y: rng.float(-BOARD.height / 2, BOARD.height * 1.5),
      size: rng.float(0.8, 2.4),
      phase: rng.float(0, Math.PI * 2),
    }));
  }

  /**
   * Paints the board. `route` lists every stop in tour order; the first
   * `reached` of them are behind the player and glow, the rest wait dimmed.
   * Chapters not yet open are drawn faded.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    options: {
      theme: 'light' | 'dark';
      time: number;
      route: readonly Point[];
      reached: number;
      open: Record<ChapterId, boolean>;
    },
  ) {
    const ink = options.theme === 'light' ? LIGHT : DARK;
    const { time } = options;
    const sky = ctx.createLinearGradient(0, 0, BOARD.width, BOARD.height);
    sky.addColorStop(0, ink.space[0]);
    sky.addColorStop(1, ink.space[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(-BOARD.width, -BOARD.height, BOARD.width * 3, BOARD.height * 3);
    this.drawNebula(ctx, options.theme);
    for (const star of this.stars) {
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.8 + star.phase));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = ink.star;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    const faded = (chapter: ChapterId, draw: () => void) => {
      ctx.globalAlpha = options.open[chapter] ? 1 : 0.42;
      draw();
      ctx.globalAlpha = 1;
    };
    faded('earth', () => drawEarth(ctx, BODIES.earth, time, options.theme));
    faded('moon', () => drawMoon(ctx, BODIES.moon));
    faded('mars', () => drawMars(ctx, BODIES.mars));
    faded('jupiter', () => drawJupiter(ctx, BODIES.jupiter, time));
    // The route goes over the worlds, so the way across the globe shows too.
    this.drawRoute(ctx, ink, options.route, options.reached, time);
  }

  private drawNebula(ctx: CanvasRenderingContext2D, theme: 'light' | 'dark') {
    const clouds: [number, number, number, string][] =
      theme === 'light'
        ? [
            [1150, 250, 420, 'rgba(255, 200, 150, 0.35)'],
            [300, 150, 380, 'rgba(160, 200, 255, 0.4)'],
          ]
        : [
            [1150, 250, 420, 'rgba(140, 60, 170, 0.22)'],
            [300, 150, 380, 'rgba(40, 90, 200, 0.2)'],
            [1000, 800, 360, 'rgba(200, 80, 60, 0.12)'],
          ];
    for (const [x, y, radius, colour] of clouds) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, colour);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  /** The dotted route; the part already travelled glows, the next leg shimmers towards the next stop. */
  private drawRoute(
    ctx: CanvasRenderingContext2D,
    ink: MapInk,
    route: readonly Point[],
    reached: number,
    time: number,
  ) {
    ctx.lineCap = 'round';
    for (let index = 1; index < route.length; index++) {
      const from = route[index - 1] as Point;
      const to = route[index] as Point;
      const travelled = index < reached;
      const nextLeg = index === reached;
      const bend = Math.hypot(to.x - from.x, to.y - from.y) * 0.18;
      const middle = {
        x:
          (from.x + to.x) / 2 +
          ((to.y - from.y) / (Math.hypot(to.x - from.x, to.y - from.y) || 1)) * bend,
        y:
          (from.y + to.y) / 2 -
          ((to.x - from.x) / (Math.hypot(to.x - from.x, to.y - from.y) || 1)) * bend,
      };
      ctx.setLineDash(travelled ? [] : [6, 12]);
      ctx.lineDashOffset = nextLeg ? -time * 30 : 0;
      ctx.strokeStyle = travelled || nextLeg ? ink.route : ink.routeAhead;
      ctx.lineWidth = travelled ? 5 : 4;
      ctx.globalAlpha = travelled ? 0.75 : 1;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(middle.x, middle.y, to.x, to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
  }
}

function drawEarth(ctx: CanvasRenderingContext2D, body: Body, time: number, theme: string) {
  const { x, y, radius } = body;
  const halo = ctx.createRadialGradient(x, y, radius * 0.9, x, y, radius * 1.18);
  halo.addColorStop(0, withAlpha('#6fc3ff', theme === 'light' ? 0.35 : 0.45));
  halo.addColorStop(1, withAlpha('#6fc3ff', 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  const ocean = ctx.createRadialGradient(
    x - radius * 0.4,
    y - radius * 0.4,
    radius * 0.1,
    x,
    y,
    radius,
  );
  ocean.addColorStop(0, '#4aa8f0');
  ocean.addColorStop(1, '#123e8c');
  ctx.fillStyle = ocean;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  for (const blob of LAND) {
    const points = blob.map(([u, v]) => ({ x: x + u * radius, y: y + v * radius }));
    ctx.fillStyle = '#4f9a52';
    smoothShape(ctx, points);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#d8c88a', 0.8);
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // Clouds drift slowly over the land.
  ctx.strokeStyle = withAlpha('#ffffff', 0.55);
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  for (let band = 0; band < 5; band++) {
    const offset = ((time * 6 + band * 170) % (radius * 2.6)) - radius * 1.3;
    const bandY = y - radius * 0.7 + band * radius * 0.35;
    ctx.beginPath();
    ctx.moveTo(x + offset - 60, bandY);
    ctx.quadraticCurveTo(x + offset, bandY - 14, x + offset + 70, bandY + 4);
    ctx.stroke();
  }
  // Night side.
  const shadow = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  shadow.addColorStop(0.45, 'rgba(0, 0, 20, 0)');
  shadow.addColorStop(1, `rgba(0, 0, 20, ${theme === 'light' ? 0.25 : 0.55})`);
  ctx.fillStyle = shadow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.strokeStyle = withAlpha('#bfe6ff', 0.8);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
}

function drawMoon(ctx: CanvasRenderingContext2D, body: Body) {
  const { x, y, radius } = body;
  const face = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 2, x, y, radius);
  face.addColorStop(0, '#f2f4fa');
  face.addColorStop(1, '#8e97ad');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(90, 98, 124, 0.45)';
  for (const [u, v, size] of [
    [-0.3, -0.2, 0.22],
    [0.25, 0.1, 0.16],
    [-0.05, 0.45, 0.12],
    [0.4, -0.4, 0.1],
    [-0.5, 0.3, 0.09],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + u * radius, y + v * radius, size * radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMars(ctx: CanvasRenderingContext2D, body: Body) {
  const { x, y, radius } = body;
  const face = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 2, x, y, radius);
  face.addColorStop(0, '#f0a070');
  face.addColorStop(1, '#8a3a22');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(90, 30, 20, 0.45)';
  ctx.beginPath();
  ctx.ellipse(
    x - radius * 0.2,
    y + radius * 0.1,
    radius * 0.55,
    radius * 0.16,
    0.3,
    0,
    Math.PI * 2,
  );
  ctx.ellipse(
    x + radius * 0.35,
    y - radius * 0.3,
    radius * 0.25,
    radius * 0.1,
    -0.2,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = '#fbeee6';
  ctx.beginPath();
  ctx.ellipse(x, y - radius * 0.93, radius * 0.35, radius * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawJupiter(ctx: CanvasRenderingContext2D, body: Body, time: number) {
  const { x, y, radius } = body;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  const bands = ['#e8c89a', '#c0825e', '#f2dcb4', '#a8634a', '#ecd0a2', '#b87a5a', '#f0d8b0'];
  const bandHeight = (radius * 2) / bands.length;
  bands.forEach((colour, index) => {
    ctx.fillStyle = colour;
    const wobble = Math.sin(time * 0.3 + index) * 3;
    ctx.fillRect(x - radius, y - radius + index * bandHeight + wobble, radius * 2, bandHeight + 2);
  });
  ctx.fillStyle = '#b8452e';
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.3, y + radius * 0.28, radius * 0.24, radius * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  const shade = ctx.createRadialGradient(
    x - radius * 0.4,
    y - radius * 0.4,
    radius * 0.2,
    x,
    y,
    radius,
  );
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  shade.addColorStop(1, 'rgba(40, 10, 10, 0.4)');
  ctx.fillStyle = shade;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

/** A closed, rounded shape through the points, like a coastline drawn by hand. */
function smoothShape(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = points[0] as Point;
  const last = points.at(-1) as Point;
  const start = middle(last, first);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] as Point;
    const end = middle(point, next);
    ctx.quadraticCurveTo(point.x, point.y, end.x, end.y);
  });
  ctx.closePath();
}
