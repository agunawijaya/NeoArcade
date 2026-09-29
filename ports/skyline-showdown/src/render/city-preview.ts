import { STREET_Y, SUN, WORLD_HEIGHT, WORLD_WIDTH } from '../engine/constants';
import type { Point } from '../engine/geometry';
import { isOffstage, type Gorilla, type PlayerIndex } from '../engine/gorillas';
import type { Round } from '../engine/match';
import { BELL_RADIUS, CRATE_SIZE, HOOP_RADIUS } from '../engine/targets';
import { droneAt } from '../engine/twists';
import { paletteFor, withAlpha, type Theme } from './palette';
import type { TargetMark } from './targets';

/**
 * A small still picture of a round, for the menus: the skyline in the
 * world's colours, the gorillas, the targets and anything in the air, and
 * optionally the paths of throws drawn over it (the Daily Skyline's
 * results show every throw of the day this way). Nothing animates, so it
 * is the same with reduced motion.
 */
export interface PreviewPicture {
  round: Round;
  marks?: readonly TargetMark[];
  /** The gorilla to mark as the target. */
  target?: PlayerIndex | null;
  paths?: readonly PreviewPath[];
  theme: Theme;
  /** Light for the sky (see palette.ts); dusk when left out. */
  timeOfDay?: number;
}

export interface PreviewPath {
  points: readonly Point[];
  colour: string;
  /** The throw that counted is drawn bold; the rest thinner. */
  bold?: boolean;
  /** Where it came down, marked with a dot. */
  end?: Point;
}

export function drawCityPreview(canvas: HTMLCanvasElement, picture: PreviewPicture) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    (width - WORLD_WIDTH * scale) / 2,
    height - WORLD_HEIGHT * scale,
  );

  const { round, theme } = picture;
  const palette = paletteFor(round.world.id, picture.timeOfDay ?? 0, theme);
  const sky = ctx.createLinearGradient(0, 0, 0, STREET_Y);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.6, palette.skyMiddle);
  sky.addColorStop(1, palette.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  drawSkyBody(ctx, SKY_BODY_COLOURS[round.world.id]);

  drawAir(ctx, round);
  round.terrain.buildings.forEach((building, index) => {
    ctx.fillStyle = palette.facades[index % palette.facades.length] ?? palette.midCity;
    ctx.fillRect(building.x, building.top, building.width, STREET_Y - building.top);
    ctx.fillStyle = withAlpha(palette.windowLit[0] ?? '#ffd27a', 0.5);
    for (const window of building.windows) {
      if (window.lit) ctx.fillRect(window.x, window.y, window.width, window.height);
    }
  });
  ctx.globalCompositeOperation = 'destination-out';
  for (const crater of round.terrain.craters) {
    ctx.beginPath();
    ctx.arc(crater.x, crater.y, crater.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = palette.street;
  ctx.fillRect(0, STREET_Y, WORLD_WIDTH, WORLD_HEIGHT - STREET_Y);

  for (const mark of picture.marks ?? []) drawMark(ctx, mark);
  round.gorillas.forEach((gorilla, index) => {
    if (!isOffstage(gorilla)) drawGorilla(ctx, gorilla, picture.target === index);
  });
  for (const path of picture.paths ?? []) drawPath(ctx, path);
}

/** The face in each world's sky: the Sun, Earth from the Moon, Phobos, Io. */
const SKY_BODY_COLOURS: Record<Round['world']['id'], string> = {
  earth: '#ffd23f',
  moon: '#5fb4ff',
  mars: '#c9b8a8',
  jupiter: '#f5c46b',
};

function drawSkyBody(ctx: CanvasRenderingContext2D, colour: string) {
  const glow = ctx.createRadialGradient(SUN.x, SUN.y, 2, SUN.x, SUN.y, SUN.radius * 2.4);
  glow.addColorStop(0, withAlpha(colour, 0.6));
  glow.addColorStop(1, withAlpha(colour, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(SUN.x - 40, SUN.y - 40, 80, 80);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(SUN.x, SUN.y, SUN.radius - 3, 0, Math.PI * 2);
  ctx.fill();
}

/** A gorilla's silhouette over its roof; the target in red, with a ring over it. */
function drawGorilla(ctx: CanvasRenderingContext2D, gorilla: Gorilla, target: boolean) {
  const x = gorilla.x + 15;
  const colour = target ? '#ff5d5d' : '#ff9a4a';
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(x, gorilla.y + 20, 12, 10, 0, 0, Math.PI * 2);
  ctx.arc(x, gorilla.y + 7, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#ffffff', 0.35);
  ctx.beginPath();
  ctx.arc(x, gorilla.y + 8, 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (!target) return;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, gorilla.y - 12, 6, 0, Math.PI * 2);
  ctx.moveTo(x - 10, gorilla.y - 12);
  ctx.lineTo(x + 10, gorilla.y - 12);
  ctx.moveTo(x, gorilla.y - 22);
  ctx.lineTo(x, gorilla.y - 2);
  ctx.stroke();
}

function drawAir(ctx: CanvasRenderingContext2D, round: Round) {
  const { jetStream, dustDevil, drone } = round.hazards;
  if (jetStream) {
    ctx.fillStyle = 'rgb(160 220 255 / 0.18)';
    ctx.fillRect(0, jetStream.top, WORLD_WIDTH, jetStream.bottom - jetStream.top);
  }
  if (dustDevil) {
    ctx.fillStyle = 'rgb(255 170 110 / 0.22)';
    ctx.fillRect(
      dustDevil.x - dustDevil.width / 2,
      dustDevil.top,
      dustDevil.width,
      STREET_Y - dustDevil.top,
    );
  }
  if (drone) {
    const box = droneAt(drone, 0);
    ctx.fillStyle = '#ff3fa4';
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
}

function drawMark(ctx: CanvasRenderingContext2D, mark: TargetMark) {
  switch (mark.kind) {
    case 'crate':
      ctx.fillStyle = '#c98a45';
      ctx.fillRect(mark.x - CRATE_SIZE / 2, mark.y - CRATE_SIZE / 2, CRATE_SIZE, CRATE_SIZE);
      break;
    case 'bell':
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, BELL_RADIUS + 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'hoop':
      ctx.strokeStyle = '#ff6fd8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, HOOP_RADIUS + 1.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'pad': {
      const reach = mark.reach ?? 30;
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(mark.x - reach, mark.y - 3, reach * 2, 4);
      ctx.fillStyle = '#ff5d5d';
      ctx.fillRect(mark.x - reach / 6, mark.y - 3, reach / 3, 4);
      break;
    }
  }
}

function drawPath(ctx: CanvasRenderingContext2D, path: PreviewPath) {
  ctx.save();
  ctx.strokeStyle = path.colour;
  ctx.lineWidth = path.bold ? 3 : 1.6;
  ctx.lineJoin = 'round';
  ctx.setLineDash(path.bold ? [] : [5, 4]);
  ctx.beginPath();
  path.points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  if (path.end) {
    ctx.setLineDash([]);
    ctx.fillStyle = path.colour;
    ctx.beginPath();
    ctx.arc(path.end.x, path.end.y, path.bold ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
