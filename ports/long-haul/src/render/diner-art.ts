import type { Diner } from '../data/diners';
import type { RegionId } from '../data/regions';
import type { CargoId } from '../engine/cargo';
import type { ConditionId } from '../engine/conditions';
import { css, lit, litRgb, mix, rgb, shade, type Lighting } from './colour';
import { paintFarLayer, type FarLayer } from './horizon';
import { LANDSCAPES } from './landscapes';
import { paintRigSide, type RigPaint } from './rig';
import { lightingFor, paintSky } from './sky';
import { daylight } from './sun';
import { paintPrecipitation } from './weather-fx';

/**
 * The truck stop, seen across the lot: a stainless railcar diner under its
 * neon, the fuel island with your own rig at the pump, other rigs parked
 * for the night, the country of the region behind, and the sky of the hour.
 * Drawn on a board 300 units high and as wide as the canvas needs.
 */
const H = 264;
const HORIZON = 172;

export interface DinerFrame {
  diner: Diner;
  /** Diesel price in cents, for the pump and the pole sign. */
  dieselCents: number;
  time: number;
  reducedMotion: boolean;
  region: RegionId;
  sunAltitude: number;
  sunArc: number;
  condition: ConditionId;
  snow: boolean;
  paint: RigPaint;
  cargo: CargoId;
}

const PARKED: readonly RigPaint[] = [
  { body: '#1f6e45', trim: '#e2e2de', stripe: '#f4f1e6' },
  { body: '#2a4f8f', trim: '#d9dde3', stripe: '#e8b04a' },
  { body: '#e8e4d8', trim: '#9aa0a8', stripe: '#c8312a' },
];

