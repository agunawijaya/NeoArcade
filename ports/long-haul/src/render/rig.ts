import type { CargoId } from '../engine/cargo';
import { lit, type Lighting } from './colour';

/**
 * The rig seen from the side: a long-nose conventional tractor of the early
 * eighties and a forty-five-foot box trailer, facing right. Shapes are laid
 * out on a grid of 100 units from the trailer's back door to the bumper, so
 * the same drawing serves the Hall cover and a widescreen.
 */
export interface RigPaint {
  body: string;
  trim: string;
  stripe: string;
}

export const RIG_PAINTS = {
  classic: { body: '#b8312a', trim: '#e2e2de', stripe: '#f2c14e' },
  highway: { body: '#1f7a4a', trim: '#e2e2de', stripe: '#f4f1e6' },
  midnight: { body: '#222b40', trim: '#cfd3da', stripe: '#4fa3d8' },
  cream: { body: '#e9dfc4', trim: '#c9a86a', stripe: '#7a3a2a' },
  sunset: { body: '#e0662b', trim: '#ece6d6', stripe: '#6b2a5a' },
  chrome: { body: '#a3abb4', trim: '#f4f6f8', stripe: '#2b2b2b' },
} as const satisfies Record<string, RigPaint>;

export type RigPaintId = keyof typeof RIG_PAINTS;

export interface RigFrame {
  paint: RigPaint;
  cargo: CargoId;
  light: Lighting;
  /** Wheel rotation in radians. */
  wheel: number;
  /** Small vertical bounce of the body, in pixels. */
  bob: number;
  /** 0 day … 1 full night: headlights, marker lamps, a lit cab. */
  night: number;
  /** Exhaust, 0–1. */
  smoke: number;
  time: number;
  braking: boolean;
  /** A patrol car's lights washing over the back of the trailer. */
  police: boolean;
  reducedMotion: boolean;
  /** Parked for the night: marker lamps on, headlights off. */
  parked?: boolean;
}

const WHEEL_RADIUS = 3.3;

/** Draws the rig with the trailer's back at `x`, wheels on the road at `y`, `length` pixels long. */
export function paintRigSide(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  frame: RigFrame,
) {
  const u = length / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(u, u);
  const { light } = frame;

  // Shadow under the whole rig.
  ctx.fillStyle = `rgba(0, 0, 0, ${0.16 + light.day * 0.14})`;
  ctx.beginPath();
  ctx.ellipse(50, 0.4, 51, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const axle of [6.5, 12.2, 55.6, 61.4, 90.6]) paintWheel(ctx, axle, frame);

  ctx.translate(0, -frame.bob / u);
  paintTrailer(ctx, frame);
  paintTractor(ctx, frame);
  if (frame.night > 0.25 && !frame.parked) paintHeadlights(ctx, frame);
  if (frame.smoke > 0) paintSmoke(ctx, frame);
  ctx.restore();
  if (frame.police) paintPoliceGlow(ctx, x - u * 6, y - u * 9, u, frame);
}

