import { TORPEDO_RANGE } from '../../engine/torpedo';
import type { World } from '../../engine/world';
import type { Palette } from '../palette';
import type { SideCamera } from './camera';
import { shade, withAlpha } from './colour';

/** The wake a running torpedo leaves on the surface, up to this long behind it, world units. */
const WAKE_LENGTH = 90;

/**
 * A torpedo's track: a streak of white water along the surface, brightest
 * over the torpedo and fading behind it, flecked with the bubbles that
 * rise from its propeller.
 */
function paintWake(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  x: number,
  direction: 1 | -1,
  sea: number,
  run: number,
  time: number,
) {
  const length = Math.min(WAKE_LENGTH, run);
  const head = camera.x(x);
  const tail = camera.x(x - direction * length);
  const y = camera.y(sea) - camera.scale * 0.25;
  const streak = ctx.createLinearGradient(head, 0, tail, 0);
  streak.addColorStop(0, withAlpha(palette.sea.foam, 0.95));
  streak.addColorStop(1, withAlpha(palette.sea.foam, 0));
  ctx.strokeStyle = streak;
  ctx.lineWidth = Math.max(2, camera.scale * 1.2);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(head, y);
  ctx.lineTo(tail, y);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // A boil of white water over the torpedo itself.
  ctx.fillStyle = withAlpha(palette.sea.foam, 0.9);
  ctx.beginPath();
  ctx.ellipse(head, y, camera.scale * 2.2, camera.scale * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(palette.sea.foam, 0.7);
  for (let fleck = 0; fleck < length; fleck += 3) {
    const hash = Math.abs(Math.sin((fleck + Math.floor(x)) * 12.9898) * 43758.5453) % 1;
    const fade = 1 - fleck / length;
    const size = camera.scale * (0.2 + hash * 0.45) * fade;
    const bob = Math.sin(time * 5 + fleck) * camera.scale * 0.15;
    ctx.beginPath();
    ctx.arc(
      camera.x(x - direction * fleck),
      y - camera.scale * hash * 0.6 + bob,
      size,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/**
 * Torpedoes: one falling is a dark cigar; one running is the same under
 * the surface, its propeller churning a trail of bubbles behind it and its
 * wake (see paintTorpedoWakes) on the surface above.
 */
export function paintTorpedoes(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const unit = camera.scale;
  for (const torpedo of world.torpedoes) {
    const x = camera.x(torpedo.x);
    const y = camera.y(torpedo.y);
    if (torpedo.state === 'running') {
      for (let bubble = 1; bubble <= 12; bubble++) {
        const behind = bubble * 2.2;
        const rise = Math.min(2.4, bubble * 0.2) + Math.sin(time * 6 + bubble) * 0.2;
        ctx.fillStyle = withAlpha(palette.sea.foam, 0.6 - bubble * 0.04);
        ctx.beginPath();
        ctx.arc(
          x - torpedo.direction * behind * unit,
          y - rise * unit,
          unit * (0.25 + (bubble % 3) * 0.12),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.atan2(torpedo.vy, torpedo.vx));
    ctx.fillStyle = shade(palette.metal, -0.25);
    ctx.beginPath();
    ctx.ellipse(0, 0, unit * 2.6, unit * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.metalShade;
    ctx.fillRect(-unit * 2.9, -unit * 0.55, unit * 0.4, unit * 1.1);
    ctx.restore();
  }
}

/** Over the surface, after the sea is drawn: every running torpedo's wake. */
export function paintTorpedoWakes(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const sea = world.map.sea?.level ?? 0;
  for (const torpedo of world.torpedoes) {
    if (torpedo.state !== 'running') continue;
    paintWake(
      ctx,
      camera,
      palette,
      torpedo.x,
      torpedo.direction,
      sea,
      TORPEDO_RANGE - torpedo.run,
      time,
    );
  }
}
