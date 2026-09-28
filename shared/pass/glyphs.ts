import type { EmblemDrawer } from './emblem-pen';

/**
 * Ready-made emblems for manifests, drawn on the pen's 64 × 64 grid. Use
 * them as they are (`emblem: glyphs.trophy`), or combine them with your own
 * shapes: `emblem: (pen) => { glyphs.star(pen); pen.circle(32, 32, 4, { fill: 'accent' }); }`.
 */
const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function rays(inner: number, outer: number): string {
  return RAY_ANGLES.map((degrees) => {
    const angle = (degrees * Math.PI) / 180;
    const x1 = 32 + Math.cos(angle) * inner;
    const y1 = 32 + Math.sin(angle) * inner;
    const x2 = 32 + Math.cos(angle) * outer;
    const y2 = 32 + Math.sin(angle) * outer;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join('');
}

export const glyphs = {
  star: (pen) => {
    pen.star(32, 34, 23, 10);
    pen.star(32, 34, 9, 4, 5, { fill: 'accent' });
  },
  trophy: (pen) => {
    pen.path('M21 16h-6c0 8 3 12 9 13M43 16h6c0 8-3 12-9 13', { stroke: 'ink', width: 3.5 });
    pen.path('M19 10h26v10c0 10-5 17-13 18-8-1-13-8-13-18z');
    pen.path('M25 15v7', { stroke: 'shine', width: 3, opacity: 0.8 });
    pen.rect(29, 37, 6, 8);
    pen.rect(21, 45, 22, 6, { radius: 2 });
    pen.rect(17, 51, 30, 4, { radius: 2, fill: 'accent' });
  },
  flame: (pen) => {
    pen.path('M31 6c4 9 16 15 16 30a15 15 0 0 1-30 0c0-8 5-13 7-18 1 5 3 8 6 9 1-8-1-14 1-21z');
    pen.path('M32 31c2 5 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 4-9 1 2 2 3 3 3 0-3-1-5 0-7z', {
      fill: 'accent',
    });
  },
  target: (pen) => {
    pen.circle(30, 34, 21, { stroke: 'ink', width: 4 });
    pen.circle(30, 34, 12.5, { stroke: 'ink', width: 4 });
    pen.circle(30, 34, 5, { fill: 'accent' });
    pen.path('M31 33 51 13', { stroke: 'ink', width: 3.5 });
    pen.polygon([
      [45, 11],
      [53, 11],
      [53, 19],
      [49, 15],
    ]);
  },
  bolt: (pen) => {
    pen.polygon([
      [37, 5],
      [15, 36],
      [29, 36],
      [24, 59],
      [49, 25],
      [34, 25],
      [41, 5],
    ]);
    pen.path('M36 11 24 30', { stroke: 'shine', width: 2.5, opacity: 0.7 });
  },
  heart: (pen) => {
    pen.path('M32 53C13 41 9 31 9 23a11.5 11.5 0 0 1 23-4 11.5 11.5 0 0 1 23 4c0 8-4 18-23 30z');
    pen.path('M16 21a6 6 0 0 1 6-5', { stroke: 'shine', width: 3, opacity: 0.8 });
  },
  crown: (pen) => {
    pen.polygon([
      [12, 45],
      [9, 20],
      [22, 31],
      [32, 13],
      [42, 31],
      [55, 20],
      [52, 45],
    ]);
    pen.rect(12, 46, 40, 7, { radius: 2 });
    pen.circle(9, 18, 3.5, { fill: 'accent' });
    pen.circle(32, 11, 3.5, { fill: 'accent' });
    pen.circle(55, 18, 3.5, { fill: 'accent' });
    pen.circle(32, 38, 3.5, { fill: 'face' });
  },
  skull: (pen) => {
    pen.path('M32 9C19 9 11 17 11 28c0 7 3 12 8 14v9h26v-9c5-2 8-7 8-14 0-11-8-19-21-19z');
    pen.circle(24, 29, 5.5, { fill: 'face' });
    pen.circle(40, 29, 5.5, { fill: 'face' });
    pen.polygon(
      [
        [32, 35],
        [28.5, 41],
        [35.5, 41],
      ],
      { fill: 'face' },
    );
    pen.path('M26 46v5M32 46v5M38 46v5', { stroke: 'shine', width: 2 });
  },
  sun: (pen) => {
    pen.path(rays(17, 26), { stroke: 'ink', width: 4.5 });
    pen.circle(32, 32, 12.5);
    pen.circle(32, 32, 6.5, { fill: 'accent' });
  },
  moon: (pen) => {
    pen.path('M38 8a24 24 0 1 0 17 37A19 19 0 0 1 38 8z');
    pen.star(49, 14, 5, 2, 4, { fill: 'accent' });
    pen.star(55, 28, 3, 1.2, 4, { fill: 'accent' });
  },
  planet: (pen) => {
    pen.path('M9 42c-3-5 16-15 27-18 11-3 20-4 21-1', { stroke: 'ink', width: 3.5 });
    pen.circle(32, 32, 15);
    pen.path('M20 40c8-2 20-8 26-14', { stroke: 'face', width: 3 });
    pen.path('M7 44c2 4 18 2 32-4 9-4 17-10 18-14', { stroke: 'accent', width: 3.5 });
  },
  rocket: (pen) => {
    pen.path('M32 5c9 7 13 17 13 29l-5 9H24l-5-9c0-12 4-22 13-29z');
    pen.circle(32, 26, 5.5, { fill: 'face' });
    pen.circle(32, 26, 3, { fill: 'accent' });
    pen.polygon([
      [19, 34],
      [11, 45],
      [11, 51],
      [23, 44],
    ]);
    pen.polygon([
      [45, 34],
      [53, 45],
      [53, 51],
      [41, 44],
    ]);
    pen.path('M26 46h12l-3 12h-6z', { fill: 'accent' });
  },
  clock: (pen) => {
    pen.circle(32, 34, 21, { stroke: 'ink', width: 4.5 });
    pen.path('M32 21v14l9 6', { stroke: 'ink', width: 4 });
    pen.rect(28, 6, 8, 5, { radius: 1.5 });
    pen.circle(32, 35, 3, { fill: 'accent' });
  },
  calendar: (pen) => {
    pen.rect(10, 14, 44, 40, { radius: 6 });
    pen.rect(14, 24, 36, 26, { radius: 3, fill: 'face' });
    pen.path('M21 9v10M43 9v10', { stroke: 'ink', width: 4.5 });
    pen.path('M22 37l6 6 13-13', { stroke: 'accent', width: 4.5 });
  },
  medal: (pen) => {
    pen.polygon([
      [18, 6],
      [28, 6],
      [34, 24],
      [26, 28],
    ]);
    pen.polygon(
      [
        [46, 6],
        [36, 6],
        [30, 24],
        [38, 28],
      ],
      { fill: 'accent' },
    );
    pen.circle(32, 40, 16);
    pen.star(32, 41, 9, 4, 5, { fill: 'face' });
  },
  crosshair: (pen) => {
    pen.circle(32, 32, 18, { stroke: 'ink', width: 4 });
    pen.path('M32 6v14M32 44v14M6 32h14M44 32h14', { stroke: 'ink', width: 4 });
    pen.circle(32, 32, 4, { fill: 'accent' });
  },
  burst: (pen) => {
    pen.polygon([
      [32, 5],
      [37, 20],
      [52, 11],
      [45, 26],
      [60, 30],
      [46, 37],
      [55, 51],
      [39, 45],
      [34, 60],
      [28, 46],
      [13, 54],
      [19, 39],
      [4, 34],
      [18, 27],
      [10, 13],
      [26, 20],
    ]);
    pen.star(32, 33, 11, 5, 6, { fill: 'accent' });
  },
  dice: (pen) => {
    pen.rect(10, 10, 44, 44, { radius: 9 });
    for (const [x, y] of [
      [22, 22],
      [42, 22],
      [32, 32],
      [22, 42],
      [42, 42],
    ] as const) {
      pen.circle(x, y, 4.2, { fill: 'face' });
    }
    pen.circle(32, 32, 2.2, { fill: 'accent' });
  },
  gamepad: (pen) => {
    pen.path(
      'M18 20h28c7 0 11 6 12 14l1 9c1 6-6 9-10 4l-6-7H21l-6 7c-4 5-11 2-10-4l1-9c1-8 5-14 12-14z',
    );
    pen.path('M20 26v10M15 31h10', { stroke: 'face', width: 3.5 });
    pen.circle(42, 28, 3, { fill: 'accent' });
    pen.circle(48, 34, 3, { fill: 'face' });
  },
  coin: (pen) => {
    pen.circle(32, 32, 23);
    pen.circle(32, 32, 17, { stroke: 'shine', width: 2, opacity: 0.7 });
    pen.rect(29, 19, 6, 26, { radius: 3, fill: 'accent' });
  },
  key: (pen) => {
    pen.circle(20, 24, 12, { stroke: 'ink', width: 6 });
    pen.path('M28 32 52 56', { stroke: 'ink', width: 6 });
    pen.path('M44 48l6-6M49 53l5-5', { stroke: 'ink', width: 5 });
    pen.circle(20, 24, 3.5, { fill: 'accent' });
  },
  eye: (pen) => {
    pen.path('M5 32c7-11 16-17 27-17s20 6 27 17c-7 11-16 17-27 17S12 43 5 32z');
    pen.circle(32, 32, 11, { fill: 'face' });
    pen.circle(32, 32, 7, { fill: 'accent' });
    pen.circle(32, 32, 3.5);
  },
  wind: (pen) => {
    pen.path('M8 22h30a7 7 0 1 0-7-7', { stroke: 'ink', width: 4.5 });
    pen.path('M8 33h42a7 7 0 1 1-7 7', { stroke: 'ink', width: 4.5 });
    pen.path('M12 44h18', { stroke: 'accent', width: 4.5 });
  },
  flag: (pen) => {
    pen.path('M16 58V8', { stroke: 'ink', width: 4.5 });
    pen.path('M18 10c8-4 14 4 22 1s11-3 14-1v22c-3-2-7-2-14 1s-14-5-22-1z');
    pen.path('M26 16v14', { stroke: 'accent', width: 4 });
  },
  sparkle: (pen) => {
    pen.path('M28 6c2 13 7 18 20 20-13 2-18 7-20 20-2-13-7-18-20-20 13-2 18-7 20-20z');
    pen.star(49, 45, 8, 2.5, 4, { fill: 'accent' });
    pen.star(15, 49, 5, 1.6, 4);
  },
  loop: (pen) => {
    pen.path(
      'M32 32c-6-7-10-11-16-11a11 11 0 0 0 0 22c6 0 10-4 16-11s10-11 16-11a11 11 0 0 1 0 22c-6 0-10-4-16-11z',
      { stroke: 'ink', width: 5 },
    );
    pen.circle(48, 32, 3, { fill: 'accent' });
  },
  question: (pen) => {
    pen.path('M21 22a11 11 0 1 1 17 9c-4 3-6 5-6 10v3', { stroke: 'ink', width: 6.5 });
    pen.circle(32, 53, 4.5);
  },
  shield: (pen) => {
    pen.path('M32 5 53 13v15c0 14-8 24-21 31C19 52 11 42 11 28V13z');
    pen.path('M22 31l7 7 13-14', { stroke: 'face', width: 5 });
    pen.path('M17 17v10c0 4 1 8 3 11', { stroke: 'shine', width: 2.5, opacity: 0.6 });
  },
  hourglass: (pen) => {
    pen.rect(14, 6, 36, 6, { radius: 2 });
    pen.rect(14, 52, 36, 6, { radius: 2 });
    pen.path('M18 12h28c0 10-9 14-9 20s9 10 9 20H18c0-10 9-14 9-20s-9-10-9-20z');
    pen.path('M25 46h14l-7-7z', { fill: 'accent' });
    pen.path('M24 17h16l-8 8z', { fill: 'accent' });
  },
  gem: (pen) => {
    pen.polygon([
      [16, 10],
      [48, 10],
      [58, 24],
      [32, 56],
      [6, 24],
    ]);
    pen.path('M6 24h52M16 10l8 14 8-14 8 14 8-14M24 24l8 32 8-32', {
      stroke: 'face',
      width: 2,
    });
    pen.polygon(
      [
        [24, 24],
        [40, 24],
        [32, 10],
      ],
      { fill: 'accent', opacity: 0.8 },
    );
  },
  check: (pen) => {
    pen.path('M12 33l13 13 27-28', { stroke: 'ink', width: 8 });
    pen.path('M12 33l13 13', { stroke: 'accent', width: 3 });
  },
  mountain: (pen) => {
    pen.polygon([
      [4, 54],
      [24, 18],
      [34, 34],
      [42, 24],
      [60, 54],
    ]);
    pen.polygon(
      [
        [24, 18],
        [30, 29],
        [26, 27],
        [22, 31],
        [19, 27],
      ],
      { fill: 'face' },
    );
    pen.path('M24 18V6l9 3-9 3', { fill: 'accent' });
  },
} satisfies Record<string, EmblemDrawer>;

export type GlyphName = keyof typeof glyphs;
