import { createRng } from '@shared/rng';
import { css, lit, litRgb, shade, type Lighting } from './colour';
import { lightingFor, paintSky } from './sky';
import { daylight } from './sun';
import { environmentFor } from './vehicles/light';
import { drawOfficerSide } from './vehicles/officer';
import { PATROL, SEDAN, SEDAN_LIGHTS_OFF } from './vehicles/sedan/model';
import { drawSedan, sedanSideCamera } from './vehicles/sedan/sedan';

/**
 * The two places a police stop can end up: the courthouse on the town
 * square, where the clock runs through the hours of waiting for the judge,
 * and the county jail, where a fourth offence ends the trip. Both are
 * painted for the hour of the day on the clock, under the road's own sky.
 */
export interface HearingFrame {
  /** 0 → 1 through the hearing. */
  progress: number;
  /** The hour of the day the stop began (0–23) and the hours spent waiting for the judge. */
  hour: number;
  waitHours: number;
  time: number;
  reducedMotion: boolean;
}

export interface JailFrame {
  progress: number;
  hour: number;
  time: number;
  reducedMotion: boolean;
}

const LIMESTONE = '#ddd0b0';
const BRICK = '#8c4a38';
const LAWN = '#5f8a46';
const TREE = '#3f6b37';
const WARM_WINDOW = 'rgba(255, 206, 128,';
const SIGN_FONT = '"Arial Narrow", system-ui, sans-serif';

/** Roughly where the sun stands at an hour of the day, for painting the sky. */
function sunAt(hour: number): { altitude: number; arc: number } {
  const day = (hour - 6) / 12;
  return { altitude: Math.sin(day * Math.PI) * 52 - 6, arc: Math.max(0, Math.min(1, day)) };
}

interface Backdrop {
  light: Lighting;
  night: number;
  horizon: number;
  altitude: number;
}

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hour: number,
  frame: { time: number; reducedMotion: boolean },
): Backdrop {
  const sun = sunAt(hour);
  const horizon = height * 0.6;
  paintSky(
    ctx,
    width,
    horizon,
    { sunAltitude: sun.altitude, sunArc: sun.arc, condition: 'clear', time: frame.time, scroll: 0 },
    frame.reducedMotion,
  );
  return {
    light: lightingFor(sun.altitude, 'clear'),
    night: 1 - daylight(sun.altitude),
    horizon,
    altitude: sun.altitude,
  };
}

