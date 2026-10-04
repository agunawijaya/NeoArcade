import type { Season } from '../engine/living-weather';
import { lit, type Lighting } from './colour';

/**
 * The things beside the road, each drawn standing on the ground at (x, y)
 * and `size` pixels tall, in daylight colours that `lit` adjusts for the hour
 * and the weather. `variant` (0–1) gives each copy its own small
 * differences, so a row of barns is not a row of clones.
 */
export interface SceneEnv {
  light: Lighting;
  season: Season;
  /** Snow on the ground. */
  snow: boolean;
  /** Seconds, for anything that moves on its own (a pumpjack, a windmill). */
  time: number;
  /** 0 near … 1 at the horizon: things far away fade into the haze. */
  distance: number;
  reducedMotion: boolean;
}

export type Painter = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  variant: number,
  env: SceneEnv,
) => void;

const paint = (colour: string, env: SceneEnv) => lit(colour, env.light, env.distance);

function foliage(env: SceneEnv, summer: string, autumn: string, bare: string): string {
  if (env.season === 'autumn') return autumn;
  if (env.season === 'winter') return bare;
  return summer;
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function snowCap(ctx: CanvasRenderingContext2D, env: SceneEnv, draw: () => void) {
  if (!env.snow) return;
  ctx.fillStyle = paint('#f4f7fb', env);
  draw();
}

// ——— Trees and plants ———

const ponderosa: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint('#6b4a32', env);
  ctx.fillRect(x - size * 0.035, y - size * 0.55, size * 0.07, size * 0.55);
  ctx.fillStyle = paint(variant > 0.5 ? '#3f6b3a' : '#476f3c', env);
  for (let clump = 0; clump < 4; clump++) {
    const cy = y - size * (0.45 + clump * 0.16);
    const width = size * (0.2 - clump * 0.025);
    blob(ctx, x + (clump % 2 === 0 ? -1 : 1) * size * 0.03, cy, width, size * 0.09);
  }
  snowCap(ctx, env, () => blob(ctx, x, y - size * 0.92, size * 0.09, size * 0.03));
};

const fir: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint('#4a3426', env);
  ctx.fillRect(x - size * 0.03, y - size * 0.15, size * 0.06, size * 0.15);
  ctx.fillStyle = paint(variant > 0.5 ? '#2f5a3b' : '#355f40', env);
  const tiers = 4;
  for (let tier = 0; tier < tiers; tier++) {
    const bottom = y - size * 0.1 - tier * size * 0.2;
    const half = size * (0.26 - tier * 0.05);
    ctx.beginPath();
    ctx.moveTo(x - half, bottom);
    ctx.lineTo(x, bottom - size * 0.36);
    ctx.lineTo(x + half, bottom);
    ctx.closePath();
    ctx.fill();
  }
  snowCap(ctx, env, () => {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.06, y - size * 0.83);
    ctx.lineTo(x, y - size * 1.0);
    ctx.lineTo(x + size * 0.06, y - size * 0.83);
    ctx.fill();
  });
};

const pine: Painter = (ctx, x, y, size, variant, env) => {
  ctx.strokeStyle = paint('#5a3e2a', env);
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + (variant - 0.5) * size * 0.08, y - size * 0.75);
  ctx.stroke();
  ctx.fillStyle = paint('#3e6436', env);
  blob(ctx, x + (variant - 0.5) * size * 0.1, y - size * 0.85, size * 0.16, size * 0.12);
  blob(ctx, x - size * 0.08, y - size * 0.74, size * 0.1, size * 0.07);
  blob(ctx, x + size * 0.09, y - size * 0.7, size * 0.09, size * 0.06);
};

const roundTree =
  (summer: string, autumn: string, bare: string, trunk = '#5b4030'): Painter =>
  (ctx, x, y, size, variant, env) => {
    ctx.fillStyle = paint(trunk, env);
    ctx.fillRect(x - size * 0.04, y - size * 0.45, size * 0.08, size * 0.45);
    const leaves = foliage(env, summer, autumn, bare);
    if (env.season === 'winter' && !env.snow) {
      ctx.strokeStyle = paint(trunk, env);
      ctx.lineWidth = size * 0.025;
      for (let branch = -2; branch <= 2; branch++) {
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.4);
        ctx.lineTo(x + branch * size * 0.12, y - size * (0.75 + Math.abs(branch) * -0.05));
        ctx.stroke();
      }
      return;
    }
    ctx.fillStyle = paint(leaves, env);
    const r = size * (0.24 + variant * 0.06);
    blob(ctx, x, y - size * 0.62, r, r * 0.85);
    blob(ctx, x - r * 0.6, y - size * 0.5, r * 0.7, r * 0.6);
    blob(ctx, x + r * 0.6, y - size * 0.52, r * 0.7, r * 0.6);
    ctx.fillStyle = paint('#ffffff', env);
    ctx.globalAlpha = 0.08;
    blob(ctx, x - r * 0.3, y - size * 0.72, r * 0.5, r * 0.35);
    ctx.globalAlpha = 1;
    snowCap(ctx, env, () => blob(ctx, x, y - size * 0.82, r * 0.8, r * 0.18));
  };

