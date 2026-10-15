import { createRng } from '@shared/rng';

/**
 * Runway paint, drawn by code onto a canvas in feet: the markings of a
 * precision instrument runway as the FAA laid them out (advisory circular
 * 150/5340-1): threshold stripes by width, the designation, the aiming
 * point, touchdown-zone bars, the centreline dashes and side stripes, and
 * arrows over a displaced threshold. Each half of a runway gets its own
 * canvas, drawn from its own end, so the numbers stay sharp on short final.
 */
export const PIXELS_PER_FOOT_ACROSS = 1;
export const PIXELS_PER_FOOT_ALONG = 0.66;

export interface HalfRunway {
  ident: string;
  widthFt: number;
  /** From this end's physical start to the middle of the runway. */
  lengthFt: number;
  displacedFt: number;
  precision: boolean;
  seed: number;
}

const PAINT = 'rgba(236, 236, 228, 0.94)';

/** Threshold stripes for a runway's width (FAA: 4 for 60 ft … 16 for 200 ft). */
export function thresholdStripes(widthFt: number): number {
  if (widthFt >= 200) return 16;
  if (widthFt >= 150) return 12;
  if (widthFt >= 100) return 8;
  if (widthFt >= 75) return 6;
  return 4;
}

/** Block digits on a grid three wide and five tall: each stroke a run of cells. */
const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  C: ['###', '#..', '#..', '#..', '###'],
};

/**
 * Draws a glyph standing on the runway, read by a pilot landing toward
 * +y: its top row is the far one. `x` is its left edge, `y` its near edge.
 */
function glyph(
  context: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const rows = GLYPHS[char];
  if (!rows) return;
  const cellW = width / 3;
  const cellH = height / 5;
  rows.forEach((row, rowIndex) => {
    [...row].forEach((cell, colIndex) => {
      if (cell !== '#') return;
      const top = y + (4 - rowIndex) * cellH;
      context.fillRect(x + colIndex * cellW, top, cellW + 0.01, cellH + 0.01);
    });
  });
}

/** One half of a runway, seen from its end: the canvas's row 0 is the end, its last row the middle. */
export function paintHalfRunway(half: HalfRunway): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(half.widthFt * PIXELS_PER_FOOT_ACROSS));
  canvas.height = Math.max(64, Math.round(half.lengthFt * PIXELS_PER_FOOT_ALONG));
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.scale(canvas.width / half.widthFt, canvas.height / half.lengthFt);
  const width = half.widthFt;
  const centre = width / 2;
  const rng = createRng(half.seed);

  context.fillStyle = '#3c3d3f';
  context.fillRect(0, 0, width, half.lengthFt);
  // Patched and worn asphalt: lighter and darker slabs, then rubber where the wheels come down.
  for (let patch = 0; patch < 220; patch++) {
    const shade = rng.float(-14, 14);
    context.fillStyle = `rgba(${60 + shade}, ${61 + shade}, ${64 + shade}, 0.5)`;
    context.fillRect(
      rng.float(0, width),
      rng.float(0, half.lengthFt),
      rng.float(6, 40),
      rng.float(40, 260),
    );
  }
  const landing = half.displacedFt;
  for (let smear = 0; smear < 160; smear++) {
    const along = landing + rng.float(400, 2800);
    const across = centre + rng.float(-38, 38);
    context.fillStyle = `rgba(18, 18, 20, ${rng.float(0.08, 0.22)})`;
    context.fillRect(across - 4, along, rng.float(3, 9), rng.float(30, 160));
  }

  context.fillStyle = PAINT;
  // Side stripes.
  context.fillRect(1, 0, 3, half.lengthFt);
  context.fillRect(width - 4, 0, 3, half.lengthFt);

  if (half.displacedFt > 0) {
    // Arrows up the middle of the displaced stretch, and the bar across where the landing threshold is.
    for (let along = 60; along < half.displacedFt - 80; along += 200) {
      context.fillRect(centre - 1.5, along, 3, 120);
      context.beginPath();
      context.moveTo(centre - 9, along + 100);
      context.lineTo(centre, along + 140);
      context.lineTo(centre + 9, along + 100);
      context.closePath();
      context.fill();
    }
    context.fillRect(0, half.displacedFt - 10, width, 10);
  }

  // Threshold stripes in two equal sets either side of the centreline, as wide as the gaps between them.
  const stripes = thresholdStripes(width);
  const perSide = stripes / 2;
  const stripe = width / (stripes * 2.4);
  const setWidth = perSide * stripe + (perSide - 1) * stripe;
  for (let index = 0; index < perSide; index++) {
    const offset = index * stripe * 2;
    context.fillRect(centre - stripe - setWidth + offset, landing + 20, stripe, 150);
    context.fillRect(centre + stripe + offset, landing + 20, stripe, 150);
  }

  // The designation: the letter first, then the number, each 60 ft long.
  const number = String(Number.parseInt(half.ident, 10));
  const letter = half.ident.replace(/^\d+/, '');
  let along = landing + 200;
  if (letter) {
    glyph(context, letter, centre - 10, along, 20, 60);
    along += 80;
  }
  const digitWidth = 20;
  const spacing = 8;
  const total = number.length * digitWidth + (number.length - 1) * spacing;
  [...number].forEach((char, index) => {
    glyph(
      context,
      char,
      centre - total / 2 + index * (digitWidth + spacing),
      along,
      digitWidth,
      60,
    );
  });
  const centrelineFrom = along + 60 + 200;

  if (half.precision) {
    const inner = width >= 150 ? 36 : 24;
    const bars = (from: number, count: number) => {
      for (const sign of [-1, 1]) {
        for (let bar = 0; bar < count; bar++) {
          const x = sign < 0 ? centre - inner - (bar + 1) * 11 : centre + inner + bar * 11;
          context.fillRect(x, landing + from, 6, 75);
        }
      }
    };
    bars(500, 3);
    // The aiming point: a broad stripe each side, 1,000 ft past the threshold.
    context.fillRect(centre - inner - 30, landing + 1000, 30, 150);
    context.fillRect(centre + inner, landing + 1000, 30, 150);
    if (half.lengthFt > landing + 1600) bars(1500, 2);
    if (half.lengthFt > landing + 2100) bars(2000, 2);
    if (half.lengthFt > landing + 2600) bars(2500, 1);
    if (half.lengthFt > landing + 3100) bars(3000, 1);
  }

  for (let dash = centrelineFrom; dash < half.lengthFt; dash += 200) {
    context.fillRect(centre - 1.5, dash, 3, Math.min(120, half.lengthFt - dash));
  }
  return canvas;
}