/** The town beyond: a row of low storefronts and a water tower against the sky. */
function paintTown(ctx: CanvasRenderingContext2D, width: number, backdrop: Backdrop) {
  const { horizon, light, night } = backdrop;
  const rng = createRng('county-seat');
  const block = lit('#8d8577', light, 0.45);
  let x = -10;
  while (x < width) {
    const w = width * rng.float(0.06, 0.11);
    const h = horizon * rng.float(0.08, 0.16);
    ctx.fillStyle = block;
    ctx.fillRect(x, horizon - h, w + 1, h + 1);
    if (night > 0.5 && rng.next() < 0.6) {
      ctx.fillStyle = `${WARM_WINDOW} ${0.6 * night})`;
      ctx.fillRect(x + w * 0.3, horizon - h * 0.6, w * 0.15, h * 0.2);
    }
    x += w;
  }
  const tower = width * 0.87;
  ctx.fillStyle = lit('#7c7a74', light, 0.4);
  ctx.fillRect(tower - width * 0.02, horizon - horizon * 0.3, 2, horizon * 0.2);
  ctx.fillRect(tower + width * 0.02, horizon - horizon * 0.3, 2, horizon * 0.2);
  ctx.beginPath();
  ctx.ellipse(
    tower + 1,
    horizon - horizon * 0.33,
    width * 0.032,
    horizon * 0.055,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function paintTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  size: number,
  light: Lighting,
) {
  ctx.fillStyle = lit('#4a3a2a', light);
  ctx.fillRect(x - size * 0.06, base - size * 0.7, size * 0.12, size * 0.7);
  const leaves = litRgb(TREE, light);
  for (const [dx, dy, r, tone] of [
    [0, -1.05, 0.55, 0],
    [-0.32, -0.85, 0.4, -0.12],
    [0.34, -0.82, 0.42, -0.18],
    [0.05, -1.3, 0.36, 0.08],
  ] as const) {
    ctx.fillStyle = css(shade(leaves, tone));
    ctx.beginPath();
    ctx.arc(x + dx * size, base + dy * size, r * size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A street lamp on its post; lit after dark. */
function paintLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  size: number,
  backdrop: Backdrop,
) {
  ctx.fillStyle = lit('#2c2f33', backdrop.light);
  ctx.fillRect(x - size * 0.02, base - size, size * 0.04, size);
  ctx.fillRect(x - size * 0.07, base - size * 1.08, size * 0.14, size * 0.1);
  if (backdrop.night < 0.35) return;
  const glow = ctx.createRadialGradient(
    x,
    base - size * 1.03,
    0,
    x,
    base - size * 1.03,
    size * 0.6,
  );
  glow.addColorStop(0, `rgba(255, 220, 150, ${0.75 * backdrop.night})`);
  glow.addColorStop(1, 'rgba(255, 220, 150, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - size * 0.6, base - size * 1.63, size * 1.2, size * 1.2);
}

/**
 * The courthouse at the hour on its clock: limestone, a columned porch up
 * a flight of steps, a clock tower with a cupola. The clock's hands run
 * through the hours of waiting as the hearing plays.
 */
export function paintHearing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: HearingFrame,
) {
  const eased = frame.reducedMotion
    ? 1
    : frame.progress * frame.progress * (3 - 2 * frame.progress);
  const hour = frame.hour + frame.waitHours * eased;
  const backdrop = paintBackdrop(ctx, width, height, hour, frame);
  const { light, night, horizon } = backdrop;
  paintTown(ctx, width, backdrop);
  ctx.fillStyle = lit(LAWN, light, 0.1);
  ctx.fillRect(0, horizon, width, height - horizon);
  ctx.fillStyle = lit('#4b4d52', light);
  ctx.fillRect(0, height * 0.9, width, height * 0.1);
  ctx.fillStyle = lit('#b9b3a4', light);
  ctx.fillRect(0, height * 0.88, width, height * 0.025);

  const unit = Math.min(width / 100, height / 56);
  const centre = width / 2;
  const base = height * 0.8;
  const stone = litRgb(LIMESTONE, light);
  const shadow = css(shade(stone, -0.22));

  // The two wings.
  const wing = unit * 30;
  const floors = unit * 19;
  ctx.fillStyle = css(stone);
  ctx.fillRect(centre - wing, base - floors, wing * 2, floors);
  ctx.fillStyle = shadow;
  ctx.fillRect(centre - wing, base - floors, wing * 2, unit * 1.2);
  ctx.fillRect(centre - wing, base - floors * 0.5, wing * 2, unit * 0.5);
  for (const row of [0.22, 0.62])
    for (let column = 0; column < 10; column++) {
      const x = centre - wing + unit * 2.4 + column * unit * 5.6;
      if (Math.abs(x + unit * 1.1 - centre) < unit * 10) continue;
      paintWindow(
        ctx,
        x,
        base - floors + floors * row,
        unit * 2.2,
        floors * 0.28,
        backdrop,
        column + row,
      );
    }

  // The porch: steps, columns, the pediment with its name.
  ctx.fillStyle = css(shade(stone, -0.08));
  for (let step = 0; step < 4; step++) {
    const w = unit * (11 + step * 1.6);
    ctx.fillRect(centre - w, base - unit * (step + 1) * 0.9 + unit * 3.6, w * 2, unit * 0.9);
  }
  ctx.fillStyle = css(stone);
  ctx.fillRect(
    centre - unit * 10,
    base - floors - unit * 2,
    unit * 20,
    floors + unit * 2 - unit * 0.1,
  );
  ctx.fillStyle = 'rgba(30, 24, 18, 0.35)';
  ctx.fillRect(centre - unit * 9, base - floors + unit * 2.5, unit * 18, floors - unit * 2.5);
  if (night > 0.4) {
    ctx.fillStyle = `${WARM_WINDOW} ${0.55 * night})`;
    ctx.fillRect(centre - unit * 2, base - unit * 7, unit * 4, unit * 7);
  }
  for (let column = 0; column < 4; column++) {
    const x = centre - unit * 8 + column * unit * 5.33;
    const shaft = ctx.createLinearGradient(x - unit, 0, x + unit, 0);
    shaft.addColorStop(0, css(shade(stone, 0.15)));
    shaft.addColorStop(1, shadow);
    ctx.fillStyle = shaft;
    ctx.fillRect(x - unit * 0.9, base - floors + unit * 1.5, unit * 1.8, floors - unit * 1.5);
  }
  ctx.fillStyle = css(shade(stone, 0.05));
  ctx.beginPath();
  ctx.moveTo(centre - unit * 11, base - floors - unit * 1.6);
  ctx.lineTo(centre, base - floors - unit * 8);
  ctx.lineTo(centre + unit * 11, base - floors - unit * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadow;
  ctx.fillRect(centre - unit * 11, base - floors - unit * 1.6, unit * 22, unit * 1.6);
  ctx.fillStyle = css(shade(stone, -0.55));
  ctx.font = `700 ${unit * 1.15}px ${SIGN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COUNTY  COURTHOUSE', centre, base - floors - unit * 0.8);

  // The clock tower and its cupola.
  const towerTop = base - floors - unit * 20;
  ctx.fillStyle = css(shade(stone, -0.04));
  ctx.fillRect(centre - unit * 4.5, towerTop, unit * 9, unit * 13);
  ctx.fillStyle = shadow;
  ctx.fillRect(centre + unit * 2.5, towerTop, unit * 2, unit * 13);
  ctx.fillStyle = lit('#5b6b5e', light);
  ctx.beginPath();
  ctx.moveTo(centre - unit * 5, towerTop);
  ctx.quadraticCurveTo(centre - unit * 4.5, towerTop - unit * 6, centre, towerTop - unit * 7.5);
  ctx.quadraticCurveTo(centre + unit * 4.5, towerTop - unit * 6, centre + unit * 5, towerTop);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(centre - unit * 0.15, towerTop - unit * 10, unit * 0.3, unit * 3);
  paintClock(ctx, centre, towerTop + unit * 5.6, unit * 3.2, hour, backdrop);

  paintTree(ctx, width * 0.1, base + unit * 2, unit * 9, light);
  paintTree(ctx, width * 0.9, base + unit * 2.5, unit * 10, light);
  paintLamp(ctx, centre - unit * 15, height * 0.88, unit * 9, backdrop);
  paintLamp(ctx, centre + unit * 15, height * 0.88, unit * 9, backdrop);
}

function paintWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  backdrop: Backdrop,
  seed: number,
) {
  const lit = backdrop.night > 0.45 && Math.sin(seed * 12.9) > -0.3;
  ctx.fillStyle = lit
    ? `${WARM_WINDOW} ${0.5 + 0.4 * backdrop.night})`
    : css(litRgb('#3c4656', backdrop.light));
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(x + width * 0.46, y, width * 0.08, height);
  ctx.fillRect(x, y + height * 0.46, width, height * 0.06);
}

/** The tower clock: a pale face, lit from inside after dark, its hands at the hour. */
function paintClock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hour: number,
  backdrop: Backdrop,
) {
  ctx.fillStyle = backdrop.night > 0.45 ? '#f6e7bf' : css(litRgb('#f4efe2', backdrop.light));
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = css(litRgb('#2a2620', backdrop.light));
  ctx.lineWidth = radius * 0.1;
  ctx.stroke();
  ctx.fillStyle = '#2a2620';
  for (let mark = 0; mark < 12; mark++) {
    const angle = (mark / 12) * Math.PI * 2;
    ctx.fillRect(
      x + Math.sin(angle) * radius * 0.78 - radius * 0.04,
      y - Math.cos(angle) * radius * 0.78 - radius * 0.04,
      radius * 0.08,
      radius * 0.08,
    );
  }
  const minutes = (hour % 1) * Math.PI * 2;
  const hours = ((hour % 12) / 12) * Math.PI * 2;
  ctx.strokeStyle = '#1d1a16';
  ctx.lineCap = 'round';
  for (const [angle, length, width] of [
    [hours, 0.5, 0.12],
    [minutes, 0.75, 0.08],
  ] as const) {
    ctx.lineWidth = radius * width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(angle) * radius * length, y - Math.cos(angle) * radius * length);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/**
 * The county jail: a squat brick block behind a fence, barred windows, a
 * caged lamp over a steel door. The cruiser pulls up and the trooper walks
 * the driver to the door.
 */
export function paintJail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: JailFrame,
) {
  const backdrop = paintBackdrop(ctx, width, height, frame.hour, frame);
  const { light, night, horizon } = backdrop;
  ctx.fillStyle = lit('#8b8a73', light, 0.15);
  ctx.fillRect(0, horizon, width, height - horizon);
  ctx.fillStyle = lit('#55575b', light);
  ctx.fillRect(0, height * 0.84, width, height * 0.16);

  const unit = Math.min(width / 100, height / 56);
  const base = height * 0.78;
  const left = width * 0.3;
  const right = width * 0.94;
  const top = base - unit * 22;
  const brick = litRgb(BRICK, light);
  ctx.fillStyle = css(brick);
  ctx.fillRect(left, top, right - left, base - top);
  // Courses of brick, and the parapet's coping.
  ctx.fillStyle = css(shade(brick, -0.18));
  for (let course = top + unit * 1.2; course < base; course += unit * 1.2)
    ctx.fillRect(left, course, right - left, Math.max(1, unit * 0.12));
  ctx.fillStyle = lit('#b6ad9c', light);
  ctx.fillRect(left - unit, top - unit, right - left + unit * 2, unit * 1.2);
  // The sign has its own lamp, so it reads at any hour.
  const signLight = { ...light, day: Math.max(light.day, 0.75) };
  ctx.fillStyle = lit('#e9e3d2', signLight);
  ctx.fillRect(left + unit * 10, top + unit * 2.5, unit * 26, unit * 3.4);
  ctx.fillStyle = lit('#2b2b2e', signLight);
  ctx.font = `800 ${unit * 2}px ${SIGN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COUNTY  JAIL', left + unit * 23, top + unit * 4.25);
  for (let index = 0; index < 4; index++) {
    const x = left + unit * (42 + index * 9);
    paintBarredWindow(ctx, x, top + unit * 6, unit * 4.4, unit * 5, backdrop);
  }
  // The steel door, and its caged lamp.
  const door = left + unit * 18;
  ctx.fillStyle = lit('#4d5358', light);
  ctx.fillRect(door, base - unit * 11, unit * 7, unit * 11);
  ctx.fillStyle = lit('#2b2f33', light);
  ctx.fillRect(door + unit * 2.6, base - unit * 9.5, unit * 1.8, unit * 2.4);
  const lamp = { x: door + unit * 3.5, y: base - unit * 13 };
  ctx.fillStyle = night > 0.35 ? '#ffe2a0' : lit('#d8d4c8', light);
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y, unit * 0.9, 0, Math.PI * 2);
  ctx.fill();
  if (night > 0.35) {
    // The lamp lights the bricks round the door and a pool on the ground.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const wash = ctx.createRadialGradient(
      lamp.x,
      lamp.y + unit * 4,
      0,
      lamp.x,
      lamp.y + unit * 4,
      unit * 22,
    );
    wash.addColorStop(0, `rgba(255, 196, 120, ${0.32 * night})`);
    wash.addColorStop(1, 'rgba(255, 196, 120, 0)');
    ctx.fillStyle = wash;
    ctx.fillRect(lamp.x - unit * 22, lamp.y - unit * 18, unit * 44, unit * 44);
    ctx.restore();
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, unit * 8);
    glow.addColorStop(0, `rgba(255, 228, 170, ${0.7 * night})`);
    glow.addColorStop(1, 'rgba(255, 228, 170, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lamp.x - unit * 8, lamp.y - unit * 8, unit * 16, unit * 16);
  }

  paintFence(ctx, 0, left - unit * 2, base, unit, light);

  // The cruiser at the kerb, its bar dark now; the driver walked to the door.
  const env = environmentFor({
    sunAltitude: backdrop.altitude,
    condition: 'clear',
    sun: [-0.3, 0.5, 0.8],
    ground: '#55575b',
    horizon: '#8b8a73',
  });
  const scale = unit * 1.15;
  const carLeft = width * 0.05;
  const kerb = height * 0.92;
  drawSedan(ctx, sedanSideCamera(carLeft, kerb, scale), {
    model: PATROL,
    state: {
      lights: { ...SEDAN_LIGHTS_OFF, head: night > 0.4, markers: night > 0.4, driver: false },
      turn: 0,
      steer: 0,
      sway: 0,
      door: 1,
    },
    env,
    time: frame.time,
    reducedMotion: frame.reducedMotion,
  });
  const walked = frame.reducedMotion ? 1 : Math.min(1, frame.progress / 0.85);
  const from = carLeft + SEDAN.length * scale * 0.6;
  const to = door + unit * 3.5;
  const x = from + (to - from) * walked;
  const ground = base + (kerb - base) * (1 - walked) * 0.8;
  const stride = walked * 9;
  const look = { light: { ...light, day: Math.max(light.day, 0.35) }, night, time: frame.time };
  if (walked < 1) {
    drawDriverSide(ctx, x + unit * 2.2, ground, unit * 0.95, stride, look.light);
    drawOfficerSide(
      ctx,
      x,
      ground,
      unit * 0.95,
      { along: 0, out: 0, stride, walking: true, facing: 1, atWindow: 0, writing: false },
      look,
    );
  }
}

function paintBarredWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  backdrop: Backdrop,
) {
  ctx.fillStyle =
    backdrop.night > 0.5
      ? `${WARM_WINDOW} ${0.35 * backdrop.night})`
      : lit('#2f3640', backdrop.light);
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = lit('#1c1d20', backdrop.light);
  for (let bar = 1; bar < 5; bar++) ctx.fillRect(x + (width * bar) / 5 - 1, y, 2, height);
  ctx.fillStyle = lit('#c9c1af', backdrop.light);
  ctx.fillRect(x - width * 0.1, y + height, width * 1.2, height * 0.12);
}

/** Chain link on posts, with a coil of wire along the top. */
function paintFence(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  base: number,
  unit: number,
  light: Lighting,
) {
  const top = base - unit * 13;
  ctx.strokeStyle = lit('#9aa0a6', light);
  ctx.lineWidth = Math.max(1, unit * 0.12);
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let x = from - unit * 13; x < to; x += unit * 1.4) {
    ctx.moveTo(x, base);
    ctx.lineTo(Math.min(to, x + unit * 13), top);
    ctx.moveTo(Math.min(to, x + unit * 13), base);
    ctx.lineTo(x, top);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = lit('#6f757b', light);
  for (let x = from + unit * 2; x < to; x += unit * 10)
    ctx.fillRect(x, top - unit, unit * 0.5, base - top + unit);
  ctx.strokeStyle = lit('#b9bec4', light);
  ctx.lineWidth = Math.max(1, unit * 0.15);
  ctx.beginPath();
  for (let x = from; x < to; x += unit * 1.6)
    ctx.arc(x, top - unit * 1.2, unit * 0.9, 0, Math.PI * 2);
  ctx.stroke();
}

/** The driver, led in: jeans, a plaid shirt, a cap. */
function drawDriverSide(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  stride: number,
  light: Lighting,
) {
  const swing = Math.sin(stride * Math.PI) * 0.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const [angle, tone] of [
    [-swing, -0.15],
    [swing, 0],
  ] as const) {
    ctx.save();
    ctx.translate(0, -3.1);
    ctx.rotate(angle);
    ctx.fillStyle = css(shade(litRgb('#35507a', light), tone));
    ctx.fillRect(-0.24, 0, 0.48, 2.8);
    ctx.fillStyle = css(shade(litRgb('#5a3d26', light), tone));
    ctx.fillRect(-0.24, 2.75, 0.6, 0.35);
    ctx.restore();
  }
  ctx.fillStyle = lit('#9b2f2a', light);
  ctx.fillRect(-0.45, -5.2, 0.9, 2.2);
  ctx.fillStyle = lit('#6e1e1b', light);
  for (let line = 0; line < 4; line++) ctx.fillRect(-0.45, -5.0 + line * 0.5, 0.9, 0.08);
  // Hands behind his back.
  ctx.fillStyle = lit('#c08a64', light);
  ctx.fillRect(-0.62, -3.5, 0.24, 0.3);
  ctx.beginPath();
  ctx.ellipse(0.04, -5.6, 0.3, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit('#2d4a2b', light);
  ctx.beginPath();
  ctx.ellipse(0.02, -5.86, 0.34, 0.2, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(0.02, -5.9, 0.6, 0.1);
  ctx.restore();
}