export function paintDiner(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: DinerFrame,
) {
  const scale = height / H;
  const W = Math.max(520, width / scale);
  const light = lightingFor(frame.sunAltitude, frame.condition);
  const night = 1 - daylight(frame.sunAltitude);
  const cx = W / 2;

  ctx.save();
  ctx.scale(scale, scale);
  // Centre the scene if the board came out narrower than the canvas allows.
  ctx.translate((width / scale - W) / 2, 0);

  paintSky(
    ctx,
    W,
    HORIZON,
    {
      sunAltitude: frame.sunAltitude,
      sunArc: frame.sunArc,
      condition: frame.condition,
      time: frame.time,
      scroll: 0,
    },
    frame.reducedMotion,
  );
  const landscape = LANDSCAPES[frame.region];
  const seed = [...frame.region].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
  landscape.far.forEach((layer, index) => {
    const far: FarLayer = { ...layer, seed: seed + index * 977, snow: layer.snow || frame.snow };
    paintFarLayer(ctx, far, { width: W, horizon: HORIZON, scroll: 900, light, night, alpha: 1 });
  });

  paintLot(ctx, W, light, frame.snow, landscape.groundFar);
  paintLightPoles(ctx, [cx - 360, cx + 330], light, night);
  paintParkedRigs(ctx, cx, W, light, night, frame);
  paintDinerBuilding(ctx, cx - 20, light, night, frame);
  paintPoleSign(ctx, cx + 300, light, night, frame);
  paintFuelIsland(ctx, cx - 250, light, night, frame);
  paintLotLines(ctx, W, light);

  if (night > 0.3) {
    const pool = ctx.createRadialGradient(cx - 210, 205, 10, cx - 210, 205, 170);
    pool.addColorStop(0, `rgba(255, 236, 190, ${0.3 * night})`);
    pool.addColorStop(1, 'rgba(255, 236, 190, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(cx - 400, 110, 380, 190);
  }
  ctx.restore();

  paintPrecipitation(ctx, {
    width,
    height,
    condition: frame.condition,
    time: frame.time,
    wind: 0,
    night,
    reducedMotion: frame.reducedMotion,
  });
}

function paintLot(
  ctx: CanvasRenderingContext2D,
  W: number,
  light: Lighting,
  snow: boolean,
  groundFar: string,
) {
  // A strip of open country at the horizon, then the lot.
  ctx.fillStyle = lit(snow ? '#e9edf2' : groundFar, light, 0.5);
  ctx.fillRect(0, HORIZON, W, 14);
  const asphalt = ctx.createLinearGradient(0, HORIZON + 12, 0, H);
  asphalt.addColorStop(0, lit(snow ? '#c9ced6' : '#6e6f70', light, 0.3));
  asphalt.addColorStop(1, lit(snow ? '#aeb4bd' : '#4a4b4e', light, 0));
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, HORIZON + 12, W, H - HORIZON);
  // Oil stains and patches where the rigs idle.
  ctx.fillStyle = `rgba(20, 18, 16, ${0.12 + light.day * 0.08})`;
  for (let patch = 0; patch < 14; patch++) {
    const x = ((patch * 211) % W) + 10;
    const y = 214 + ((patch * 37) % 46);
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + (patch % 4) * 6, 3 + (patch % 3), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintLotLines(ctx: CanvasRenderingContext2D, W: number, light: Lighting) {
  ctx.strokeStyle = lit('#e8e2cf', light, 0.1);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.6;
  for (let x = -40; x < W + 40; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 240);
    ctx.lineTo(x + 18, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintLightPoles(
  ctx: CanvasRenderingContext2D,
  xs: readonly number[],
  light: Lighting,
  night: number,
) {
  for (const x of xs) {
    ctx.fillStyle = lit('#55595f', light, 0.2);
    ctx.fillRect(x - 1.5, 70, 3, 140);
    ctx.fillRect(x - 1.5, 70, 22, 3);
    ctx.fillStyle = night > 0.3 ? '#ffd9a0' : lit('#c9ccd1', light, 0.2);
    ctx.fillRect(x + 14, 72, 10, 3);
    if (night > 0.3) {
      const glow = ctx.createRadialGradient(x + 19, 76, 1, x + 19, 76, 40);
      glow.addColorStop(0, `rgba(255, 210, 140, ${0.55 * night})`);
      glow.addColorStop(1, 'rgba(255, 210, 140, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 25, 36, 90, 80);
    }
  }
}

function paintParkedRigs(
  ctx: CanvasRenderingContext2D,
  cx: number,
  W: number,
  light: Lighting,
  night: number,
  frame: DinerFrame,
) {
  const cargoes: readonly CargoId[] = ['freight', 'mail', 'oranges'];
  // A row along the back of the lot, beyond the diner's right end.
  for (let index = 0; index < 3; index++) {
    const x = cx + 210 + index * 150;
    if (x > W + 20) break;
    paintRigSide(ctx, x, 205, 140, {
      paint: PARKED[index] ?? frame.paint,
      cargo: cargoes[index] ?? 'freight',
      light,
      wheel: index,
      bob: 0,
      night,
      smoke: 0,
      time: frame.time,
      braking: false,
      police: false,
      reducedMotion: true,
      parked: true,
    });
  }
  // And one on the far left, waiting its turn.
  if (cx - 470 > -140) {
    paintRigSide(ctx, cx - 600, 205, 140, {
      paint: PARKED[2] ?? frame.paint,
      cargo: 'freight',
      light,
      wheel: 2,
      bob: 0,
      night,
      smoke: 0,
      time: frame.time,
      braking: false,
      police: false,
      reducedMotion: true,
      parked: true,
    });
  }
}

/** A railcar diner: a barrel roof, stainless fluting, an enamel band, a vestibule with the door. */
function paintDinerBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  light: Lighting,
  night: number,
  frame: DinerFrame,
) {
  const { diner } = frame;
  const width = 300;
  const top = 112;
  const bottom = 196;

  // Shadow on the lot.
  ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + light.day * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(x + width / 2, bottom + 2, width / 2 + 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Brick footing.
  ctx.fillStyle = lit('#7a3b2e', light, 0.1);
  ctx.fillRect(x + 6, bottom - 12, width - 12, 12);
  ctx.strokeStyle = lit('#5c2a20', light, 0.1);
  ctx.lineWidth = 0.6;
  for (let row = bottom - 12; row < bottom; row += 4) {
    ctx.beginPath();
    ctx.moveTo(x + 6, row);
    ctx.lineTo(x + width - 6, row);
    ctx.stroke();
  }

  // The barrel roof.
  ctx.fillStyle = lit('#5b6068', light, 0.12);
  ctx.beginPath();
  ctx.moveTo(x - 2, top + 6);
  ctx.quadraticCurveTo(x + width / 2, top - 16, x + width + 2, top + 6);
  ctx.lineTo(x + width + 2, top + 10);
  ctx.lineTo(x - 2, top + 10);
  ctx.closePath();
  ctx.fill();

  // Stainless body, bright where it faces the sky.
  const steel = ctx.createLinearGradient(0, top + 8, 0, bottom - 12);
  steel.addColorStop(0, lit('#e9edf1', light, 0.1));
  steel.addColorStop(0.45, lit('#aab2bb', light, 0.1));
  steel.addColorStop(0.55, lit('#d5dbe1', light, 0.1));
  steel.addColorStop(1, lit('#8f98a3', light, 0.1));
  ctx.fillStyle = steel;
  roundRect(ctx, x, top + 8, width, bottom - 12 - (top + 8), 10);
  ctx.fill();

  // The enamel band and the fluting under it.
  ctx.fillStyle = lit(diner.awning, light, 0.08);
  ctx.fillRect(x + 2, top + 54, width - 4, 7);
  ctx.fillStyle = lit(shade(rgb(diner.awning), -0.25), light, 0.08);
  ctx.fillRect(x + 2, top + 13, width - 4, 3);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + light.day * 0.25})`;
  ctx.lineWidth = 0.7;
  for (let row = top + 64; row < bottom - 13; row += 3) {
    ctx.beginPath();
    ctx.moveTo(x + 4, row);
    ctx.lineTo(x + width - 4, row);
    ctx.stroke();
  }

  // Windows: the sky reflected by day, the counter and its customers at night.
  const windows = 10;
  const pane = 21;
  const gap = (width - 24 - windows * pane) / (windows - 1);
  const vestibule = { left: x + width / 2 - 22, right: x + width / 2 + 22 };
  for (let index = 0; index < windows; index++) {
    const wx = x + 12 + index * (pane + gap);
    if (wx + pane > vestibule.left - 2 && wx < vestibule.right + 2) continue;
    paintWindow(ctx, wx, top + 22, pane, 28, light, night, index, frame);
  }

  // The vestibule, standing proud of the car, with the door.
  ctx.fillStyle = lit('#c5ccd3', light, 0.1);
  ctx.fillRect(vestibule.left, top + 2, 44, bottom - top - 2);
  ctx.fillStyle = lit(diner.awning, light, 0.08);
  ctx.fillRect(vestibule.left - 3, top - 2, 50, 8);
  ctx.fillStyle = night > 0.3 ? '#ffcf8a' : lit('#7d9cb5', light, 0.1);
  ctx.fillRect(vestibule.left + 12, top + 24, 20, bottom - top - 26);
  ctx.fillStyle = lit('#3b3f45', light, 0.1);
  ctx.fillRect(vestibule.left + 21.5, top + 24, 1, bottom - top - 26);
  ctx.fillStyle = night > 0.3 ? '#ff5a4f' : '#c8312a';
  ctx.font = '800 9px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EAT', vestibule.left + 22, top + 14);
  // Steps.
  ctx.fillStyle = lit('#9a9488', light, 0.1);
  ctx.fillRect(vestibule.left + 6, bottom - 3, 32, 3);
  ctx.fillRect(vestibule.left + 9, bottom, 26, 3);

  paintRoofSign(ctx, x + width / 2, top - 14, light, night, frame);
}

function paintWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  light: Lighting,
  night: number,
  index: number,
  frame: DinerFrame,
) {
  ctx.fillStyle = lit('#3a3f46', light, 0.1);
  roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 3);
  ctx.fill();
  if (night > 0.3) {
    const warm = ctx.createLinearGradient(0, y, 0, y + h);
    warm.addColorStop(0, '#ffd99a');
    warm.addColorStop(1, '#f2a65a');
    ctx.fillStyle = warm;
    roundRect(ctx, x, y, w, h, 2);
    ctx.fill();
    // Customers at the counter, and now and then a waitress with the pot.
    ctx.fillStyle = 'rgba(60, 34, 18, 0.65)';
    if (index % 3 !== 1) {
      const sway = frame.reducedMotion ? 0 : Math.sin(frame.time * 0.8 + index) * 0.8;
      ctx.beginPath();
      ctx.arc(x + w / 2 + sway, y + h - 12, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + w / 2 - 5 + sway, y + h - 9, 10, 9);
    }
    ctx.fillStyle = 'rgba(120, 70, 30, 0.35)';
    ctx.fillRect(x, y + h - 5, w, 5);
  } else {
    const glass = ctx.createLinearGradient(x, y, x + w, y + h);
    glass.addColorStop(0, css(mix(litRgb('#9cc3e0', light, 0.1), [255, 255, 255], 0.25)));
    glass.addColorStop(0.5, lit('#5f87a6', light, 0.1));
    glass.addColorStop(1, lit('#7ea6c4', light, 0.1));
    ctx.fillStyle = glass;
    roundRect(ctx, x, y, w, h, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h - 4);
    ctx.lineTo(x + w - 6, y + 4);
    ctx.stroke();
  }
}

/** The name on the roof: painted letters by day, neon tubing after dark. */
function paintRoofSign(
  ctx: CanvasRenderingContext2D,
  centre: number,
  bottom: number,
  light: Lighting,
  night: number,
  frame: DinerFrame,
) {
  const { diner } = frame;
  const width = 210;
  const height = 36;
  const left = centre - width / 2;
  const top = bottom - height - 10;
  ctx.fillStyle = lit('#4a4f56', light, 0.1);
  ctx.fillRect(left + 24, top + height, 3, 14);
  ctx.fillRect(left + width - 27, top + height, 3, 14);
  ctx.fillStyle = night > 0.3 ? '#1b1d22' : lit('#f4efe2', light, 0.1);
  roundRect(ctx, left, top, width, height, 6);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = night > 0.3 ? diner.neon : lit('#c8312a', light, 0.1);
  roundRect(ctx, left + 3, top + 3, width - 6, height - 6, 4);
  ctx.save();
  if (night > 0.3) {
    ctx.shadowColor = diner.neon;
    ctx.shadowBlur = 10;
  }
  ctx.stroke();
  const flicker =
    frame.reducedMotion || night <= 0.3
      ? 1
      : 0.88 + 0.12 * Math.sin(frame.time * 23) * Math.sin(frame.time * 7);
  ctx.globalAlpha = flicker;
  ctx.fillStyle = night > 0.3 ? diner.neon : lit('#1d2330', light, 0.1);
  const size = Math.min(22, 330 / Math.max(8, diner.name.length));
  ctx.font = `800 ${size}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(diner.name.toUpperCase(), centre, top + height / 2 + 1);
  ctx.restore();
}

function paintPoleSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  light: Lighting,
  night: number,
  frame: DinerFrame,
) {
  ctx.fillStyle = lit('#5f6266', light, 0.15);
  ctx.fillRect(x - 2, 52, 4, 145);
  const left = x - 34;
  ctx.fillStyle = night > 0.3 ? '#fff6dc' : lit('#f4f1e6', light, 0.1);
  roundRect(ctx, left, 18, 68, 44, 4);
  ctx.fill();
  ctx.strokeStyle = lit('#1d7a46', light, 0.1);
  ctx.lineWidth = 2;
  roundRect(ctx, left + 2, 20, 64, 40, 3);
  ctx.stroke();
  ctx.fillStyle = '#1b1b1b';
  ctx.font = '800 10px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DIESEL', x, 29);
  ctx.fillStyle = '#b3261e';
  ctx.font = '800 17px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif';
  ctx.fillText(`${(frame.dieselCents / 100).toFixed(2)}`, x, 47);
  if (night > 0.3) {
    const glow = ctx.createRadialGradient(x, 40, 4, x, 40, 60);
    glow.addColorStop(0, `rgba(255, 246, 220, ${0.28 * night})`);
    glow.addColorStop(1, 'rgba(255, 246, 220, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 60, -20, 120, 120);
  }
}

/** The canopy over the island, your rig alongside it and the pumps in front. */
function paintFuelIsland(
  ctx: CanvasRenderingContext2D,
  centre: number,
  light: Lighting,
  night: number,
  frame: DinerFrame,
) {
  const left = centre - 120;
  const right = centre + 120;
  // Pillars behind the rig.
  ctx.fillStyle = lit('#b9bcbf', light, 0.12);
  ctx.fillRect(left + 16, 112, 6, 100);
  ctx.fillRect(right - 22, 112, 6, 100);

  paintRigSide(ctx, centre - 150, 222, 250, {
    paint: frame.paint,
    cargo: frame.cargo,
    light,
    wheel: 0,
    bob: 0,
    night,
    smoke: 0.15,
    time: frame.time,
    braking: false,
    police: false,
    reducedMotion: frame.reducedMotion,
    parked: true,
  });

  // The canopy, lit underneath at night.
  ctx.fillStyle = lit('#e9e5dc', light, 0.08);
  ctx.fillRect(left, 96, right - left, 14);
  ctx.fillStyle = lit('#c8312a', light, 0.08);
  ctx.fillRect(left, 103, right - left, 4);
  if (night > 0.3) {
    ctx.fillStyle = `rgba(255, 244, 214, ${0.9 * night})`;
    for (let lamp = left + 20; lamp < right - 10; lamp += 40) ctx.fillRect(lamp, 110, 18, 2);
  }

  // The island and two pumps in front.
  ctx.fillStyle = lit('#b7b2a6', light, 0.05);
  ctx.fillRect(centre - 80, 250, 160, 9);
  ctx.fillStyle = lit('#8d887d', light, 0.05);
  ctx.fillRect(centre - 80, 257, 160, 3);
  for (const px of [centre - 52, centre + 22])
    paintPump(ctx, px, 250, light, night, frame.dieselCents);
}

function paintPump(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  light: Lighting,
  night: number,
  dieselCents: number,
) {
  const top = base - 46;
  ctx.fillStyle = lit('#c8312a', light, 0.04);
  roundRect(ctx, x, top, 30, 46, 6);
  ctx.fill();
  ctx.fillStyle = lit('#f4f1e6', light, 0.04);
  roundRect(ctx, x + 4, top + 4, 22, 16, 3);
  ctx.fill();
  ctx.fillStyle = night > 0.3 ? '#2a1a08' : '#1b1b1b';
  ctx.fillRect(x + 6, top + 8, 18, 8);
  ctx.fillStyle = '#ff9d2e';
  ctx.font = '700 7px "Consolas", "Cascadia Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((dieselCents / 100).toFixed(2), x + 15, top + 12.5);
  ctx.fillStyle = lit('#2b2d33', light, 0.04);
  ctx.fillRect(x + 25, top + 24, 6, 10);
  ctx.strokeStyle = lit('#1b1b1b', light, 0.04);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 31, top + 30);
  ctx.quadraticCurveTo(x + 42, top + 40, x + 34, base - 2);
  ctx.stroke();
  ctx.fillStyle = lit('#f4f1e6', light, 0.04);
  ctx.font = '800 6px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif';
  ctx.fillText('DIESEL', x + 15, top + 30);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
