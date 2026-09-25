import { createRng } from '@shared/rng';
import { withAlpha } from './colour';
import { onMotionPreferenceChange, prefersReducedMotion } from './motion';
import { animate, stopAnimating } from './ticker';

/**
 * The room behind the cabinets: coloured light from machines drifting across
 * a hazy ceiling, pooling on a dark floor with a faint blacklight-carpet
 * pattern, and dust turning in the beams. Rendered at half resolution (it is
 * all soft light anyway) and at most 30 times a second.
 */
interface Light {
  colour: string;
  x: number;
  y: number;
  /** Drift amplitude and period, in viewport fractions and seconds. */
  swayX: number;
  swayY: number;
  periodX: number;
  periodY: number;
  radius: number;
  strength: number;
}

const LIGHTS: Light[] = [
  {
    colour: '#ff2e97',
    x: 0.16,
    y: 0.1,
    swayX: 0.1,
    swayY: 0.05,
    periodX: 71,
    periodY: 53,
    radius: 0.6,
    strength: 0.2,
  },
  {
    colour: '#1fd8ff',
    x: 0.84,
    y: 0.16,
    swayX: 0.08,
    swayY: 0.06,
    periodX: 83,
    periodY: 61,
    radius: 0.55,
    strength: 0.16,
  },
  {
    colour: '#7b4dff',
    x: 0.5,
    y: -0.05,
    swayX: 0.18,
    swayY: 0.04,
    periodX: 97,
    periodY: 67,
    radius: 0.65,
    strength: 0.15,
  },
  {
    colour: '#ffae3b',
    x: 0.7,
    y: 0.78,
    swayX: 0.12,
    swayY: 0.05,
    periodX: 89,
    periodY: 79,
    radius: 0.45,
    strength: 0.08,
  },
];

const CARPET_COLOURS = ['#ff3fa4', '#3ff3ff', '#ffe066', '#9b6bff'];
const HORIZON = 0.62;
const RENDER_SCALE = 0.5;
const FRAME_SECONDS = 1 / 30;

interface Mote {
  x: number;
  y: number;
  speed: number;
  sway: number;
  phase: number;
  size: number;
}

