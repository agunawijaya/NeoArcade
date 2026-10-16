import type { Camera } from '../camera';
import type { Vec3 } from '../geometry';

/**
 * The cruiser's light bar: two rotating beacons, red on the driver's side
 * and blue on the other, each a mirror turning behind a coloured dome. From
 * any one place the turning mirror is seen as a pulse, the red and the blue
 * half a turn apart. They turn slowly enough to stay under three flashes a
 * second, and with reduced motion they glow steadily instead.
 */
export interface BarFlash {
  red: number;
  blue: number;
}

/** Turns of the mirror per second. */
const SPIN = 1.4;

export function barFlash(time: number, reducedMotion: boolean): BarFlash {
  if (reducedMotion) return { red: 0.7, blue: 0.7 };
  const turn = time * SPIN * Math.PI * 2;
  const pulse = (angle: number) => 0.12 + 0.88 * Math.pow(Math.max(0, Math.cos(angle)), 5);
  return { red: pulse(turn), blue: pulse(turn + Math.PI) };
}

export const BAR_RED = '255, 46, 38';
export const BAR_BLUE = '56, 120, 255';

/** The domes alight, with halos the bloom spreads further after dark. */
export function drawBeacons(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  red: Vec3,
  blue: Vec3,
  flash: BarFlash,
  night: number,
) {
  for (const [at, power, colour] of [
    [red, flash.red, BAR_RED],
    [blue, flash.blue, BAR_BLUE],
  ] as const) {
    const point = camera.project(at);
    const size = Math.max(1.6, 0.3 * camera.pixelsAt(at));
    // Even far off, a beacon is the brightest thing in sight.
    const reach = Math.max(size * (4 + night * 14), 12 + night * 18) * (0.4 + power);
    const halo = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, reach);
    halo.addColorStop(0, `rgba(${colour}, ${0.8 * power})`);
    halo.addColorStop(0.2, `rgba(${colour}, ${0.32 * power})`);
    halo.addColorStop(1, `rgba(${colour}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(point.x - reach, point.y - reach, reach * 2, reach * 2);
    // A flat streak of glare across the beacon when it faces the eye.
    if (power > 0.4) {
      const streak = ctx.createLinearGradient(point.x - reach * 1.6, 0, point.x + reach * 1.6, 0);
      streak.addColorStop(0, `rgba(${colour}, 0)`);
      streak.addColorStop(0.5, `rgba(255, 255, 255, ${0.5 * (power - 0.4) * (0.4 + night)})`);
      streak.addColorStop(1, `rgba(${colour}, 0)`);
      ctx.fillStyle = streak;
      ctx.fillRect(point.x - reach * 1.6, point.y - size * 0.25, reach * 3.2, size * 0.5);
    }
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + power * 0.65})`;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, size * 0.9, size * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${colour}, ${0.55 + power * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, size, size * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The beacons' light on whatever is near: a red and a blue wash laid over
 * an area of the canvas (already clipped by the caller), strongest at night.
 */
export function washWith(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  flash: BarFlash,
  strength: number,
  squash = 1,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  ctx.scale(1, squash);
  for (const [power, colour, shift] of [
    [flash.red, BAR_RED, -0.22],
    [flash.blue, BAR_BLUE, 0.22],
  ] as const) {
    const cx = radius * shift;
    const glow = ctx.createRadialGradient(cx, 0, 0, cx, 0, radius);
    glow.addColorStop(0, `rgba(${colour}, ${0.55 * power * strength})`);
    glow.addColorStop(0.45, `rgba(${colour}, ${0.18 * power * strength})`);
    glow.addColorStop(1, `rgba(${colour}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius, -radius, radius * 2, radius * 2);
  }
  ctx.restore();
}
