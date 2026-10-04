import { PLACES, placeById } from '../data/places';
import type { RegionId } from '../data/regions';
import { STATE_SHAPES } from '../map/geography';
import { css, lit, mix, rgb } from './colour';
import { paintFarLayer, type FarLayer } from './horizon';
import { LANDSCAPES } from './landscapes';
import { HEIGHTS, PAINTERS, type SceneryKind } from './scenery';
import { lightingFor, paintSky } from './sky';

/**
 * Postcards in the style of the old large-letter linen cards: a view of the
 * country around the place, a white border, "Greetings from" in script and
 * the name in big block letters. A state card shows the state's own outline
 * instead. Everything is drawn from the same landscapes as the road.
 */
export interface PostcardArt {
  kind: 'town' | 'state';
  /** The place on a town card, or a state code on a state card. */
  subject: string;
  title: string;
}

const LETTER_COLOURS: readonly (readonly [string, string])[] = [
  ['#ffcf4a', '#e2552e'],
  ['#ff8a3d', '#c8312a'],
  ['#7fd1ff', '#2a6fbf'],
  ['#9be38c', '#2f8a4a'],
  ['#ffd9a0', '#b85c2a'],
];

export function regionOfCard(art: PostcardArt): RegionId {
  if (art.kind === 'town') return placeById(art.subject).region;
  const places = [...PLACES.values()].filter((candidate) => candidate.state === art.subject);
  const place = places.find((candidate) => candidate.kind !== 'line') ?? places[0];
  return place?.region ?? 'farmland';
}

function seedOf(text: string): number {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

export function paintPostcard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  art: PostcardArt,
) {
  const seed = seedOf(art.subject);
  const region = regionOfCard(art);
  const border = Math.round(Math.min(width, height) * 0.045);
  const innerW = width - border * 2;
  const innerH = height - border * 2;

  ctx.save();
  ctx.fillStyle = '#f7f1e3';
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(border, border, innerW, innerH);
  ctx.clip();
  ctx.translate(border, border);
  paintView(ctx, innerW, innerH, region, seed);
  if (art.kind === 'state') paintStateOutline(ctx, innerW, innerH, art.subject, seed);
  paintLettering(ctx, innerW, innerH, art, seed);
  // Linen: a fine weave over everything.
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < innerH; y += 3) ctx.fillRect(0, y, innerW, 1);
  ctx.fillStyle = '#000000';
  for (let x = 0; x < innerW; x += 3) ctx.fillRect(x, 0, 1, innerH);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function paintView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  region: RegionId,
  seed: number,
) {
  const landscape = LANDSCAPES[region];
  const sun = 12 + (seed % 30);
  const light = lightingFor(sun, 'clear');
  const horizon = Math.round(height * 0.6);
  paintSky(
    ctx,
    width,
    horizon,
    {
      sunAltitude: sun,
      sunArc: (seed % 100) / 100,
      condition: 'clear',
      time: seed % 50,
      scroll: seed % 900,
    },
    true,
  );
  landscape.far.forEach((layer, index) => {
    const far: FarLayer = { ...layer, seed: seed + index * 977 };
    paintFarLayer(ctx, far, { width, horizon, scroll: seed % 4000, light, night: 0, alpha: 1 });
  });
  const ground = ctx.createLinearGradient(0, horizon, 0, height);
  ground.addColorStop(0, lit(landscape.groundFar, light, 0.4));
  ground.addColorStop(1, lit(landscape.ground, light, 0));
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, width, height - horizon);
  // A road curving in from the corner, as on so many cards.
  ctx.fillStyle = lit('#5a5b5e', light, 0.1);
  ctx.beginPath();
  ctx.moveTo(width * 0.62, height);
  ctx.quadraticCurveTo(width * 0.66, horizon + (height - horizon) * 0.4, width * 0.5, horizon + 2);
  ctx.lineTo(width * 0.52, horizon + 2);
  ctx.quadraticCurveTo(width * 0.78, horizon + (height - horizon) * 0.45, width * 0.9, height);
  ctx.closePath();
  ctx.fill();
  // A few of the region's own things standing about.
  const kinds = landscape.mid.map(([kind]) => kind);
  const env = {
    light,
    season: 'summer' as const,
    snow: false,
    time: 0,
    distance: 0.2,
    reducedMotion: true,
  };
  for (let index = 0; index < 7; index++) {
    const kind = kinds[(seed + index * 7) % Math.max(1, kinds.length)] as SceneryKind | undefined;
    if (!kind || kind === 'tunnel') continue;
    const depth = ((seed >>> (index * 3)) % 100) / 100;
    const y = horizon + (height - horizon) * (0.15 + depth * 0.7);
    const x = (((seed >>> index) % 1000) / 1000) * width;
    if (x > width * 0.45 && x < width * 0.95 && y > horizon + (height - horizon) * 0.3) continue;
    const size = height * (0.12 + depth * 0.22) * (HEIGHTS[kind] ?? 1);
    PAINTERS[kind](ctx, x, y, size, ((seed >>> (index * 2)) % 97) / 97, {
      ...env,
      distance: 0.6 - depth * 0.5,
    });
  }
}

