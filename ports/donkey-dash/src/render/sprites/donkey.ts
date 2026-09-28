import type { HatStyle } from '../../garage';
import type { Coat } from '../palette';

/**
 * The donkey, side on, as it stands across a lane: the same pose the 1981
 * sprite struck, redrawn. Drawn in metres with the origin on the ground
 * under its belly and +y pointing down; the caller scales and places it.
 * About 1.9 m long and 1.95 m tall to the tips of its ears.
 */
export interface DonkeyPose {
  coat: Coat;
  facing: 1 | -1;
  /** Seconds, for ear flicks, tail swishes and blinking. */
  time: number;
  /** Personal timing offset, so a herd does not flick in unison. */
  seed: number;
  /** 0…1: a near miss made it jump. */
  startled: number;
  /** Sitting stunned after a crash, stars circling. */
  dazed: boolean;
  /** Standing again, but the stars have not quite stopped circling. */
  dizzy?: boolean;
  /** 0…1 through a hop to another lane: legs tucked. */
  hop: number;
  hat: HatStyle | null;
  /** Skips the fine details when it is only a few pixels tall. */
  simple?: boolean;
}

export const DONKEY_HEIGHT = 1.95;
export const DONKEY_LENGTH = 1.9;

export function drawDonkey(ctx: CanvasRenderingContext2D, pose: DonkeyPose) {
  const { coat, facing, time, seed, startled, dazed, hop, simple } = pose;
  const phase = time + (seed % 97) * 0.37;
  ctx.save();
  ctx.scale(facing, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // A startled donkey rears back a little; a dazed one slumps.
  const lean = startled * -0.12 + (dazed ? 0.08 : 0);
  const sink = dazed ? 0.28 : hop * 0.1;
  ctx.translate(0, sink);
  ctx.rotate(lean);

  drawTail(ctx, coat, phase);
  drawLegs(ctx, coat, phase, hop, dazed);
  drawBody(ctx, coat, simple === true);
  drawHead(ctx, coat, phase, startled, dazed, simple === true);
  if (pose.hat) drawHat(ctx, pose.hat);
  ctx.restore();

  if (dazed || pose.dizzy) drawDazedStars(ctx, time, facing);
}

function drawTail(ctx: CanvasRenderingContext2D, coat: Coat, phase: number) {
  const swish = Math.sin(phase * 2.3) * 0.08;
  ctx.strokeStyle = coat.body;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(-0.74, -1.02);
  ctx.quadraticCurveTo(-0.9, -0.85, -0.84 + swish, -0.52);
  ctx.stroke();
  ctx.fillStyle = coat.dark;
  ctx.beginPath();
  ctx.ellipse(-0.84 + swish, -0.46, 0.06, 0.12, swish, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegs(
  ctx: CanvasRenderingContext2D,
  coat: Coat,
  phase: number,
  hop: number,
  dazed: boolean,
) {
  // Front and back pairs; the far leg of each pair is a shade darker.
  const legs: [number, boolean][] = [
    [0.44, false],
    [0.3, true],
    [-0.44, false],
    [-0.3, true],
  ];
  const tuck = Math.sin(hop * Math.PI) * 0.22;
  const shift = Math.sin(phase * 0.7) * 0.015;
  for (const [x, far] of legs.sort((a, b) => Number(b[1]) - Number(a[1]))) {
    const top = -0.78;
    const bottom = dazed ? -0.1 : -tuck;
    const foot = x + (dazed ? (x > 0 ? 0.25 : -0.25) : shift);
    ctx.strokeStyle = far ? coat.dark : coat.body;
    ctx.lineWidth = 0.11;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(foot, bottom - 0.06);
    ctx.stroke();
    ctx.fillStyle = '#2a2320';
    ctx.fillRect(foot - 0.065, bottom - 0.08, 0.13, 0.08);
  }
}

function drawBody(ctx: CanvasRenderingContext2D, coat: Coat, simple: boolean) {
  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.ellipse(0, -0.97, 0.66, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-0.5, -1.0, 0.29, 0, Math.PI * 2);
  ctx.arc(0.46, -0.99, 0.27, 0, Math.PI * 2);
  ctx.fill();
  if (simple) return;
  // Pale belly and a darker stripe along the back, a donkey's cross.
  ctx.fillStyle = coat.light;
  ctx.beginPath();
  ctx.ellipse(0.02, -0.78, 0.46, 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = coat.dark;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-0.62, -1.25);
  ctx.quadraticCurveTo(0, -1.33, 0.5, -1.23);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  coat: Coat,
  phase: number,
  startled: number,
  dazed: boolean,
  simple: boolean,
) {
  // Neck.
  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.moveTo(0.34, -1.2);
  ctx.quadraticCurveTo(0.5, -1.56, 0.74, -1.62);
  ctx.lineTo(0.88, -1.38);
  ctx.quadraticCurveTo(0.72, -1.02, 0.66, -0.9);
  ctx.closePath();
  ctx.fill();
  // Mane.
  ctx.strokeStyle = coat.dark;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0.36, -1.28);
  ctx.quadraticCurveTo(0.48, -1.56, 0.7, -1.66);
  ctx.stroke();

  ctx.save();
  ctx.translate(0.82, -1.5);
  ctx.rotate(0.62 + startled * -0.2 + (dazed ? 0.35 : 0));
  // Ears: long, upright, one flicking now and then.
  const flick = Math.max(0, Math.sin(phase * 1.3) - 0.93) * 9;
  drawEar(ctx, coat, -0.02, -0.32 - flick * 0.25 - startled * 0.25);
  drawEar(ctx, coat, 0.08, -0.12 - startled * 0.2);
  // The long face.
  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.ellipse(0.1, 0.02, 0.2, 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.02, -0.12);
  ctx.quadraticCurveTo(0.36, -0.12, 0.46, 0.02);
  ctx.quadraticCurveTo(0.42, 0.14, 0.08, 0.15);
  ctx.fill();
  ctx.fillStyle = coat.light;
  ctx.beginPath();
  ctx.ellipse(0.4, 0.04, 0.11, 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!simple) {
    ctx.fillStyle = coat.dark;
    ctx.beginPath();
    ctx.ellipse(0.46, 0.0, 0.025, 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    drawEye(ctx, phase, startled, dazed);
  }
  ctx.restore();
}

function drawEar(ctx: CanvasRenderingContext2D, coat: Coat, x: number, angle: number) {
  ctx.save();
  ctx.translate(x, -0.08);
  ctx.rotate(angle);
  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.ellipse(0, -0.2, 0.065, 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = coat.dark;
  ctx.beginPath();
  ctx.ellipse(0, -0.36, 0.045, 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The famous blank, unbothered stare: a heavy lid over a small dark eye. */
function drawEye(ctx: CanvasRenderingContext2D, phase: number, startled: number, dazed: boolean) {
  ctx.save();
  ctx.translate(0.1, -0.04);
  if (dazed) {
    ctx.strokeStyle = '#2a2320';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    for (let turn = 0; turn < 14; turn++) {
      const angle = turn * 0.9 + phase * 6;
      const radius = 0.004 * turn;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  const open = 0.035 + startled * 0.025;
  const blinking = Math.sin(phase * 0.9) > 0.985;
  ctx.fillStyle = '#f7f1e6';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.042, blinking ? 0.006 : open, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!blinking) {
    ctx.fillStyle = '#231c19';
    ctx.beginPath();
    ctx.arc(0.012, 0.004, 0.022 - startled * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }
  // The lid, drawn flat across the top of the eye: nothing impresses it.
  if (startled < 0.3 && !blinking) {
    ctx.fillStyle = 'rgba(40, 30, 28, 0.55)';
    ctx.fillRect(-0.05, -open - 0.01, 0.1, open * 0.9);
  }
  ctx.restore();
}

function drawHat(ctx: CanvasRenderingContext2D, hat: HatStyle) {
  ctx.save();
  ctx.translate(0.74, -1.74);
  ctx.rotate(0.12);
  switch (hat) {
    case 'straw':
      ctx.fillStyle = '#e8c25e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.3, 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -0.08, 0.15, 0.1, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#c44b3c';
      ctx.fillRect(-0.15, -0.05, 0.3, 0.035);
      break;
    case 'cowboy':
      ctx.fillStyle = '#8a5a34';
      ctx.beginPath();
      ctx.moveTo(-0.34, -0.06);
      ctx.quadraticCurveTo(0, 0.08, 0.34, -0.06);
      ctx.quadraticCurveTo(0, 0.02, -0.34, -0.06);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.15, -0.01);
      ctx.lineTo(-0.12, -0.2);
      ctx.quadraticCurveTo(0, -0.14, 0.12, -0.2);
      ctx.lineTo(0.15, -0.01);
      ctx.fill();
      break;
    case 'party':
      ctx.fillStyle = '#ff5e8a';
      ctx.beginPath();
      ctx.moveTo(-0.12, 0);
      ctx.lineTo(0, -0.36);
      ctx.lineTo(0.12, 0);
      ctx.fill();
      ctx.fillStyle = '#ffe45c';
      ctx.fillRect(-0.08, -0.12, 0.16, 0.035);
      ctx.beginPath();
      ctx.arc(0, -0.37, 0.045, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'flower':
      for (let petal = 0; petal < 6; petal++) {
        ctx.fillStyle = petal % 2 === 0 ? '#ff9ec4' : '#fff3a8';
        ctx.beginPath();
        ctx.arc(-0.2 + petal * 0.08, -0.03 - Math.sin(petal) * 0.02, 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'top':
      ctx.fillStyle = '#1f1b24';
      ctx.fillRect(-0.2, -0.03, 0.4, 0.05);
      ctx.fillRect(-0.12, -0.34, 0.24, 0.32);
      ctx.fillStyle = '#c44b3c';
      ctx.fillRect(-0.12, -0.09, 0.24, 0.05);
      break;
    case 'crown':
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(-0.16, 0);
      ctx.lineTo(-0.16, -0.16);
      ctx.lineTo(-0.08, -0.08);
      ctx.lineTo(0, -0.2);
      ctx.lineTo(0.08, -0.08);
      ctx.lineTo(0.16, -0.16);
      ctx.lineTo(0.16, 0);
      ctx.fill();
      ctx.fillStyle = '#e8364f';
      ctx.beginPath();
      ctx.arc(0, -0.05, 0.03, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function drawDazedStars(ctx: CanvasRenderingContext2D, time: number, facing: 1 | -1) {
  ctx.save();
  ctx.fillStyle = '#ffe45c';
  for (let index = 0; index < 3; index++) {
    const angle = time * 3 + (index * Math.PI * 2) / 3;
    const x = facing * 0.8 + Math.cos(angle) * 0.32;
    const y = -2.0 + Math.sin(angle) * 0.1;
    ctx.beginPath();
    for (let point = 0; point < 10; point++) {
      const radius = point % 2 === 0 ? 0.09 : 0.04;
      const spike = (point * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(x + Math.cos(spike) * radius, y + Math.sin(spike) * radius);
    }
    ctx.fill();
  }
  ctx.restore();
}

/** A soft shadow on the ground under a donkey, in the same local space. */
export function drawDonkeyShadow(ctx: CanvasRenderingContext2D, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.85, 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}