const oak = roundTree('#4f7a37', '#b8762e', '#6d5a45');
const maple = roundTree('#4a8a3c', '#d9532b', '#6a5544');
const mesquite: Painter = (ctx, x, y, size, variant, env) =>
  roundTree('#7b8a4a', '#8c8448', '#7b6c50', '#4d3a2c')(ctx, x, y, size * 0.6, variant, env);

const birch: Painter = (ctx, x, y, size, _variant, env) => {
  ctx.fillStyle = paint('#e8e4da', env);
  ctx.fillRect(x - size * 0.025, y - size * 0.7, size * 0.05, size * 0.7);
  ctx.fillStyle = paint('#3a3a3a', env);
  for (let mark = 0; mark < 4; mark++)
    ctx.fillRect(x - size * 0.025, y - size * (0.15 + mark * 0.14), size * 0.03, size * 0.015);
  ctx.fillStyle = paint(foliage(env, '#7fae4a', '#e7c240', '#9a8f7c'), env);
  if (env.season !== 'winter') {
    blob(ctx, x, y - size * 0.72, size * 0.14, size * 0.2);
    blob(ctx, x + size * 0.06, y - size * 0.55, size * 0.1, size * 0.12);
  }
};

const fanPalm: Painter = (ctx, x, y, size, variant, env) => {
  const lean = (variant - 0.5) * size * 0.12;
  ctx.strokeStyle = paint('#7a6248', env);
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 0.3, y - size * 0.5, x + lean, y - size * 0.92);
  ctx.stroke();
  ctx.fillStyle = paint('#4f7d3a', env);
  for (let frond = 0; frond < 7; frond++) {
    const angle = Math.PI * (1.05 + (frond / 6) * 0.9);
    ctx.beginPath();
    ctx.ellipse(
      x + lean + Math.cos(angle) * size * 0.1,
      y - size * 0.95 + Math.sin(angle) * size * 0.06,
      size * 0.12,
      size * 0.03,
      angle,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = paint('#8a7350', env);
  blob(ctx, x + lean, y - size * 0.86, size * 0.04, size * 0.07);
};

const royalPalm: Painter = (ctx, x, y, size, _variant, env) => {
  ctx.fillStyle = paint('#c9c2b0', env);
  ctx.fillRect(x - size * 0.03, y - size * 0.8, size * 0.06, size * 0.8);
  ctx.strokeStyle = paint('#3f7a3a', env);
  ctx.lineWidth = size * 0.025;
  for (let frond = 0; frond < 8; frond++) {
    const angle = (frond / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.82);
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * size * 0.14,
      y - size * 0.9,
      x + Math.cos(angle) * size * 0.25,
      y - size * 0.78 + Math.abs(Math.sin(angle)) * size * 0.05,
    );
    ctx.stroke();
  }
};

const cypress: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint('#5d4a3a', env);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, y);
  ctx.lineTo(x - size * 0.04, y - size * 0.35);
  ctx.lineTo(x + size * 0.04, y - size * 0.35);
  ctx.lineTo(x + size * 0.12, y);
  ctx.fill();
  ctx.fillRect(x - size * 0.03, y - size * 0.75, size * 0.06, size * 0.45);
  ctx.fillStyle = paint('#4c6a3c', env);
  blob(ctx, x, y - size * 0.82, size * 0.2, size * 0.1);
  blob(ctx, x + size * 0.12, y - size * 0.7, size * 0.12, size * 0.07);
  ctx.fillStyle = paint('#8d9a7c', env);
  for (let strand = 0; strand < 5; strand++) {
    const sx = x - size * 0.15 + strand * size * 0.075;
    ctx.fillRect(sx, y - size * 0.78, size * 0.018, size * (0.12 + variant * 0.1));
  }
};

