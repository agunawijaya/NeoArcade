import type { Target } from '../../engine/world';
import type { Palette } from '../palette';
import { mix, shade, withAlpha } from './colour';

/** What each theme builds its airship sheds of: walls, the roof's light side, the ribs. */
function shedColours(
  palette: Palette,
  accent: string,
): { wall: string; light: string; rib: string } {
  if (palette.theme === 'cyan-magenta')
    return { wall: mix(accent, '#ffffff', 0.35), light: '#ffffff', rib: shade(accent, -0.2) };
  if (palette.theme === 'airshow') return { wall: '#f4efe2', light: '#ffffff', rib: accent };
  return {
    wall: mix(palette.metal, palette.ink, 0.35),
    light: mix(palette.metal, palette.sky[1], 0.25),
    rib: shade(palette.metal, -0.35),
  };
}

/**
 * An airship shed: a long, tall barrel vault of corrugated iron (striped
 * canvas at the Airshow, painted boards in the cartoon war), its doors
 * open at one end on the grey nose of the airship inside. Drawn with its
 * foot at the origin, one world unit to `unit` pixels.
 */
export function paintShed(
  ctx: CanvasRenderingContext2D,
  unit: number,
  target: Target,
  palette: Palette,
  accent: string,
  time: number,
) {
  const half = (target.width / 2) * unit;
  const height = target.height * unit;
  const { wall, light, rib } = shedColours(palette, accent);
  const vault = () => {
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(-half, -height * 0.55);
    ctx.bezierCurveTo(
      -half * 0.95,
      -height * 1.1,
      half * 0.95,
      -height * 1.1,
      half,
      -height * 0.55,
    );
    ctx.lineTo(half, 0);
    ctx.closePath();
  };
  vault();
  const side = ctx.createLinearGradient(0, -height, 0, 0);
  side.addColorStop(0, light);
  side.addColorStop(0.35, wall);
  side.addColorStop(1, shade(wall, -0.25));
  ctx.fillStyle = side;
  ctx.fill();
  ctx.save();
  vault();
  ctx.clip();
  // Corrugations, or the stripes of a show tent.
  if (palette.theme === 'airshow') {
    for (let stripe = 0; stripe * unit * 3 < half * 2; stripe += 2) {
      ctx.fillStyle = withAlpha(rib, 0.85);
      ctx.fillRect(-half + stripe * unit * 3, -height, unit * 3, height);
    }
  } else {
    ctx.strokeStyle = withAlpha(rib, 0.55);
    ctx.lineWidth = Math.max(1, unit * 0.18);
    ctx.beginPath();
    for (let x = -half + unit * 1.5; x < half; x += unit * 1.5) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, -height);
    }
    ctx.stroke();
  }
  // The doors open at the far end, the airship's nose in the dark.
  const door = half * 0.78;
  ctx.fillStyle = shade(palette.ink, 0.08);
  ctx.beginPath();
  ctx.moveTo(door, 0);
  ctx.lineTo(door, -height * 0.62);
  ctx.quadraticCurveTo(half * 0.9, -height * 0.92, half, -height * 0.62);
  ctx.lineTo(half, 0);
  ctx.closePath();
  ctx.fill();
  const envelope = palette.theme === 'cyan-magenta' ? '#f2a6c8' : mix('#c9ccd0', palette.ink, 0.2);
  ctx.fillStyle = envelope;
  ctx.beginPath();
  ctx.ellipse(
    door + unit * 0.2,
    -height * 0.42,
    half * 0.3,
    height * 0.26,
    0,
    -Math.PI / 2,
    Math.PI / 2,
  );
  ctx.fill();
  ctx.restore();
  // A windsock on the ridge, to show which way the airship must come out.
  const flag = Math.sin(time * 4 + target.x) * unit * 0.4;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(1, unit * 0.2);
  ctx.beginPath();
  ctx.moveTo(-half * 0.6, -height * 1.0);
  ctx.lineTo(-half * 0.6, -height * 1.0 - unit * 4);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-half * 0.6, -height - unit * 4);
  ctx.lineTo(-half * 0.6 + unit * 3, -height - unit * 3.4 + flag);
  ctx.lineTo(-half * 0.6, -height - unit * 2.8);
  ctx.closePath();
  ctx.fill();
}
