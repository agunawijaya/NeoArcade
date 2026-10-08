import type { CargoId } from '../engine/cargo';
import { css, lit, litRgb, shade, type Lighting } from './colour';

/**
 * The rig seen from the side: a long-nose conventional tractor of the early
 * eighties and a forty-five-foot box trailer, facing right. Shapes are laid
 * out on a grid of 100 units from the trailer's back door to the bumper, so
 * the same drawing serves a rig parked at the diner and a widescreen. The
 * tractor keeps true proportions (a long, low hood, a cab well under the
 * trailer's roof): a cab as tall as the box is what makes a rig look like a
 * toy.
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
  /** Parked for the night: marker lamps on, headlights off, nobody at the wheel. */
  parked?: boolean;
}

type WheelKind = 'steer' | 'drive' | 'trailer';

const WHEEL_RADIUS = 3.3;
const TRAILER_AXLES = [6.5, 12.2];
const DRIVE_AXLES = [55.6, 61.4];
const STEER_AXLE = 93.4;
/** The steer tyre's arch in the fender, a little wider than the tyre. */
const ARCH_RADIUS = 4.1;
/** The door's front edge leans back with the windscreen: units of x per unit of y. */
const PILLAR_RAKE = 0.156;

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

  ctx.fillStyle = `rgba(0, 0, 0, ${0.16 + frame.light.day * 0.14})`;
  ctx.beginPath();
  ctx.ellipse(50.5, 0.4, 51.5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Frame rails and wheel wells sit behind the tyres; everything else in front.
  paintUnderbody(ctx, frame);
  for (const axle of TRAILER_AXLES) paintWheel(ctx, axle, 'trailer', frame);
  for (const axle of DRIVE_AXLES) paintWheel(ctx, axle, 'drive', frame);
  paintWheel(ctx, STEER_AXLE, 'steer', frame);

  ctx.translate(0, -frame.bob / u);
  paintTrailer(ctx, frame);
  paintTractor(ctx, frame);
  if (frame.night > 0.25 && !frame.parked) paintHeadlights(ctx, frame);
  if (frame.smoke > 0) paintSmoke(ctx, frame);
  ctx.restore();
  if (frame.police) paintPoliceGlow(ctx, x - u * 6, y - u * 9, u, frame);
}

/** Paint with a sky highlight along the top and shade underneath, so panels read as curved. */
function paintedPanel(
  ctx: CanvasRenderingContext2D,
  colour: string,
  light: Lighting,
  top: number,
  bottom: number,
): CanvasGradient {
  const base = litRgb(colour, light);
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, css(shade(base, 0.1 + light.day * 0.22)));
  gradient.addColorStop(0.2, css(base));
  gradient.addColorStop(0.7, css(base));
  gradient.addColorStop(1, css(shade(base, -0.28)));
  return gradient;
}

/** Polished metal: the sky above, a hard dark horizon, the road glowing back from below. */
function chrome(
  ctx: CanvasRenderingContext2D,
  light: Lighting,
  top: number,
  bottom: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, lit('#f7f9fb', light));
  gradient.addColorStop(0.4, lit('#c4ccd4', light));
  gradient.addColorStop(0.52, lit('#5b626a', light));
  gradient.addColorStop(0.64, lit('#a1a8af', light));
  gradient.addColorStop(1, lit('#e9ecef', light));
  return gradient;
}

/** The same polish on an upright pipe, lit from the left. */
function chromePipe(
  ctx: CanvasRenderingContext2D,
  light: Lighting,
  left: number,
  right: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(left, 0, right, 0);
  gradient.addColorStop(0, lit('#858c94', light));
  gradient.addColorStop(0.3, lit('#fbfcfd', light));
  gradient.addColorStop(0.55, lit('#c3c9cf', light));
  gradient.addColorStop(1, lit('#5f666e', light));
  return gradient;
}

function paintUnderbody(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  // The tractor's frame rails and the fifth wheel the trailer rides on.
  ctx.fillStyle = lit('#25272b', light);
  ctx.fillRect(50.8, -7, 46.6, 1.5);
  ctx.fillStyle = lit('#3a3d42', light);
  ctx.fillRect(56, -8.6, 5.6, 1.6);
  ctx.fillStyle = lit('#5a5e64', light);
  ctx.fillRect(55.4, -8.6, 6.8, 0.35);
  ctx.fillStyle = lit('#111214', light);
  ctx.beginPath();
  ctx.arc(STEER_AXLE, -WHEEL_RADIUS, ARCH_RADIUS, Math.PI, 0);
  ctx.fill();
  paintMudFlap(ctx, 50.9, -7, light);
  paintMudFlap(ctx, 2.3, -8.6, light);
}