const joshua: Painter = (ctx, x, y, size, variant, env) => {
  ctx.strokeStyle = paint('#6b5a44', env);
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - size * 0.45);
  ctx.moveTo(x, y - size * 0.4);
  ctx.lineTo(x - size * 0.2, y - size * (0.65 + variant * 0.1));
  ctx.moveTo(x, y - size * 0.45);
  ctx.lineTo(x + size * 0.18, y - size * 0.7);
  ctx.moveTo(x + size * 0.1, y - size * 0.58);
  ctx.lineTo(x + size * 0.28, y - size * 0.62);
  ctx.stroke();
  ctx.fillStyle = paint('#5f7a3a', env);
  for (const [tx, ty] of [
    [-0.2, 0.68 + variant * 0.1],
    [0.18, 0.72],
    [0.28, 0.64],
  ] as const) {
    blob(ctx, x + tx * size, y - ty * size, size * 0.07, size * 0.09);
  }
  ctx.lineCap = 'butt';
};

const saguaro: Painter = (ctx, x, y, size, variant, env) => {
  ctx.strokeStyle = paint('#4f7a43', env);
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.11;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - size * 0.9);
  ctx.moveTo(x, y - size * 0.4);
  ctx.lineTo(x - size * 0.2, y - size * 0.4);
  ctx.lineTo(x - size * 0.2, y - size * (0.65 + variant * 0.1));
  if (variant > 0.3) {
    ctx.moveTo(x, y - size * 0.5);
    ctx.lineTo(x + size * 0.18, y - size * 0.5);
    ctx.lineTo(x + size * 0.18, y - size * 0.72);
  }
  ctx.stroke();
  ctx.strokeStyle = paint('#6f9a5c', env);
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.02, y - size * 0.05);
  ctx.lineTo(x - size * 0.02, y - size * 0.85);
  ctx.stroke();
  ctx.lineCap = 'butt';
};

const ocotillo: Painter = (ctx, x, y, size, variant, env) => {
  ctx.strokeStyle = paint('#5d5a3e', env);
  ctx.lineWidth = size * 0.02;
  for (let whip = -3; whip <= 3; whip++) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + whip * size * 0.05,
      y - size * 0.4,
      x + whip * size * (0.1 + variant * 0.03),
      y - size * 0.8,
    );
    ctx.stroke();
  }
  if (env.season === 'spring') {
    ctx.fillStyle = paint('#d9442b', env);
    for (let whip = -3; whip <= 3; whip += 2)
      blob(ctx, x + whip * size * 0.1, y - size * 0.82, size * 0.02, size * 0.04);
  }
};

const lowBush =
  (colour: string): Painter =>
  (ctx, x, y, size, variant, env) => {
    ctx.fillStyle = paint(colour, env);
    const width = size * (0.3 + variant * 0.2);
    blob(ctx, x, y - size * 0.1, width, size * 0.13);
    blob(ctx, x - width * 0.5, y - size * 0.06, width * 0.55, size * 0.09);
    blob(ctx, x + width * 0.55, y - size * 0.07, width * 0.5, size * 0.08);
    snowCap(ctx, env, () => blob(ctx, x, y - size * 0.2, width * 0.7, size * 0.04));
  };

const creosote = lowBush('#6f7a45');
const sage = lowBush('#8f9a7e');

const yucca: Painter = (ctx, x, y, size, variant, env) => {
  ctx.strokeStyle = paint('#6b7d45', env);
  ctx.lineWidth = size * 0.02;
  for (let blade = -5; blade <= 5; blade++) {
    const angle = -Math.PI / 2 + blade * 0.22;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.05);
    ctx.lineTo(x + Math.cos(angle) * size * 0.25, y - size * 0.05 + Math.sin(angle) * size * 0.25);
    ctx.stroke();
  }
  if (variant > 0.5) {
    ctx.strokeStyle = paint('#7a6a4a', env);
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.2);
    ctx.lineTo(x, y - size * 0.6);
    ctx.stroke();
    ctx.fillStyle = paint('#efe6c8', env);
    blob(ctx, x, y - size * 0.55, size * 0.03, size * 0.08);
  }
};

// ——— Farms and buildings ———

