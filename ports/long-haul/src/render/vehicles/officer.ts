import { css, litRgb, shade, type Lighting } from '../colour';
import type { OfficerPose } from '../scene';

/**
 * The trooper on foot: campaign hat, khaki shirt with its patch and badge,
 * dark trousers with a stripe, boots, a ticket book, and after dark a
 * flashlight. Drawn three ways, all in feet scaled to pixels: in profile on
 * the diorama's shoulder, walking towards the windscreen in the cab view,
 * and close up at the cab's side window.
 */
const HAT = '#b39258';
const SHIRT = '#c9b58c';
const TROUSERS = '#232a3a';
const SKIN = '#c08a64';
const BOOTS = '#151517';
const BELT = '#1b1b1d';
const BADGE = '#d9b85a';

/** A uniform colour under the light, darkened for the far side of him. */
const tone = (colour: string, light: Lighting, darker = 0) =>
  css(shade(litRgb(colour, light), -darker));

export interface OfficerLook {
  light: Lighting;
  night: number;
  /** Seconds, for the flashlight's wander; 0 holds it still. */
  time: number;
}

/**
 * In profile: standing at (x, y) on the ground, `scale` pixels to the foot.
 * Facing −1 walks to the left of the picture (towards the back of the rig).
 * At the window he is up on the step with his back to us.
 */
export function drawOfficerSide(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: OfficerPose,
  look: OfficerLook,
) {
  const { light } = look;
  ctx.save();
  ctx.translate(x, y - pose.atWindow * 1.45 * scale);
  ctx.scale(scale, scale);
  if (pose.atWindow > 0.5) {
    backView(ctx, light, pose.writing);
    ctx.restore();
    return;
  }
  ctx.scale(pose.facing, 1);
  const swing = pose.walking ? Math.sin(pose.stride * Math.PI) * 0.42 : 0;
  // Far leg and arm first, darker; then the body; then the near leg and arm.
  leg(ctx, -swing, tone(TROUSERS, light, 0.15), tone(BOOTS, light, 0.15));
  arm(ctx, swing, tone(SHIRT, light, 0.2), tone(SKIN, light, 0.2), false);
  torso(ctx, light);
  leg(ctx, swing, tone(TROUSERS, light), tone(BOOTS, light));
  arm(ctx, -swing, tone(SHIRT, light), tone(SKIN, light), true);
  head(ctx, light, look.night < 0.4);
  ctx.restore();
  if (look.night > 0.4) flashlightBeam(ctx, x, y, scale, pose, look);
}

/** Legs pivot at the hip, 3.1 feet up; feet are at y = 0, v up as negative y on canvas. */
function leg(ctx: CanvasRenderingContext2D, angle: number, cloth: string, boot: string) {
  ctx.save();
  ctx.translate(0, -3.1);
  ctx.rotate(angle);
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(-0.28, 0);
  ctx.lineTo(0.26, 0);
  ctx.lineTo(0.2, 2.75);
  ctx.lineTo(-0.2, 2.75);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = boot;
  ctx.beginPath();
  ctx.roundRect(-0.22, 2.7, 0.62, 0.4, [0.05, 0.15, 0.06, 0.06]);
  ctx.fill();
  ctx.restore();
}

function arm(
  ctx: CanvasRenderingContext2D,
  angle: number,
  sleeve: string,
  skin: string,
  holding: boolean,
) {
  ctx.save();
  ctx.translate(0.02, -5.05);
  ctx.rotate(angle * 0.8);
  ctx.fillStyle = sleeve;
  ctx.beginPath();
  ctx.roundRect(-0.17, 0, 0.34, 1.0, 0.15);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(-0.13, 0.95, 0.26, 1.0, 0.12);
  ctx.fill();
  if (holding) {
    // The ticket book in his hand.
    ctx.fillStyle = '#e8e3d2';
    ctx.fillRect(0.05, 1.75, 0.42, 0.3);
  }
  ctx.restore();
}