export function startAmbience(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const rng = createRng('late-night-arcade');
  const motes: Mote[] = Array.from({ length: 46 }, () => ({
    x: rng.next(),
    y: rng.next(),
    speed: rng.float(0.004, 0.012),
    sway: rng.float(0.004, 0.015),
    phase: rng.float(0, Math.PI * 2),
    size: rng.float(0.6, 1.6),
  }));
  const carpetSeed = rng.int(0, 2 ** 31);

  let floor: HTMLCanvasElement | null = null;
  let time = 40;
  let sinceLastDraw = FRAME_SECONDS;

  const resize = () => {
    canvas.width = Math.max(1, Math.round(window.innerWidth * RENDER_SCALE));
    canvas.height = Math.max(1, Math.round(window.innerHeight * RENDER_SCALE));
    floor = paintFloor(canvas.width, canvas.height, carpetSeed);
    draw();
  };

  const draw = () => {
    const { width, height } = canvas;
    ctx.globalCompositeOperation = 'source-over';
    const backdrop = ctx.createLinearGradient(0, 0, 0, height);
    backdrop.addColorStop(0, '#0a0718');
    backdrop.addColorStop(HORIZON, '#06050d');
    backdrop.addColorStop(1, '#030207');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);
    if (floor) ctx.drawImage(floor, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    const size = Math.max(width, height);
    for (const light of LIGHTS) {
      const { x, y } = lightPosition(light, time);
      paintGlow(ctx, x * width, y * height, light.radius * size, light.colour, light.strength);
      // Each light leaves a flattened pool on the floor beneath it.
      ctx.save();
      ctx.translate(x * width, height * (HORIZON + (1 - HORIZON) * 0.55));
      ctx.scale(1, 0.22);
      paintGlow(ctx, 0, 0, light.radius * size * 0.55, light.colour, light.strength * 0.7);
      ctx.restore();
    }

    for (const mote of motes) {
      const y = (((mote.y - time * mote.speed) % 1) + 1) % 1;
      const x = mote.x + Math.sin(time * 0.3 + mote.phase) * mote.sway;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 1.3 + mote.phase * 3);
      ctx.fillStyle = `rgba(255, 240, 255, ${0.05 + twinkle * 0.2 * (1 - y * 0.6)})`;
      ctx.fillRect(x * width, y * height * HORIZON * 1.1, mote.size, mote.size);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const tick = (delta: number) => {
    time += delta;
    sinceLastDraw += delta;
    if (sinceLastDraw >= FRAME_SECONDS) {
      sinceLastDraw = 0;
      draw();
    }
    return true;
  };

  const applyMotionPreference = () => {
    if (prefersReducedMotion()) {
      stopAnimating(tick);
      draw();
    } else {
      animate(tick);
    }
  };

  window.addEventListener('resize', resize);
  const stopListening = onMotionPreferenceChange(applyMotionPreference);
  resize();
  applyMotionPreference();

  return () => {
    stopAnimating(tick);
    stopListening();
    window.removeEventListener('resize', resize);
  };
}

function lightPosition(light: Light, time: number) {
  return {
    x: light.x + Math.sin((time / light.periodX) * Math.PI * 2) * light.swayX,
    y: light.y + Math.sin((time / light.periodY) * Math.PI * 2 + 1.3) * light.swayY,
  };
}

function paintGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: string,
  strength: number,
) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, withAlpha(colour, strength));
  glow.addColorStop(0.45, withAlpha(colour, strength * 0.35));
  glow.addColorStop(1, withAlpha(colour, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** The floor never moves, so it is painted once per size and reused every frame. */
function paintFloor(width: number, height: number, seed: number): HTMLCanvasElement {
  const floor = document.createElement('canvas');
  floor.width = width;
  floor.height = height;
  const ctx = floor.getContext('2d');
  if (!ctx) return floor;

  const horizonY = height * HORIZON;
  const depth = height - horizonY;
  const vanishX = width / 2;

  const shade = ctx.createLinearGradient(0, horizonY, 0, height);
  shade.addColorStop(0, 'rgba(20, 12, 40, 0.0)');
  shade.addColorStop(1, 'rgba(20, 12, 40, 0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, horizonY, width, depth);

  // Perspective grid: rails meet at the vanishing point, rungs crowd the horizon.
  ctx.lineWidth = 1;
  for (let i = -16; i <= 16; i++) {
    const endX = vanishX + i * width * 0.14;
    const rail = ctx.createLinearGradient(0, horizonY, 0, height);
    rail.addColorStop(0, 'rgba(123, 77, 255, 0)');
    rail.addColorStop(1, 'rgba(123, 77, 255, 0.22)');
    ctx.strokeStyle = rail;
    ctx.beginPath();
    ctx.moveTo(vanishX + i * width * 0.012, horizonY);
    ctx.lineTo(endX, height);
    ctx.stroke();
  }
  for (let i = 1; i <= 14; i++) {
    const t = (i / 14) ** 2.2;
    ctx.strokeStyle = `rgba(123, 77, 255, ${0.03 + t * 0.22})`;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + depth * t);
    ctx.lineTo(width, horizonY + depth * t);
    ctx.stroke();
  }

  const rng = createRng(seed);
  for (let i = 0; i < 150; i++) {
    const nearness = rng.next() ** 0.7;
    const y = horizonY + depth * nearness * nearness;
    const spread = 0.2 + nearness * 1.4;
    const x = vanishX + (rng.next() - 0.5) * width * spread;
    const size = 0.6 + nearness * 3.2;
    ctx.strokeStyle = withAlpha(rng.pick(CARPET_COLOURS), 0.04 + nearness * 0.13);
    ctx.lineWidth = Math.max(0.6, size * 0.35);
    drawConfetti(ctx, rng.int(0, 3), x, y, size, rng.float(0, Math.PI));
  }

  const horizonGlow = ctx.createLinearGradient(0, horizonY - 6, 0, horizonY + 6);
  horizonGlow.addColorStop(0, 'rgba(155, 107, 255, 0)');
  horizonGlow.addColorStop(0.5, 'rgba(155, 107, 255, 0.14)');
  horizonGlow.addColorStop(1, 'rgba(155, 107, 255, 0)');
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, horizonY - 6, width, 12);
  return floor;
}

/** The squiggles, rings, triangles and sparks of an old arcade carpet. */
function drawConfetti(
  ctx: CanvasRenderingContext2D,
  kind: number,
  x: number,
  y: number,
  size: number,
  angle: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Squash vertically: the shapes lie flat on the floor.
  ctx.scale(1, 0.45);
  ctx.beginPath();
  switch (kind) {
    case 0:
      ctx.moveTo(-size * 1.5, 0);
      ctx.quadraticCurveTo(-size * 0.75, -size, 0, 0);
      ctx.quadraticCurveTo(size * 0.75, size, size * 1.5, 0);
      break;
    case 1:
      ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
      break;
    case 2:
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.9, size * 0.6);
      ctx.lineTo(-size * 0.9, size * 0.6);
      ctx.closePath();
      break;
    default:
      ctx.moveTo(-size, 0);
      ctx.lineTo(size, 0);
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size);
  }
  ctx.stroke();
  ctx.restore();
}