const barn: Painter = (ctx, x, y, size, variant, env) => {
  const w = size * 1.1;
  const h = size * 0.55;
  const red = variant > 0.75 ? '#7b6a58' : '#a3362b';
  ctx.fillStyle = paint(red, env);
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - size * 0.04, y - h);
  ctx.lineTo(x - w * 0.32, y - h - size * 0.25);
  ctx.lineTo(x + w * 0.32, y - h - size * 0.25);
  ctx.lineTo(x + w / 2 + size * 0.04, y - h);
  ctx.fillStyle = paint('#4a3f3a', env);
  ctx.fill();
  ctx.strokeStyle = paint('#f1e9da', env);
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeRect(x - size * 0.15, y - h * 0.75, size * 0.3, h * 0.75);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y - h * 0.75);
  ctx.lineTo(x + size * 0.15, y);
  ctx.moveTo(x + size * 0.15, y - h * 0.75);
  ctx.lineTo(x - size * 0.15, y);
  ctx.stroke();
  snowCap(ctx, env, () => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - size * 0.04, y - h);
    ctx.lineTo(x - w * 0.32, y - h - size * 0.25);
    ctx.lineTo(x + w * 0.32, y - h - size * 0.25);
    ctx.lineTo(x + w / 2 + size * 0.04, y - h);
    ctx.lineTo(x + w * 0.3, y - h - size * 0.17);
    ctx.lineTo(x - w * 0.3, y - h - size * 0.17);
    ctx.fill();
  });
};

const tobaccoBarn: Painter = (ctx, x, y, size, _variant, env) => {
  const w = size * 0.6;
  ctx.fillStyle = paint('#5a4636', env);
  ctx.fillRect(x - w / 2, y - size * 0.75, w, size * 0.75);
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - size * 0.05, y - size * 0.75);
  ctx.lineTo(x, y - size);
  ctx.lineTo(x + w / 2 + size * 0.05, y - size * 0.75);
  ctx.fillStyle = paint('#6e6a66', env);
  ctx.fill();
  ctx.fillStyle = paint('#3e3027', env);
  for (let board = 0; board < 5; board++)
    ctx.fillRect(x - w / 2 + board * (w / 5), y - size * 0.75, size * 0.015, size * 0.75);
};

const silo: Painter = (ctx, x, y, size, variant, env) => {
  const w = size * 0.26;
  const h = size * (0.9 + variant * 0.2);
  ctx.fillStyle = paint(variant > 0.5 ? '#d8d2c4' : '#8c9aa4', env);
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.beginPath();
  ctx.arc(x, y - h, w / 2, Math.PI, 0);
  ctx.fillStyle = paint('#9aa6ad', env);
  ctx.fill();
  ctx.fillStyle = paint('#000000', env);
  ctx.globalAlpha = 0.12;
  ctx.fillRect(x + w * 0.15, y - h, w * 0.35, h);
  ctx.globalAlpha = 1;
};

const farmhouse: Painter = (ctx, x, y, size, variant, env) => {
  const w = size * 0.75;
  const h = size * 0.45;
  ctx.fillStyle = paint(variant > 0.6 ? '#e9dfc9' : '#f3f1ea', env);
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - size * 0.05, y - h);
  ctx.lineTo(x, y - h - size * 0.28);
  ctx.lineTo(x + w / 2 + size * 0.05, y - h);
  ctx.fillStyle = paint('#5a4f4a', env);
  ctx.fill();
  const lamp = 1 - env.light.day;
  ctx.fillStyle = lamp > 0.4 ? `rgba(255, 210, 120, ${0.4 + lamp * 0.5})` : paint('#5c7486', env);
  ctx.fillRect(x - w * 0.3, y - h * 0.7, w * 0.16, h * 0.3);
  ctx.fillRect(x + w * 0.14, y - h * 0.7, w * 0.16, h * 0.3);
  ctx.fillStyle = paint('#6b4c3a', env);
  ctx.fillRect(x - w * 0.06, y - h * 0.55, w * 0.12, h * 0.55);
  snowCap(ctx, env, () => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - size * 0.05, y - h);
    ctx.lineTo(x, y - h - size * 0.28);
    ctx.lineTo(x + w / 2 + size * 0.05, y - h);
    ctx.lineTo(x, y - h - size * 0.2);
    ctx.fill();
  });
};