function paintWheel(ctx: CanvasRenderingContext2D, cx: number, frame: RigFrame) {
  const { light } = frame;
  const cy = -WHEEL_RADIUS;
  ctx.fillStyle = lit('#18181a', light);
  ctx.beginPath();
  ctx.arc(cx, cy, WHEEL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = lit('#2a2a2d', light);
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.arc(cx, cy, WHEEL_RADIUS * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  const rim = ctx.createRadialGradient(cx - 0.6, cy - 0.6, 0.2, cx, cy, WHEEL_RADIUS * 0.6);
  rim.addColorStop(0, lit('#f1f3f5', light));
  rim.addColorStop(1, lit('#8d939a', light));
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, WHEEL_RADIUS * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit('#5c6168', light);
  for (let nut = 0; nut < 8; nut++) {
    const a = frame.wheel + (nut / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 1.15, cy + Math.sin(a) * 1.15, 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = lit('#3b3f45', light);
  ctx.beginPath();
  ctx.arc(cx, cy, 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function paintTrailer(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  const top = -24.5;
  const bottom = -8.6;
  const front = 63;
  const colour =
    frame.cargo === 'mail' ? '#eef1f5' : frame.cargo === 'oranges' ? '#f1f2ef' : '#dcdfe2';
  const body = ctx.createLinearGradient(0, top, 0, bottom);
  body.addColorStop(0, lit(colour, light));
  body.addColorStop(0.75, lit(colour, light));
  body.addColorStop(1, lit('#a9aeb4', light));
  ctx.fillStyle = body;
  ctx.fillRect(0, top, front, bottom - top);
  // Top and bottom rails, ribs, the back door frame.
  ctx.fillStyle = lit('#b9bec4', light);
  ctx.fillRect(0, top, front, 0.7);
  ctx.fillStyle = lit('#6f747b', light);
  ctx.fillRect(0, bottom - 0.9, front, 0.9);
  ctx.strokeStyle = lit('#a3a8ae', light);
  ctx.lineWidth = 0.18;
  for (let rib = 1; rib < 21; rib++) {
    ctx.beginPath();
    ctx.moveTo((front / 21) * rib, top + 0.9);
    ctx.lineTo((front / 21) * rib, bottom - 1);
    ctx.stroke();
  }
  ctx.fillStyle = lit('#9aa0a6', light);
  ctx.fillRect(0, top, 0.9, bottom - top);
  paintLivery(ctx, top, bottom, front, frame);
  // Undercarriage: sliding tandem, landing gear, mud flap.
  ctx.fillStyle = lit('#3d4046', light);
  ctx.fillRect(3, bottom, 13.5, 1.4);
  ctx.fillRect(46, bottom, 0.7, 4.8);
  ctx.fillRect(45.2, bottom + 4.4, 2.3, 0.5);
  ctx.fillStyle = lit('#1d1e20', light);
  ctx.fillRect(15.6, bottom + 1.2, 1, 5.6);
  // Tail and marker lights.
  ctx.fillStyle = frame.braking
    ? '#ff2a20'
    : frame.night > 0.35
      ? '#e8352c'
      : lit('#8f2a24', light);
  ctx.fillRect(-0.25, bottom - 3.4, 0.7, 1.5);
  ctx.fillStyle = frame.night > 0.35 ? '#ffb02e' : lit('#c98a2a', light);
  for (const mark of [8, 31, 54]) ctx.fillRect(mark, bottom - 1.6, 0.8, 0.5);
}

function paintLivery(
  ctx: CanvasRenderingContext2D,
  top: number,
  bottom: number,
  front: number,
  frame: RigFrame,
) {
  const { light } = frame;
  const height = bottom - top;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (frame.cargo === 'mail') {
    ctx.fillStyle = lit('#2a4f8f', light);
    ctx.fillRect(0, top + height * 0.66, front, height * 0.1);
    ctx.fillStyle = lit('#c8312a', light);
    ctx.fillRect(0, top + height * 0.78, front, height * 0.06);
    ctx.fillStyle = lit('#1f3a6e', light);
    ctx.font = '800 4.6px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
    ctx.fillText('U.S. MAIL', front * 0.42, top + height * 0.36);
    return;
  }
  if (frame.cargo === 'oranges') {
    // The refrigeration unit on the trailer's nose.
    ctx.fillStyle = lit('#dfe2e5', light);
    ctx.beginPath();
    ctx.roundRect(front - 0.6, top + 2, 3, 9.5, 0.6);
    ctx.fill();
    ctx.fillStyle = lit('#55595f', light);
    for (let vent = 0; vent < 5; vent++) ctx.fillRect(front + 0.2, top + 3 + vent * 1.6, 1.6, 0.6);
    ctx.fillStyle = lit('#f08a24', light);
    ctx.fillRect(0, top + height * 0.7, front, height * 0.09);
    ctx.fillStyle = lit('#3f8a3a', light);
    ctx.fillRect(0, top + height * 0.81, front, height * 0.04);
    for (let fruit = 0; fruit < 3; fruit++) {
      const fx = 10 + fruit * 4.2;
      ctx.fillStyle = lit('#f28c28', light);
      ctx.beginPath();
      ctx.arc(fx, top + height * 0.36, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lit('#3f8a3a', light);
      ctx.beginPath();
      ctx.ellipse(fx + 0.6, top + height * 0.36 - 1.9, 0.8, 0.35, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = lit('#c96a12', light);
    ctx.font = '800 3.4px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
    ctx.fillText('FRESH CITRUS', front * 0.56, top + height * 0.36);
    return;
  }
  // The company's own: a swoosh in the rig's colours under a slanted name.
  ctx.fillStyle = lit(frame.paint.body, light);
  ctx.beginPath();
  ctx.moveTo(0, top + height * 0.7);
  ctx.lineTo(front * 0.62, top + height * 0.7);
  ctx.quadraticCurveTo(front * 0.8, top + height * 0.7, front, top + height * 0.52);
  ctx.lineTo(front, top + height * 0.62);
  ctx.quadraticCurveTo(front * 0.82, top + height * 0.8, front * 0.62, top + height * 0.8);
  ctx.lineTo(0, top + height * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lit(frame.paint.stripe, light);
  ctx.fillRect(0, top + height * 0.82, front * 0.62, height * 0.035);
  ctx.save();
  ctx.translate(front * 0.42, top + height * 0.36);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.fillStyle = lit(frame.paint.body, light);
  ctx.font = '700 6.2px "Roboto Condensed", "Arial Narrow", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('LONG HAUL', 0, 0);
  ctx.fillStyle = lit('#3a3d42', light);
  ctx.font = '700 2.1px "Roboto Condensed", "Arial Narrow", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('F R E I G H T   L I N E S', 0, 4.6);
  ctx.restore();
}

function paintTractor(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light, paint } = frame;
  const body = lit(paint.body, light);
  const trim = lit(paint.trim, light);
  const dark = lit('#2b2d31', light);

  // Frame rails from the drives to the bumper, and the fifth wheel.
  ctx.fillStyle = dark;
  ctx.fillRect(52, -9.3, 46, 1.6);
  ctx.fillStyle = lit('#45484d', light);
  ctx.fillRect(56, -10.2, 6, 0.9);

  // Sleeper box.
  const sleeper = ctx.createLinearGradient(0, -25, 0, -9);
  sleeper.addColorStop(0, lit(paint.body, light));
  sleeper.addColorStop(1, lit(paint.body, { ...light, day: light.day * 0.82 }));
  ctx.fillStyle = sleeper;
  ctx.beginPath();
  ctx.roundRect(64.6, -25.2, 8.6, 16.4, 0.9);
  ctx.fill();

  // Cab, with the windshield raked back a little.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(73, -9);
  ctx.lineTo(73, -23.8);
  ctx.quadraticCurveTo(73, -24.4, 73.6, -24.4);
  ctx.lineTo(79.6, -24.4);
  ctx.lineTo(81.6, -17.6);
  ctx.lineTo(81.6, -9);
  ctx.closePath();
  ctx.fill();

  // The long hood, sloping a touch to the grille.
  ctx.beginPath();
  ctx.moveTo(81.4, -17.6);
  ctx.lineTo(95.6, -16.4);
  ctx.quadraticCurveTo(96.8, -16.3, 96.8, -15.2);
  ctx.lineTo(96.8, -9);
  ctx.lineTo(81.4, -9);
  ctx.closePath();
  ctx.fill();
  // Fender over the steer wheel.
  ctx.fillStyle = lit(paint.body, { ...light, day: light.day * 0.88 });
  ctx.beginPath();
  ctx.moveTo(86, -8.6);
  ctx.quadraticCurveTo(86.2, -13.4, 90.6, -13.6);
  ctx.quadraticCurveTo(95.4, -13.4, 96.6, -9.6);
  ctx.lineTo(96.6, -8.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(90.6, -WHEEL_RADIUS, WHEEL_RADIUS + 0.7, Math.PI, 0);
  ctx.fill();
  paintWheel(ctx, 90.6, frame);

  // Stripe along cab and hood.
  ctx.fillStyle = lit(paint.stripe, light);
  ctx.fillRect(64.6, -15.4, 32, 0.9);

  // Grille, bumper, visor, headlamp housing.
  const chrome = ctx.createLinearGradient(0, -16.4, 0, -8.6);
  chrome.addColorStop(0, lit('#f6f7f8', light));
  chrome.addColorStop(0.5, lit('#9ea4ab', light));
  chrome.addColorStop(1, lit('#e6e8ea', light));
  ctx.fillStyle = chrome;
  ctx.fillRect(96.3, -16.2, 1.3, 7.4);
  ctx.fillRect(96, -9.2, 3.2, 1.6);
  ctx.fillStyle = trim;
  ctx.fillRect(79.2, -24.9, 3, 0.5);
  ctx.fillStyle = frame.night > 0.25 ? '#fff4cf' : lit('#e9e6da', light);
  ctx.fillRect(95.4, -13, 1, 1.6);

  // Air cleaner, stacks, fuel tank, step.
  ctx.fillStyle = chrome;
  ctx.beginPath();
  ctx.roundRect(82.6, -16.6, 2.4, 6.2, 1);
  ctx.fill();
  ctx.fillStyle = lit('#d9dde2', light);
  ctx.fillRect(73.3, -32, 0.9, 23);
  ctx.fillStyle = lit('#3c3f44', light);
  ctx.fillRect(73.1, -32.6, 1.3, 0.7);
  ctx.fillStyle = chrome;
  ctx.beginPath();
  ctx.roundRect(74.2, -11.6, 6.6, 3.2, 1.5);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.fillRect(74.4, -8.2, 6.2, 0.5);

  // Windows: the windshield in profile and the door glass.
  const glass = ctx.createLinearGradient(0, -24, 0, -18);
  glass.addColorStop(0, lit('#bdd5e3', light));
  glass.addColorStop(1, lit('#4d6b80', light));
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(74.2, -23.4);
  ctx.lineTo(79.1, -23.4);
  ctx.lineTo(80.6, -18.4);
  ctx.lineTo(74.2, -18.4);
  ctx.closePath();
  ctx.fill();
  if (frame.night > 0.35) {
    ctx.fillStyle = `rgba(255, 190, 110, ${0.4 * frame.night})`;
    ctx.fill();
  }
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.25;
  ctx.strokeRect(73.8, -18, 7.4, 8.6);
  ctx.fillStyle = trim;
  ctx.fillRect(79.6, -14.2, 1.2, 0.4);
  // Mirror on its arm.
  ctx.fillStyle = dark;
  ctx.fillRect(81.2, -21.5, 1.6, 0.3);
  ctx.fillStyle = trim;
  ctx.fillRect(82.6, -23, 0.7, 3.4);

  // Marker lamps on the cab roof.
  ctx.fillStyle = frame.night > 0.3 ? '#ffb02e' : lit('#c98a2a', light);
  for (let lamp = 0; lamp < 5; lamp++) ctx.fillRect(74.4 + lamp * 1.2, -25.1, 0.7, 0.6);
}

function paintHeadlights(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const beam = ctx.createLinearGradient(97, -12, 170, -12);
  beam.addColorStop(0, `rgba(255, 236, 190, ${0.42 * frame.night})`);
  beam.addColorStop(1, 'rgba(255, 236, 190, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(96.4, -12.8);
  ctx.lineTo(170, -18);
  ctx.lineTo(170, 2);
  ctx.lineTo(96.4, -11.2);
  ctx.closePath();
  ctx.fill();
}

function paintSmoke(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  if (frame.reducedMotion) return;
  for (let puff = 0; puff < 6; puff++) {
    const t = (frame.time * 0.8 + puff / 6) % 1;
    ctx.fillStyle = `rgba(95, 95, 98, ${0.2 * frame.smoke * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(73.7 - t * 16, -33 - t * 5, 0.7 + t * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintPoliceGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: RigFrame,
) {
  const phase = frame.reducedMotion ? 0 : Math.floor(frame.time * 6) % 2;
  const colour = phase === 0 ? '255, 40, 40' : '40, 110, 255';
  const glow = ctx.createRadialGradient(x, y, 0, x, y, u * 24);
  glow.addColorStop(0, `rgba(${colour}, 0.5)`);
  glow.addColorStop(1, `rgba(${colour}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(x - u * 24, y - u * 24, u * 48, u * 48);
}