function torso(ctx: CanvasRenderingContext2D, light: Lighting) {
  ctx.fillStyle = tone(SHIRT, light);
  ctx.beginPath();
  ctx.moveTo(-0.42, -3.2);
  ctx.lineTo(0.38, -3.2);
  ctx.quadraticCurveTo(0.55, -4.4, 0.36, -5.15);
  ctx.lineTo(-0.36, -5.15);
  ctx.quadraticCurveTo(-0.55, -4.3, -0.42, -3.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tone(BELT, light);
  ctx.fillRect(-0.44, -3.38, 0.86, 0.22);
  // Holster at the hip, the badge on the chest.
  ctx.fillStyle = tone('#2a2420', light);
  ctx.beginPath();
  ctx.roundRect(-0.52, -3.45, 0.22, 0.55, 0.06);
  ctx.fill();
  ctx.fillStyle = tone(BADGE, light);
  ctx.beginPath();
  ctx.arc(0.3, -4.55, 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function head(ctx: CanvasRenderingContext2D, light: Lighting, sunglasses: boolean) {
  ctx.fillStyle = tone(SKIN, light);
  ctx.beginPath();
  ctx.ellipse(0.06, -5.55, 0.32, 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  if (sunglasses) {
    ctx.fillStyle = tone('#121316', light);
    ctx.fillRect(0.12, -5.68, 0.26, 0.1);
  }
  campaignHat(ctx, light, 0);
}

/** The campaign hat: a broad flat brim and a peaked, pinched crown. */
function campaignHat(ctx: CanvasRenderingContext2D, light: Lighting, turn: number) {
  ctx.fillStyle = tone(HAT, light);
  ctx.beginPath();
  ctx.ellipse(0.05, -5.82, 0.62, 0.09 + turn * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.26, -5.84);
  ctx.lineTo(-0.12, -6.32);
  ctx.lineTo(0.05, -6.22);
  ctx.lineTo(0.22, -6.32);
  ctx.lineTo(0.34, -5.84);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tone('#5a4628', light);
  ctx.fillRect(-0.26, -5.98, 0.6, 0.08);
}

/** Up on the step at the window, his back to the camera. */
function backView(ctx: CanvasRenderingContext2D, light: Lighting, writing: boolean) {
  ctx.fillStyle = tone(TROUSERS, light, 0.05);
  ctx.fillRect(-0.36, -3.1, 0.3, 3.1);
  ctx.fillRect(0.06, -3.1, 0.3, 3.1);
  ctx.fillStyle = tone(BOOTS, light);
  ctx.fillRect(-0.4, -0.3, 0.36, 0.3);
  ctx.fillRect(0.04, -0.3, 0.36, 0.3);
  ctx.fillStyle = tone(SHIRT, light);
  ctx.beginPath();
  ctx.moveTo(-0.5, -3.2);
  ctx.lineTo(0.5, -3.2);
  ctx.lineTo(0.56, -5.1);
  ctx.quadraticCurveTo(0, -5.3, -0.56, -5.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tone(BELT, light);
  ctx.fillRect(-0.52, -3.38, 1.04, 0.22);
  // One arm raised to the window, the other writing or at his side.
  ctx.fillStyle = tone(SHIRT, light, 0.1);
  ctx.beginPath();
  ctx.roundRect(-0.72, -5.1, 0.3, 1.3, 0.12);
  ctx.fill();
  ctx.save();
  ctx.translate(0.5, -5.0);
  ctx.rotate(writing ? -0.9 : -0.2);
  ctx.beginPath();
  ctx.roundRect(-0.15, 0, 0.3, 1.2, 0.12);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = tone(SKIN, light, 0.2);
  ctx.beginPath();
  ctx.ellipse(0, -5.55, 0.3, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  campaignHat(ctx, light, 0.4);
}

/** After dark the flashlight goes where he looks: a pale cone on the ground ahead of him. */
function flashlightBeam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: OfficerPose,
  look: OfficerLook,
) {
  const hand = { x: x + pose.facing * 0.3 * scale, y: y - 3.2 * scale };
  const reach = 9 * scale;
  const wander = look.time ? Math.sin(look.time * 1.7) * 0.6 * scale : 0;
  const end = { x: hand.x + pose.facing * reach, y: y + wander * 0.2 };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beam = ctx.createLinearGradient(hand.x, hand.y, end.x, end.y);
  beam.addColorStop(0, `rgba(255, 246, 214, ${0.28 * look.night})`);
  beam.addColorStop(1, 'rgba(255, 246, 214, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(hand.x, hand.y);
  ctx.lineTo(end.x, end.y - 1.8 * scale);
  ctx.lineTo(end.x, end.y + 0.4 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Walking towards the windscreen: seen from the front and a little above,
 * `height` pixels tall from boots to hat, with his feet at (x, y).
 */
export function drawOfficerFront(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  pose: OfficerPose,
  look: OfficerLook,
) {
  const { light } = look;
  const scale = height / 6.35;
  const swing = pose.walking ? Math.sin(pose.stride * Math.PI) : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const side of [-1, 1]) {
    const lift = side * swing * 0.18;
    ctx.fillStyle = tone(TROUSERS, light);
    ctx.fillRect(side * 0.24 - 0.14, -3.1 - lift, 0.28, 2.85 + lift);
    ctx.fillStyle = tone(BOOTS, light);
    ctx.fillRect(side * 0.24 - 0.16, -0.3 - lift, 0.32, 0.3);
  }
  ctx.fillStyle = tone(SHIRT, light);
  ctx.beginPath();
  ctx.moveTo(-0.5, -3.2);
  ctx.lineTo(0.5, -3.2);
  ctx.lineTo(0.58, -5.15);
  ctx.quadraticCurveTo(0, -5.3, -0.58, -5.15);
  ctx.closePath();
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 0.62, -5.05);
    ctx.rotate(-side * 0.08 + side * swing * 0.12);
    ctx.fillStyle = tone(SHIRT, light, 0.05);
    ctx.fillRect(-0.14, 0, 0.28, 1.05);
    ctx.fillStyle = tone(SKIN, light);
    ctx.fillRect(-0.11, 1.0, 0.22, 0.85);
    ctx.restore();
  }
  ctx.fillStyle = tone('#3b2f22', light);
  ctx.fillRect(-0.08, -5.15, 0.16, 1.2);
  ctx.fillStyle = tone(BELT, light);
  ctx.fillRect(-0.52, -3.38, 1.04, 0.22);
  ctx.fillStyle = tone(BADGE, light);
  ctx.beginPath();
  ctx.arc(-0.28, -4.6, 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone(SKIN, light);
  ctx.beginPath();
  ctx.ellipse(0, -5.55, 0.3, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  if (look.night < 0.4) {
    ctx.fillStyle = tone('#121316', light);
    ctx.fillRect(-0.24, -5.66, 0.48, 0.11);
  }
  campaignHat(ctx, light, 0.5);
  ctx.restore();
  if (look.night > 0.4) {
    // His flashlight, held at the shoulder and pointed at the cab.
    const lamp = { x: x + 0.62 * scale, y: y - 4.9 * scale };
    const glare = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, height * 0.5);
    glare.addColorStop(0, `rgba(255, 248, 225, ${0.75 * look.night})`);
    glare.addColorStop(0.15, `rgba(255, 248, 225, ${0.25 * look.night})`);
    glare.addColorStop(1, 'rgba(255, 248, 225, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glare;
    ctx.fillRect(lamp.x - height * 0.5, lamp.y - height * 0.5, height, height);
    ctx.restore();
  }
}

/**
 * Close up at the passenger window: hat, face and shoulders filling the
 * glass, the ticket book when he writes, the flashlight's glare at night.
 * Lit from the side the light comes from, with the brim's shadow over his eyes.
 */
export function drawOfficerAtWindow(
  ctx: CanvasRenderingContext2D,
  window: { x: number; y: number; width: number; height: number },
  pose: OfficerPose,
  look: OfficerLook,
) {
  const { light } = look;
  const unit = Math.min(window.width / 3.2, window.height / 3.6);
  const cx = window.x + window.width * 0.55;
  const top = window.y + window.height * (1.12 - pose.atWindow * 0.62);
  ctx.save();
  ctx.beginPath();
  ctx.rect(window.x, window.y, window.width, window.height);
  ctx.clip();
  ctx.translate(cx, top);
  ctx.scale(unit, unit);
  shoulders(ctx, light);
  face(ctx, light, look.night < 0.4);
  hatFromFront(ctx, light);
  if (pose.writing) ticketBook(ctx, light, look.time);
  ctx.restore();
  if (look.night > 0.4) {
    const x = window.x + window.width * 0.1;
    const y = window.y + window.height * 0.7;
    const glare = ctx.createRadialGradient(x, y, 0, x, y, window.width * 0.8);
    glare.addColorStop(0, `rgba(255, 246, 220, ${0.42 * look.night})`);
    glare.addColorStop(0.3, `rgba(255, 246, 220, ${0.1 * look.night})`);
    glare.addColorStop(1, 'rgba(255, 246, 220, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glare;
    ctx.fillRect(window.x, window.y, window.width, window.height);
    ctx.restore();
  }
}

/** Shirt, collar and tie, the shoulder patch, the badge and the name plate. */
function shoulders(ctx: CanvasRenderingContext2D, light: Lighting) {
  const body = new Path2D();
  body.moveTo(-1.7, 3.5);
  body.quadraticCurveTo(-1.62, 1.45, -0.42, 1.22);
  body.lineTo(0.42, 1.22);
  body.quadraticCurveTo(1.62, 1.45, 1.7, 3.5);
  body.closePath();
  ctx.fillStyle = tone(SHIRT, light);
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  const turn = ctx.createLinearGradient(-1.7, 0, 1.7, 0);
  turn.addColorStop(0, 'rgba(255, 250, 235, 0.12)');
  turn.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  turn.addColorStop(1, 'rgba(20, 16, 10, 0.32)');
  ctx.fillStyle = turn;
  ctx.fillRect(-1.7, 1.2, 3.4, 2.3);
  // Epaulettes along the shoulder seams, pocket flaps below.
  ctx.fillStyle = tone(SHIRT, light, 0.18);
  ctx.fillRect(-1.45, 1.42, 0.62, 0.1);
  ctx.fillRect(0.83, 1.42, 0.62, 0.1);
  ctx.fillRect(-0.95, 2.45, 0.6, 0.08);
  ctx.fillRect(0.35, 2.45, 0.6, 0.08);
  ctx.restore();
  ctx.fillStyle = tone('#1e3354', light);
  ctx.beginPath();
  ctx.ellipse(-1.36, 2.05, 0.2, 0.28, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone(BADGE, light);
  star(ctx, -0.62, 2.15, 0.17);
  ctx.fillRect(0.38, 2.22, 0.5, 0.12);
  // The collar open over a dark tie.
  ctx.fillStyle = tone(SHIRT, light, 0.08);
  ctx.beginPath();
  ctx.moveTo(-0.42, 1.2);
  ctx.lineTo(0, 1.62);
  ctx.lineTo(0.42, 1.2);
  ctx.lineTo(0.3, 1.1);
  ctx.lineTo(0, 1.4);
  ctx.lineTo(-0.3, 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tone('#3b2f22', light);
  ctx.beginPath();
  ctx.moveTo(-0.08, 1.5);
  ctx.lineTo(0.08, 1.5);
  ctx.lineTo(0.12, 3.0);
  ctx.lineTo(0, 3.15);
  ctx.lineTo(-0.12, 3.0);
  ctx.closePath();
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  for (let point = 0; point < 10; point++) {
    const angle = -Math.PI / 2 + (point / 10) * Math.PI * 2;
    const reach = point % 2 === 0 ? radius : radius * 0.45;
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fill();
}

function face(ctx: CanvasRenderingContext2D, light: Lighting, sunglasses: boolean) {
  ctx.fillStyle = tone(SKIN, light, 0.12);
  ctx.fillRect(-0.24, 0.85, 0.48, 0.45);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.47, 0.48, 0.09, 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const head = new Path2D();
  head.ellipse(0, 0.45, 0.46, 0.57, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone(SKIN, light);
  ctx.fill(head);
  ctx.save();
  ctx.clip(head);
  const turn = ctx.createLinearGradient(-0.46, 0, 0.46, 0);
  turn.addColorStop(0, 'rgba(255, 240, 220, 0.14)');
  turn.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  turn.addColorStop(1, 'rgba(60, 25, 10, 0.3)');
  ctx.fillStyle = turn;
  ctx.fillRect(-0.5, -0.2, 1, 1.3);
  // The brim's shadow across the brow.
  ctx.fillStyle = 'rgba(40, 20, 10, 0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 0.02, 0.62, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = tone('#7a4e36', light);
  ctx.lineWidth = 0.035;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0.02, 0.38);
  ctx.quadraticCurveTo(0.09, 0.56, 0.0, 0.6);
  ctx.moveTo(-0.13, 0.76);
  ctx.lineTo(0.13, 0.76);
  ctx.stroke();
  ctx.lineCap = 'butt';
  if (sunglasses) {
    ctx.fillStyle = tone('#0f1013', light);
    ctx.beginPath();
    ctx.roundRect(-0.39, 0.27, 0.34, 0.16, 0.06);
    ctx.roundRect(0.05, 0.27, 0.34, 0.16, 0.06);
    ctx.fill();
    ctx.fillRect(-0.06, 0.3, 0.12, 0.03);
    ctx.fillStyle = 'rgba(200, 220, 240, 0.35)';
    ctx.fillRect(-0.34, 0.29, 0.1, 0.03);
    ctx.fillRect(0.1, 0.29, 0.1, 0.03);
  } else {
    ctx.fillStyle = tone('#2a1e18', light);
    ctx.fillRect(-0.28, 0.33, 0.14, 0.045);
    ctx.fillRect(0.14, 0.33, 0.14, 0.045);
  }
}

/** The campaign hat seen from in front: a peaked, four-dented crown over a flat brim. */
function hatFromFront(ctx: CanvasRenderingContext2D, light: Lighting) {
  const brim = ctx.createLinearGradient(0, -0.25, 0, 0.15);
  brim.addColorStop(0, tone(HAT, light, -0.12));
  brim.addColorStop(1, tone(HAT, light, 0.2));
  ctx.fillStyle = brim;
  ctx.beginPath();
  ctx.ellipse(0, -0.05, 1.0, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone(HAT, light);
  ctx.beginPath();
  ctx.moveTo(-0.46, -0.1);
  ctx.lineTo(-0.22, -0.84);
  ctx.quadraticCurveTo(-0.1, -0.7, 0, -0.7);
  ctx.quadraticCurveTo(0.1, -0.7, 0.22, -0.84);
  ctx.lineTo(0.46, -0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tone(HAT, light, 0.18);
  ctx.beginPath();
  ctx.moveTo(0, -0.7);
  ctx.lineTo(0.22, -0.84);
  ctx.lineTo(0.46, -0.1);
  ctx.lineTo(0.12, -0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tone('#5a4628', light);
  ctx.fillRect(-0.46, -0.24, 0.92, 0.12);
  ctx.fillStyle = tone(BADGE, light);
  ctx.beginPath();
  ctx.arc(0, -0.18, 0.05, 0, Math.PI * 2);
  ctx.fill();
}

/** The ticket book held up to the glass, and the pen moving over it. */
function ticketBook(ctx: CanvasRenderingContext2D, light: Lighting, time: number) {
  ctx.save();
  ctx.translate(0.78, 2.15);
  ctx.rotate(-0.18);
  ctx.fillStyle = tone('#f1ecdc', light);
  ctx.fillRect(-0.48, -0.32, 0.96, 0.66);
  ctx.fillStyle = tone('#c8312a', light);
  ctx.fillRect(-0.48, -0.32, 0.96, 0.09);
  ctx.fillStyle = tone('#9aa0a8', light);
  for (let row = 0; row < 4; row++) ctx.fillRect(-0.38, -0.12 + row * 0.11, 0.6, 0.025);
  ctx.strokeStyle = tone('#1b1b1d', light);
  ctx.lineWidth = 0.05;
  const nib = time ? Math.sin(time * 9) * 0.25 : 0;
  ctx.beginPath();
  ctx.moveTo(nib, 0.05);
  ctx.lineTo(nib + 0.45, -0.55);
  ctx.stroke();
  ctx.fillStyle = tone(SKIN, light, 0.1);
  ctx.beginPath();
  ctx.ellipse(nib + 0.42, -0.5, 0.13, 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