const windmill: Painter = (ctx, x, y, size, variant, env) => {
  ctx.strokeStyle = paint('#6d6a63', env);
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, y);
  ctx.lineTo(x - size * 0.02, y - size * 0.85);
  ctx.moveTo(x + size * 0.12, y);
  ctx.lineTo(x + size * 0.02, y - size * 0.85);
  for (let rung = 1; rung < 5; rung++) {
    const t = rung / 5;
    ctx.moveTo(x - size * 0.12 * (1 - t), y - size * 0.85 * t);
    ctx.lineTo(x + size * 0.12 * (1 - t), y - size * 0.85 * t);
  }
  ctx.stroke();
  const spin = env.reducedMotion ? variant * 6 : env.time * (1.5 + variant) + variant * 6;
  ctx.fillStyle = paint('#9a958c', env);
  for (let blade = 0; blade < 12; blade++) {
    const angle = spin + (blade / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.88);
    ctx.lineTo(x + Math.cos(angle) * size * 0.16, y - size * 0.88 + Math.sin(angle) * size * 0.16);
    ctx.lineTo(
      x + Math.cos(angle + 0.2) * size * 0.16,
      y - size * 0.88 + Math.sin(angle + 0.2) * size * 0.16,
    );
    ctx.fill();
  }
  ctx.fillRect(x, y - size * 0.9, size * 0.22, size * 0.03);
};

const elevator: Painter = (ctx, x, y, size, variant, env) => {
  const tubes = 3 + Math.floor(variant * 3);
  const tube = size * 0.18;
  ctx.fillStyle = paint('#d9d3c3', env);
  for (let index = 0; index < tubes; index++) {
    ctx.fillRect(x - (tubes * tube) / 2 + index * tube, y - size * 1.1, tube * 0.94, size * 1.1);
  }
  ctx.fillRect(x - tube * 0.6, y - size * 1.5, tube * 1.2, size * 0.42);
  ctx.fillStyle = paint('#000000', env);
  ctx.globalAlpha = 0.1;
  for (let index = 0; index < tubes; index++)
    ctx.fillRect(
      x - (tubes * tube) / 2 + index * tube + tube * 0.6,
      y - size * 1.1,
      tube * 0.3,
      size * 1.1,
    );
  ctx.globalAlpha = 1;
};

const pumpjack: Painter = (ctx, x, y, size, variant, env) => {
  const nod = Math.sin((env.reducedMotion ? 0 : env.time * 1.6) + variant * 6) * 0.22;
  ctx.fillStyle = paint('#4c4a46', env);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.1, y);
  ctx.lineTo(x, y - size * 0.45);
  ctx.lineTo(x + size * 0.1, y);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y - size * 0.45);
  ctx.rotate(nod);
  ctx.fillStyle = paint('#c8a238', env);
  ctx.fillRect(-size * 0.42, -size * 0.04, size * 0.7, size * 0.08);
  ctx.beginPath();
  ctx.arc(-size * 0.42, 0, size * 0.1, Math.PI * 0.5, Math.PI * 1.5);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = paint('#2e2c2a', env);
  ctx.lineWidth = Math.max(1, size * 0.015);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.48, y - size * 0.45 + Math.sin(nod) * -size * 0.4);
  ctx.lineTo(x - size * 0.48, y);
  ctx.stroke();
};

const derrick: Painter = (ctx, x, y, size, _variant, env) => {
  ctx.strokeStyle = paint('#5e5a52', env);
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.2, y);
  ctx.lineTo(x, y - size * 1.2);
  ctx.lineTo(x + size * 0.2, y);
  for (let rung = 1; rung < 7; rung++) {
    const t = rung / 7;
    ctx.moveTo(x - size * 0.2 * (1 - t), y - size * 1.2 * t);
    ctx.lineTo(x + size * 0.2 * (1 - t), y - size * 1.2 * t);
  }
  ctx.stroke();
};

const waterTower: Painter = (ctx, x, y, size, variant, env) => {
  ctx.strokeStyle = paint('#7d7f84', env);
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.18, y);
  ctx.lineTo(x - size * 0.12, y - size * 0.8);
  ctx.moveTo(x + size * 0.18, y);
  ctx.lineTo(x + size * 0.12, y - size * 0.8);
  ctx.stroke();
  ctx.fillStyle = paint(variant > 0.5 ? '#b9c3c9' : '#cdbf9d', env);
  blob(ctx, x, y - size * 0.95, size * 0.25, size * 0.17);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.25, y - size * 0.98);
  ctx.lineTo(x, y - size * 1.22);
  ctx.lineTo(x + size * 0.25, y - size * 0.98);
  ctx.fill();
};