function paintMudFlap(ctx: CanvasRenderingContext2D, x: number, hangFrom: number, light: Lighting) {
  ctx.fillStyle = lit('#2c2e32', light);
  ctx.fillRect(x + 0.2, hangFrom, 0.25, -5.2 - hangFrom);
  ctx.fillStyle = lit('#16171a', light);
  ctx.fillRect(x, -5.3, 0.6, 4.4);
  ctx.fillStyle = lit('#c9ced4', light);
  ctx.fillRect(x - 0.05, -1.6, 0.7, 0.4);
}

function paintWheel(ctx: CanvasRenderingContext2D, cx: number, kind: WheelKind, frame: RigFrame) {
  const { light } = frame;
  const cy = -WHEEL_RADIUS;
  const tyre = ctx.createRadialGradient(cx, cy, WHEEL_RADIUS * 0.6, cx, cy, WHEEL_RADIUS);
  tyre.addColorStop(0, lit('#36373c', light));
  tyre.addColorStop(0.65, lit('#202124', light));
  tyre.addColorStop(1, lit('#101012', light));
  ctx.fillStyle = tyre;
  ctx.beginPath();
  ctx.arc(cx, cy, WHEEL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  // Tread blocks round the edge turn with the wheel: the eye reads speed from them.
  const treadRadius = WHEEL_RADIUS - 0.16;
  ctx.strokeStyle = lit('#060607', light);
  ctx.lineWidth = 0.3;
  ctx.setLineDash([0.3, 0.36]);
  ctx.lineDashOffset = -frame.wheel * treadRadius;
  ctx.beginPath();
  ctx.arc(cx, cy, treadRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Polished aluminium on the tractor, painted steel on the trailer.
  const rimRadius = WHEEL_RADIUS * 0.62;
  const steel = kind === 'trailer';
  const rim = ctx.createRadialGradient(cx - 0.7, cy - 0.7, 0.2, cx, cy, rimRadius);
  rim.addColorStop(0, lit(steel ? '#f1f0ea' : '#ffffff', light));
  rim.addColorStop(0.6, lit(steel ? '#c9c8c0' : '#d2d7dc', light));
  rim.addColorStop(1, lit(steel ? '#86857f' : '#7d848b', light));
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, rimRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = lit(steel ? '#9d9c95' : '#eef1f4', light);
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy, rimRadius * 0.86, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = lit('#24262a', light);
  for (let hole = 0; hole < 10; hole++) {
    const angle = frame.wheel + (hole / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(angle) * rimRadius * 0.64,
      cy + Math.sin(angle) * rimRadius * 0.64,
      0.26,
      0.15,
      angle,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = lit('#666c73', light);
  for (let nut = 0; nut < 10; nut++) {
    const angle = frame.wheel + ((nut + 0.5) / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * rimRadius * 0.36,
      cy + Math.sin(angle) * rimRadius * 0.36,
      0.13,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  // The steer wheel wears a chrome hub cap; the others show the axle's dark hub.
  const hub = ctx.createRadialGradient(cx - 0.2, cy - 0.2, 0.05, cx, cy, 0.6);
  hub.addColorStop(0, lit(kind === 'steer' ? '#ffffff' : '#7a8087', light));
  hub.addColorStop(1, lit(kind === 'steer' ? '#8a929a' : '#2b2e33', light));
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(cx, cy, kind === 'steer' ? 0.62 : 0.45, 0, Math.PI * 2);
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
  // Top and bottom rails, ribs, the corner posts at both ends.
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
  ctx.fillRect(front - 0.7, top, 0.7, bottom - top);
  paintLivery(ctx, top, bottom, front, frame);
  paintTrailerUnderside(ctx, bottom, frame);
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

/** Cross-members, the sliding tandem, the landing gear cranked up for the road, the underride bar. */
function paintTrailerUnderside(ctx: CanvasRenderingContext2D, bottom: number, frame: RigFrame) {
  const { light } = frame;
  ctx.fillStyle = lit('#2a2c30', light);
  ctx.fillRect(1, bottom, 61.6, 0.6);
  ctx.fillStyle = lit('#3d4046', light);
  ctx.fillRect(3, bottom, 13.5, 1.5);
  for (const axle of TRAILER_AXLES) ctx.fillRect(axle - 0.5, bottom + 1.4, 1, 1);
  ctx.fillStyle = lit('#45484e', light);
  ctx.fillRect(46.2, bottom, 0.9, 6);
  ctx.fillStyle = lit('#2f3236', light);
  ctx.fillRect(45.4, bottom + 6, 2.5, 0.55);
  ctx.fillStyle = lit('#3a3d42', light);
  ctx.fillRect(47.1, bottom + 1.2, 1.3, 0.25);
  ctx.fillRect(48.2, bottom + 1.2, 0.25, 1.2);
  ctx.fillStyle = lit('#3a3d42', light);
  ctx.fillRect(0.7, bottom, 0.55, 5.6);
  ctx.fillRect(0.1, bottom + 5.2, 1.8, 0.9);
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

/** Back to front, so each part overlaps the one behind it the way it does on a real tractor. */
function paintTractor(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  paintAirLines(ctx, frame);
  paintSleeper(ctx, frame);
  paintCabAndHood(ctx, frame);
  paintFender(ctx, frame);
  paintStripe(ctx, frame);
  paintDoor(ctx, frame);
  paintTankAndSteps(ctx, frame);
  paintAirCleaner(ctx, frame);
  paintStack(ctx, frame);
  paintMirror(ctx, frame);
  paintRoofline(ctx, frame);
  paintNose(ctx, frame);
}

/** The red and blue brake lines, sagging across the gap to the trailer. */
function paintAirLines(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  ctx.lineWidth = 0.22;
  for (const [colour, drop] of [
    ['#c8312a', 0],
    ['#2a5fb0', 0.5],
  ] as const) {
    ctx.strokeStyle = lit(colour, light);
    ctx.beginPath();
    ctx.moveTo(68.4, -14.6 + drop);
    ctx.bezierCurveTo(66.6, -10.8 + drop, 65, -15 + drop, 63.1, -12.4 + drop);
    ctx.stroke();
  }
}

function paintSleeper(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light, paint } = frame;
  ctx.fillStyle = paintedPanel(ctx, paint.body, light, -20.2, -7.6);
  ctx.beginPath();
  ctx.roundRect(68.2, -20.2, 11.8, 12.6, [1.1, 0.6, 0.3, 0.3]);
  ctx.fill();
  ctx.strokeStyle = panelLine(paint, light);
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.moveTo(68.4, -19.2);
  ctx.lineTo(79.8, -19.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(69.6, -9.9, 5.4, 1.8, 0.3);
  ctx.stroke();
  ctx.fillStyle = lit('#c3c9cf', light);
  ctx.fillRect(74.2, -9.15, 0.5, 0.3);

  // The bunk window, lit when the driver has turned in for the night.
  ctx.beginPath();
  ctx.roundRect(70.6, -17.4, 3.8, 1.7, 0.5);
  ctx.fillStyle = glass(ctx, light, -17.4, -15.7);
  ctx.fill();
  if (frame.parked && frame.night > 0.35) {
    ctx.fillStyle = `rgba(255, 196, 120, ${0.75 * frame.night})`;
    ctx.fill();
  }
  ctx.strokeStyle = lit('#1c1d20', light);
  ctx.lineWidth = 0.18;
  ctx.stroke();

  ctx.fillStyle = chrome(ctx, light, -8, -7.6);
  ctx.fillRect(68.2, -8, 18.8, 0.4);
}

function panelLine(paint: RigPaint, light: Lighting): string {
  return css(shade(litRgb(paint.body, light), -0.42));
}

function glass(
  ctx: CanvasRenderingContext2D,
  light: Lighting,
  top: number,
  bottom: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, lit('#d9e9f2', light));
  gradient.addColorStop(0.5, lit('#86a6ba', light));
  gradient.addColorStop(1, lit('#3b5566', light));
  return gradient;
}

/** The cab with its windscreen raked back, and the long hood falling a touch to the grille. */
function paintCabAndHood(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light, paint } = frame;
  ctx.fillStyle = paintedPanel(ctx, paint.body, light, -19.8, -7.6);
  ctx.beginPath();
  ctx.moveTo(79.9, -7.6);
  ctx.lineTo(79.9, -19);
  ctx.quadraticCurveTo(79.9, -19.8, 80.7, -19.8);
  ctx.lineTo(85.3, -19.8);
  ctx.quadraticCurveTo(85.9, -19.8, 86, -19.2);
  ctx.lineTo(87, -12.8);
  ctx.lineTo(87, -7.6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = paintedPanel(ctx, paint.body, light, -12.9, -6.4);
  ctx.beginPath();
  ctx.moveTo(86.9, -6.4);
  ctx.lineTo(86.9, -12.9);
  ctx.lineTo(98.2, -12.2);
  ctx.lineTo(98.2, -6.4);
  ctx.closePath();
  ctx.fill();
}

/** The steer fender: high over the tyre, then swept back and down to the step. */
function paintFender(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light, paint } = frame;
  const crown = -8.9;
  const traceCrown = () => {
    ctx.moveTo(98.7, -7.7);
    ctx.quadraticCurveTo(96.6, crown, STEER_AXLE, crown);
    ctx.quadraticCurveTo(89.4, crown + 0.1, 86.3, -5.3);
  };
  ctx.fillStyle = paintedPanel(ctx, paint.body, light, crown, -3.3);
  ctx.beginPath();
  ctx.moveTo(98.7, -3.5);
  ctx.lineTo(98.7, -7.7);
  traceCrown();
  ctx.lineTo(86.2, -4.5);
  ctx.lineTo(STEER_AXLE - ARCH_RADIUS, -WHEEL_RADIUS);
  ctx.arc(STEER_AXLE, -WHEEL_RADIUS, ARCH_RADIUS, Math.PI, 0);
  ctx.lineTo(98.7, -WHEEL_RADIUS);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = panelLine(paint, light);
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  traceCrown();
  ctx.stroke();
  ctx.strokeStyle = lit('#151618', light);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.arc(STEER_AXLE, -WHEEL_RADIUS, ARCH_RADIUS - 0.1, Math.PI, 0);
  ctx.stroke();
}

/** The paint stripe from the sleeper to the grille, with a pinstripe under it. */
function paintStripe(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light, paint } = frame;
  ctx.fillStyle = lit(paint.stripe, light);
  ctx.fillRect(68.2, -11.3, 29.95, 0.75);
  ctx.fillStyle = lit(paint.trim, light);
  ctx.fillRect(68.2, -10.35, 29.95, 0.2);
}

function paintDoor(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light, paint } = frame;
  ctx.strokeStyle = panelLine(paint, light);
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.moveTo(80.4, -8.1);
  ctx.lineTo(80.4, -18.9);
  ctx.quadraticCurveTo(80.4, -19.3, 80.8, -19.3);
  ctx.lineTo(85.4, -19.3);
  ctx.lineTo(85.4 + 6.4 * PILLAR_RAKE, -12.9);
  ctx.lineTo(86.4, -8.1);
  ctx.closePath();
  ctx.stroke();
  // Where the hood tilts away from the cowl.
  ctx.beginPath();
  ctx.moveTo(87.05, -12.8);
  ctx.lineTo(87.05, -6.6);
  ctx.stroke();

  ctx.fillStyle = chrome(ctx, light, -13.1, -12.8);
  ctx.fillRect(80.8, -13.1, 1.1, 0.32);
  ctx.fillStyle = lit(paint.trim, light);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 0.85px "Roboto Condensed", "Arial Narrow", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('LONG HAUL', 83.4, -9.2);
  paintSideWindow(ctx, frame);
}

/** The door glass with its vent wing, and the driver behind it. */
function paintSideWindow(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  const top = -18.8;
  const bottom = -14.1;
  const frontAt = (y: number) => 85.4 + (y + 19.3) * PILLAR_RAKE - 0.45;
  const pane = new Path2D();
  pane.moveTo(80.9, bottom);
  pane.lineTo(80.9, top + 0.4);
  pane.quadraticCurveTo(80.9, top, 81.3, top);
  pane.lineTo(frontAt(top), top);
  pane.lineTo(frontAt(bottom), bottom);
  pane.closePath();
  ctx.fillStyle = glass(ctx, light, top, bottom);
  ctx.fill(pane);

  ctx.save();
  ctx.clip(pane);
  if (frame.night > 0.35) {
    ctx.fillStyle = `rgba(255, 186, 110, ${0.42 * frame.night})`;
    ctx.fillRect(80.9, top, 5, bottom - top);
  }
  if (!frame.parked) {
    ctx.fillStyle = `rgba(16, 20, 26, ${0.5 + frame.night * 0.25})`;
    ctx.beginPath();
    ctx.arc(82.7, -16.3, 0.72, 0, Math.PI * 2);
    ctx.roundRect(81.9, -17.4, 1.6, 0.7, 0.35);
    ctx.rect(83.3, -16.95, 0.65, 0.2);
    ctx.roundRect(81.2, -15.5, 3, 1.6, 0.7);
    ctx.fill();
    // The big steering wheel, seen edge on.
    ctx.strokeStyle = `rgba(16, 20, 26, ${0.6 + frame.night * 0.2})`;
    ctx.lineWidth = 0.26;
    ctx.beginPath();
    ctx.moveTo(84, -15.7);
    ctx.lineTo(84.9, -14.2);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + light.day * 0.14})`;
  ctx.beginPath();
  ctx.moveTo(81.7, top);
  ctx.lineTo(82.7, top);
  ctx.lineTo(81.7, bottom);
  ctx.lineTo(80.7, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = lit('#1c1d20', light);
  ctx.lineWidth = 0.2;
  ctx.stroke(pane);
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  ctx.moveTo(frontAt(top) - 1, top);
  ctx.lineTo(frontAt(bottom) - 1, bottom);
  ctx.stroke();
}

/** A polished saddle tank under the sleeper, and the battery box that doubles as the steps. */
function paintTankAndSteps(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  ctx.fillStyle = chrome(ctx, light, -7.4, -2.9);
  ctx.beginPath();
  ctx.roundRect(69.8, -7.4, 11.1, 4.5, 2.25);
  ctx.fill();
  ctx.fillStyle = lit('#2a2c30', light);
  for (const strap of [71.9, 78.6]) ctx.fillRect(strap, -7.45, 0.45, 4.6);
  ctx.fillStyle = chrome(ctx, light, -7.85, -7.35);
  ctx.fillRect(79.6, -7.8, 0.9, 0.45);

  ctx.fillStyle = lit('#1e2023', light);
  ctx.fillRect(81.2, -7.4, 4.8, 4);
  for (const step of [-7.5, -5.6]) {
    ctx.fillStyle = chrome(ctx, light, step, step + 0.5);
    ctx.fillRect(81, step, 5.2, 0.5);
  }
}

function paintAirCleaner(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  ctx.fillStyle = chromePipe(ctx, light, 87.5, 89.4);
  ctx.beginPath();
  ctx.roundRect(87.5, -11.9, 1.9, 5.4, 0.5);
  ctx.fill();
  ctx.fillStyle = lit('#4a5057', light);
  ctx.fillRect(87.5, -10.9, 1.9, 0.18);
  ctx.fillRect(87.5, -7.6, 1.9, 0.18);
  ctx.fillStyle = chrome(ctx, light, -12.15, -11.7);
  ctx.beginPath();
  ctx.roundRect(87.35, -12.15, 2.2, 0.45, 0.2);
  ctx.fill();
}

/** The stack behind the cab: a mitred top, a perforated heat shield where a hand could touch it. */
function paintStack(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  const left = 79.25;
  const right = 80.25;
  ctx.fillStyle = chromePipe(ctx, light, left, right);
  ctx.beginPath();
  ctx.moveTo(left, -7.6);
  ctx.lineTo(left, -27.9);
  ctx.lineTo(right, -27);
  ctx.lineTo(right, -7.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lit('#1a1b1d', light);
  ctx.beginPath();
  ctx.ellipse((left + right) / 2, -27.45, 0.66, 0.16, Math.atan2(0.9, 1), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = chromePipe(ctx, light, left - 0.2, right + 0.2);
  ctx.fillRect(left - 0.2, -18.6, 1.4, 7);
  ctx.fillStyle = lit('#4b5158', light);
  for (let row = 0; row < 12; row++)
    for (let column = 0; column < 4; column++)
      ctx.fillRect(left + column * 0.32 + (row % 2) * 0.16, -18.2 + row * 0.55, 0.12, 0.12);
  ctx.fillStyle = lit('#2f3236', light);
  for (const clamp of [-22.4, -9]) ctx.fillRect(left - 0.1, clamp, 1.2, 0.3);
}

/** A West Coast mirror on its arms, and the CB whip bending back in the wind. */
function paintMirror(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  ctx.strokeStyle = lit('#c3c9cf', light);
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  ctx.moveTo(85.6, -18.2);
  ctx.lineTo(88, -18.4);
  ctx.moveTo(86.2, -14.8);
  ctx.lineTo(88, -15);
  ctx.stroke();
  ctx.fillStyle = lit('#26282c', light);
  ctx.beginPath();
  ctx.roundRect(87.8, -19, 0.65, 4.6, 0.25);
  ctx.fill();
  ctx.strokeStyle = lit('#d7dce1', light);
  ctx.lineWidth = 0.1;
  ctx.stroke();

  const lean = frame.parked ? 0 : 1.6;
  const sway = frame.reducedMotion || frame.parked ? 0 : Math.sin(frame.time * 5.3) * 0.35;
  ctx.strokeStyle = lit('#2c2e32', light);
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(88.1, -19);
  ctx.quadraticCurveTo(88.1, -24.5, 88.1 - lean - sway, -28.8 + lean * 0.15);
  ctx.stroke();
  ctx.fillStyle = lit('#9aa1a8', light);
  ctx.fillRect(87.95, -19.6, 0.3, 0.6);
}

/** The sun visor with its cab lamps, and twin air horns on the roof. */
function paintRoofline(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light, paint } = frame;
  ctx.fillStyle = paintedPanel(ctx, paint.body, light, -20, -19.2);
  ctx.beginPath();
  ctx.moveTo(85.2, -19.95);
  ctx.lineTo(87.9, -19.65);
  ctx.lineTo(87.9, -19.2);
  ctx.lineTo(85.9, -19.25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = frame.night > 0.3 ? '#ffb02e' : lit('#d08a26', light);
  for (const lamp of [85.9, 86.6, 87.3])
    ctx.fillRect(lamp, -20.3 + (lamp - 85.2) * 0.11, 0.42, 0.4);

  paintHorn(ctx, 81.8, 83.9, -20.05, 0.65, light);
  paintHorn(ctx, 81, 84.6, -20.35, 0.85, light);
  ctx.fillStyle = lit('#2b2d31', light);
  ctx.fillRect(82.2, -20.2, 0.9, 0.45);
}

function paintHorn(
  ctx: CanvasRenderingContext2D,
  back: number,
  front: number,
  y: number,
  bell: number,
  light: Lighting,
) {
  ctx.fillStyle = chrome(ctx, light, y - bell / 2, y + bell / 2);
  ctx.beginPath();
  ctx.moveTo(back, y - 0.1);
  ctx.quadraticCurveTo(front - 0.6, y - 0.12, front, y - bell / 2);
  ctx.lineTo(front, y + bell / 2);
  ctx.quadraticCurveTo(front - 0.6, y + 0.12, back, y + 0.1);
  ctx.closePath();
  ctx.fill();
}

/** Grille shell, the headlamp bucket on the fender, the turn signal, the bumper. */
function paintNose(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const { light } = frame;
  ctx.fillStyle = chrome(ctx, light, -12.6, -6.3);
  ctx.beginPath();
  ctx.roundRect(97.9, -12.6, 0.9, 6.3, [0.5, 0.25, 0, 0]);
  ctx.fill();

  ctx.fillStyle = chrome(ctx, light, -9.9, -8.6);
  ctx.beginPath();
  ctx.roundRect(96.7, -9.9, 2.1, 1.3, 0.6);
  ctx.fill();
  ctx.fillStyle = frame.night > 0.25 && !frame.parked ? '#fff6d8' : lit('#e6e2d2', light);
  ctx.beginPath();
  ctx.ellipse(98.75, -9.25, 0.18, 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = frame.night > 0.3 ? '#ffb02e' : lit('#d98a24', light);
  ctx.beginPath();
  ctx.ellipse(95.1, -9.25, 0.42, 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = chrome(ctx, light, -5.9, -3);
  ctx.beginPath();
  ctx.roundRect(97.3, -5.9, 3, 2.9, 0.55);
  ctx.fill();
}

function paintHeadlights(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  const beam = ctx.createLinearGradient(98.8, -9, 172, -9);
  beam.addColorStop(0, `rgba(255, 236, 190, ${0.42 * frame.night})`);
  beam.addColorStop(1, 'rgba(255, 236, 190, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(98.8, -9.8);
  ctx.lineTo(172, -15.5);
  ctx.lineTo(172, 3);
  ctx.lineTo(98.8, -8.7);
  ctx.closePath();
  ctx.fill();
}

function paintSmoke(ctx: CanvasRenderingContext2D, frame: RigFrame) {
  if (frame.reducedMotion) return;
  for (let puff = 0; puff < 6; puff++) {
    const t = (frame.time * 0.8 + puff / 6) % 1;
    ctx.fillStyle = `rgba(95, 95, 98, ${0.2 * frame.smoke * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(79.75 - t * 16, -28 - t * 5, 0.6 + t * 3.2, 0, Math.PI * 2);
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