function paintStateOutline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  code: string,
  seed: number,
) {
  const shape = STATE_SHAPES.find((candidate) => candidate.code === code);
  if (!shape) return;
  const numbers = (shape.path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const x = numbers[index] as number;
    const y = numbers[index + 1] as number;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const boxW = width * 0.46;
  const boxH = height * 0.62;
  const scale = Math.min(boxW / Math.max(1, maxX - minX), boxH / Math.max(1, maxY - minY));
  const path = new Path2D(shape.path);
  const [light, dark] = LETTER_COLOURS[seed % LETTER_COLOURS.length] as readonly [string, string];
  ctx.save();
  ctx.translate(width * 0.97 - (maxX - minX) * scale, height * 0.5 - ((maxY - minY) * scale) / 2);
  ctx.scale(scale, scale);
  ctx.translate(-minX, -minY);
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(4 / scale, 4 / scale);
  ctx.fillStyle = 'rgba(40, 28, 16, 0.45)';
  ctx.fill(path);
  ctx.restore();
  ctx.fillStyle = light;
  ctx.fill(path);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3 / scale;
  ctx.stroke(path);
  ctx.strokeStyle = '#fffaf0';
  ctx.lineWidth = 1.2 / scale;
  ctx.stroke(path);
  ctx.restore();
}

function paintLettering(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  art: PostcardArt,
  seed: number,
) {
  const [fillLight, fillDark] = LETTER_COLOURS[(seed >>> 3) % LETTER_COLOURS.length] as readonly [
    string,
    string,
  ];
  const stateCard = art.kind === 'state';
  const lead = stateCard ? 'Welcome to' : 'Greetings from';
  const name = art.title.toUpperCase();
  const area = stateCard ? width * 0.5 : width * 0.9;
  const left = stateCard ? width * 0.05 : (width - area) / 2;

  // "Greetings from", in script.
  const scriptSize = height * 0.12;
  ctx.font = `italic 700 ${scriptSize}px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = scriptSize * 0.14;
  ctx.strokeStyle = '#fffaf0';
  ctx.lineJoin = 'round';
  ctx.strokeText(lead, left, height * (stateCard ? 0.3 : 0.24));
  ctx.fillStyle = '#c8312a';
  ctx.fillText(lead, left, height * (stateCard ? 0.3 : 0.24));

  // The name, in big block letters with a deep shadow.
  let size = height * (stateCard ? 0.24 : 0.36);
  ctx.font = `900 ${size}px "Roboto Condensed", "Arial Narrow", "Impact", system-ui, sans-serif`;
  const measured = ctx.measureText(name).width;
  if (measured > area) {
    size *= area / measured;
    ctx.font = `900 ${size}px "Roboto Condensed", "Arial Narrow", "Impact", system-ui, sans-serif`;
  }
  const baseline = height * (stateCard ? 0.58 : 0.62);
  const depth = Math.max(2, size * 0.09);
  ctx.fillStyle = '#2a1c10';
  for (let step = depth; step > 0; step -= 1) ctx.fillText(name, left + step, baseline + step);
  const gradient = ctx.createLinearGradient(0, baseline - size * 0.8, 0, baseline);
  gradient.addColorStop(0, fillLight);
  gradient.addColorStop(1, fillDark);
  ctx.fillStyle = gradient;
  ctx.fillText(name, left, baseline);
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.strokeStyle = '#fffaf0';
  ctx.strokeText(name, left, baseline);
  // A sheen across the upper half of each letter.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left - 4, baseline - size * 0.75, area + 8, size * 0.22);
  ctx.clip();
  ctx.fillStyle = css(mix(rgb(fillLight), [255, 255, 255], 0.55));
  ctx.globalAlpha = 0.45;
  ctx.fillText(name, left, baseline);
  ctx.restore();
}