const church: Painter = (ctx, x, y, size, _variant, env) => {
  const w = size * 0.5;
  ctx.fillStyle = paint('#f1efe8', env);
  ctx.fillRect(x - w / 2, y - size * 0.4, w, size * 0.4);
  ctx.fillRect(x - size * 0.08, y - size * 0.75, size * 0.16, size * 0.35);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.1, y - size * 0.75);
  ctx.lineTo(x, y - size * 1.1);
  ctx.lineTo(x + size * 0.1, y - size * 0.75);
  ctx.fill();
  ctx.fillStyle = paint('#5a5550', env);
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - size * 0.03, y - size * 0.4);
  ctx.lineTo(x, y - size * 0.6);
  ctx.lineTo(x + w / 2 + size * 0.03, y - size * 0.4);
  ctx.fill();
};

const factory: Painter = (ctx, x, y, size, variant, env) => {
  const w = size * 1.4;
  ctx.fillStyle = paint('#6d6a6a', env);
  ctx.fillRect(x - w / 2, y - size * 0.5, w, size * 0.5);
  ctx.fillStyle = paint('#55524f', env);
  for (let tooth = 0; tooth < 5; tooth++) {
    const tx = x - w / 2 + tooth * (w / 5);
    ctx.beginPath();
    ctx.moveTo(tx, y - size * 0.5);
    ctx.lineTo(tx, y - size * 0.68);
    ctx.lineTo(tx + w / 5, y - size * 0.5);
    ctx.fill();
  }
  const stacks = 1 + Math.floor(variant * 3);
  for (let stack = 0; stack < stacks; stack++) {
    const sx = x + w * 0.2 + stack * size * 0.16;
    ctx.fillStyle = paint('#7d5148', env);
    ctx.fillRect(sx, y - size * 1.3, size * 0.09, size * 0.8);
    const puff = env.reducedMotion ? 0 : (env.time * 0.3 + stack * 0.37 + variant) % 1;
    ctx.fillStyle = `rgba(190, 190, 186, ${0.35 * (1 - puff)})`;
    blob(
      ctx,
      sx + size * 0.05 + puff * size * 0.4,
      y - size * (1.35 + puff * 0.4),
      size * (0.08 + puff * 0.15),
      size * (0.06 + puff * 0.1),
    );
  }
};

const refinery: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint('#8a8f93', env);
  for (let tank = 0; tank < 2; tank++) {
    const tx = x - size * 0.5 + tank * size * 0.45;
    ctx.fillRect(tx, y - size * 0.35, size * 0.38, size * 0.35);
    blob(ctx, tx + size * 0.19, y - size * 0.35, size * 0.19, size * 0.05);
  }
  ctx.fillStyle = paint('#6f7478', env);
  ctx.fillRect(x + size * 0.45, y - size * 1.2, size * 0.08, size * 1.2);
  ctx.fillRect(x + size * 0.6, y - size * 0.9, size * 0.12, size * 0.9);
  const flicker = env.reducedMotion ? 0.8 : 0.7 + 0.3 * Math.sin(env.time * 9 + variant * 10);
  ctx.fillStyle = `rgba(255, 150, 60, ${flicker})`;
  blob(ctx, x + size * 0.49, y - size * 1.28, size * 0.04, size * 0.08 * flicker);
};

/** Roadside boards of the early 1980s: motels, diners, caves and fireworks. */
const BILLBOARDS: readonly { fill: string; ink: string; lines: readonly [string, string] }[] = [
  { fill: '#e8d36a', ink: '#2d2a28', lines: ['MOTEL', 'COLOR TV · POOL'] },
  { fill: '#d7563b', ink: '#fff4dc', lines: ['EAT', 'NEXT EXIT'] },
  { fill: '#4f8fc0', ink: '#ffffff', lines: ['SEE THE', 'CAVERNS'] },
  { fill: '#e9e4d8', ink: '#b3261e', lines: ['FIREWORKS', '2 MILES'] },
  { fill: '#2f6b4a', ink: '#f4f1e6', lines: ['TRUCKERS', 'WELCOME'] },
  { fill: '#f2a51a', ink: '#2d2a28', lines: ['PECANS', 'FUDGE · GIFTS'] },
];

const billboard: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint('#55504a', env);
  ctx.fillRect(x - size * 0.4, y - size * 0.4, size * 0.04, size * 0.4);
  ctx.fillRect(x + size * 0.36, y - size * 0.4, size * 0.04, size * 0.4);
  const board =
    BILLBOARDS[Math.floor(variant * BILLBOARDS.length)] ??
    (BILLBOARDS[0] as (typeof BILLBOARDS)[number]);
  ctx.fillStyle = paint('#3a3633', env);
  ctx.fillRect(x - size * 0.52, y - size * 0.87, size * 1.04, size * 0.49);
  ctx.fillStyle = paint(board.fill, env);
  ctx.fillRect(x - size * 0.5, y - size * 0.85, size, size * 0.45);
  ctx.fillStyle = paint(board.ink, env);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${size * 0.17}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(board.lines[0], x, y - size * 0.7, size * 0.92);
  ctx.font = `700 ${size * 0.09}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(board.lines[1], x, y - size * 0.53, size * 0.92);
};

const cattle: Painter = (ctx, x, y, size, variant, env) => {
  const colour = variant > 0.6 ? '#2e2a27' : variant > 0.3 ? '#7a4a2e' : '#e9e2d5';
  ctx.fillStyle = paint(colour, env);
  const w = size * 0.32;
  ctx.fillRect(x - w / 2, y - size * 0.24, w, size * 0.13);
  ctx.fillRect(x - w / 2, y - size * 0.11, size * 0.03, size * 0.11);
  ctx.fillRect(x + w / 2 - size * 0.03, y - size * 0.11, size * 0.03, size * 0.11);
  ctx.fillRect(
    x + (variant > 0.5 ? w / 2 : -w / 2 - size * 0.08),
    y - size * 0.25,
    size * 0.08,
    size * 0.07,
  );
};

const haybale: Painter = (ctx, x, y, size, _variant, env) => {
  ctx.fillStyle = paint('#c9a65a', env);
  blob(ctx, x, y - size * 0.11, size * 0.12, size * 0.11);
  ctx.strokeStyle = paint('#9c7c3a', env);
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.beginPath();
  ctx.ellipse(x, y - size * 0.11, size * 0.06, size * 0.055, 0, 0, Math.PI * 2);
  ctx.stroke();
};

const rock: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint(variant > 0.5 ? '#8a7a6a' : '#9a8b7a', env);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.2, y);
  ctx.lineTo(x - size * 0.14, y - size * 0.14);
  ctx.lineTo(x + size * 0.02, y - size * 0.2);
  ctx.lineTo(x + size * 0.18, y - size * 0.1);
  ctx.lineTo(x + size * 0.22, y);
  ctx.fill();
  snowCap(ctx, env, () => blob(ctx, x, y - size * 0.17, size * 0.13, size * 0.04));
};

const spire: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint('#b35a3c', env);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.18, y);
  ctx.lineTo(x - size * 0.1, y - size * (0.9 + variant * 0.3));
  ctx.lineTo(x + size * 0.08, y - size * (0.95 + variant * 0.3));
  ctx.lineTo(x + size * 0.16, y);
  ctx.fill();
  ctx.fillStyle = paint('#8c4430', env);
  ctx.fillRect(
    x + size * 0.02,
    y - size * (0.9 + variant * 0.3),
    size * 0.08,
    size * (0.9 + variant * 0.3),
  );
};

const reeds: Painter = (ctx, x, y, size, variant, env) => {
  ctx.fillStyle = paint('#5d7d8f', env);
  ctx.globalAlpha = 0.7;
  blob(ctx, x, y - size * 0.02, size * 0.5, size * 0.05);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = paint('#7d8a4a', env);
  ctx.lineWidth = Math.max(1, size * 0.012);
  for (let reed = 0; reed < 9; reed++) {
    const rx = x - size * 0.4 + reed * size * 0.1;
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.lineTo(rx + (variant - 0.5) * size * 0.05, y - size * (0.15 + ((reed * 37) % 10) / 50));
    ctx.stroke();
  }
};

const stoneWall: Painter = (ctx, x, y, size, _variant, env) => {
  ctx.fillStyle = paint('#8d8a82', env);
  for (let stone = 0; stone < 8; stone++) {
    blob(ctx, x - size * 0.6 + stone * size * 0.16, y - size * 0.05, size * 0.09, size * 0.06);
  }
};

const orchard: Painter = (ctx, x, y, size, variant, env) => {
  const tree = roundTree('#4d7f3a', '#b28a3a', '#6d5a46');
  for (let row = 0; row < 3; row++)
    tree(ctx, x - size * 0.5 + row * size * 0.5, y, size * 0.5, (variant + row * 0.3) % 1, env);
  if (env.season !== 'winter') {
    ctx.fillStyle = paint('#f0962f', env);
    for (let fruit = 0; fruit < 6; fruit++)
      blob(ctx, x - size * 0.55 + fruit * size * 0.2, y - size * 0.3, size * 0.02, size * 0.02);
  }
};

const cottonRow: Painter = (ctx, x, y, size, _variant, env) => {
  ctx.fillStyle = paint('#6c7a45', env);
  ctx.fillRect(x - size * 0.6, y - size * 0.06, size * 1.2, size * 0.06);
  if (env.season === 'autumn' || env.season === 'summer') {
    ctx.fillStyle = paint('#f6f3ea', env);
    for (let boll = 0; boll < 10; boll++)
      blob(ctx, x - size * 0.55 + boll * size * 0.12, y - size * 0.07, size * 0.025, size * 0.02);
  }
};

const cornRow: Painter = (ctx, x, y, size, variant, env) => {
  const colour =
    env.season === 'autumn' ? '#c9a95a' : env.season === 'winter' ? '#9a8a68' : '#6f9a3a';
  ctx.strokeStyle = paint(colour, env);
  ctx.lineWidth = Math.max(1, size * 0.015);
  const tall = env.season === 'spring' ? 0.08 : env.season === 'winter' ? 0.04 : 0.2;
  for (let stalk = 0; stalk < 14; stalk++) {
    const sx = x - size * 0.6 + stalk * size * 0.09;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + (variant - 0.5) * size * 0.02, y - size * tall);
    ctx.stroke();
  }
};

const wheatField: Painter = (ctx, x, y, size, _variant, env) => {
  const colour =
    env.season === 'summer' ? '#d9b65a' : env.season === 'spring' ? '#8aab4a' : '#b9a06a';
  ctx.fillStyle = paint(colour, env);
  ctx.fillRect(x - size * 0.8, y - size * 0.05, size * 1.6, size * 0.05);
};

const tunnelPortal: Painter = (ctx, x, y, size, _variant, env) => {
  ctx.fillStyle = paint('#6d6a63', env);
  ctx.fillRect(x - size * 0.6, y - size * 0.8, size * 1.2, size * 0.8);
  ctx.fillStyle = paint('#1d1b1a', env);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.4, y);
  ctx.lineTo(x - size * 0.4, y - size * 0.4);
  ctx.arc(x, y - size * 0.4, size * 0.4, Math.PI, 0);
  ctx.lineTo(x + size * 0.4, y);
  ctx.fill();
};

export const PAINTERS = {
  ponderosa,
  fir,
  pine,
  oak,
  maple,
  mesquite,
  birch,
  'fan-palm': fanPalm,
  'royal-palm': royalPalm,
  cypress,
  joshua,
  saguaro,
  ocotillo,
  creosote,
  sage,
  yucca,
  barn,
  'tobacco-barn': tobaccoBarn,
  silo,
  farmhouse,
  windmill,
  elevator,
  pumpjack,
  derrick,
  'water-tower': waterTower,
  church,
  factory,
  refinery,
  billboard,
  cattle,
  haybale,
  rock,
  spire,
  reeds,
  'stone-wall': stoneWall,
  orchard,
  cotton: cottonRow,
  corn: cornRow,
  wheat: wheatField,
  tunnel: tunnelPortal,
} satisfies Record<string, Painter>;

export type SceneryKind = keyof typeof PAINTERS;

/** How tall each kind stands, relative to a tree. */
export const HEIGHTS: Readonly<Record<SceneryKind, number>> = {
  ponderosa: 1.25,
  fir: 1.2,
  pine: 1.15,
  oak: 0.9,
  maple: 0.9,
  mesquite: 0.6,
  birch: 0.85,
  'fan-palm': 1.15,
  'royal-palm': 1.1,
  cypress: 1,
  joshua: 0.7,
  saguaro: 0.95,
  ocotillo: 0.55,
  creosote: 0.35,
  sage: 0.3,
  yucca: 0.45,
  barn: 0.9,
  'tobacco-barn': 0.75,
  silo: 1.05,
  farmhouse: 0.75,
  windmill: 1.1,
  elevator: 1.5,
  pumpjack: 0.55,
  derrick: 1.2,
  'water-tower': 1.25,
  church: 1,
  factory: 1.1,
  refinery: 1.2,
  billboard: 0.85,
  cattle: 0.6,
  haybale: 0.45,
  rock: 0.5,
  spire: 1.3,
  reeds: 0.5,
  'stone-wall': 0.4,
  orchard: 0.75,
  cotton: 0.4,
  corn: 0.45,
  wheat: 0.4,
  tunnel: 1.3,
};
