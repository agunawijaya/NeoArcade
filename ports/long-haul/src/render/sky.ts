import { createRng } from '@shared/rng';
import type { ConditionId } from '../engine/conditions';
import { css, mix, rgb, type Lighting, type Rgb } from './colour';
import { daylight } from './sun';

/**
 * The sky behind both views: a gradient that follows the sun's height, the
 * sun or the moon, stars, and clouds that thicken with the weather.
 */
export interface SkyState {
  /** Sun altitude in degrees at the rig. */
  sunAltitude: number;
  /** 0 east … 1 west across the frame. */
  sunArc: number;
  condition: ConditionId;
  /** Seconds since the scene started, for drifting clouds. */
  time: number;
  /** How far the world has scrolled, for parallax. */
  scroll: number;
}

const DAY_TOP = rgb('#3d7fd6');
const DAY_BOTTOM = rgb('#bfe2f5');
const DUSK_TOP = rgb('#2c3d7a');
const DUSK_BOTTOM = rgb('#ff9a62');
const NIGHT_TOP = rgb('#060a1c');
const NIGHT_BOTTOM = rgb('#1b2448');
const OVERCAST_TOP = rgb('#7b8794');
const OVERCAST_BOTTOM = rgb('#b9c2c8');
const FOG = rgb('#c9ced0');
const SNOW_SKY = rgb('#c7cfd8');

export function overcastOf(condition: ConditionId): number {
  switch (condition) {
    case 'clear':
      return 0;
    case 'wet':
      return 0.35;
    case 'rain':
      return 0.85;
    case 'light-snow':
      return 0.75;
    case 'fog':
      return 0.6;
    case 'blizzard':
      return 1;
  }
}

export function veilOf(condition: ConditionId): number {
  return condition === 'fog'
    ? 0.85
    : condition === 'blizzard'
      ? 0.75
      : condition === 'light-snow'
        ? 0.3
        : condition === 'rain'
          ? 0.2
          : 0;
}

/** How the scenery should be lit, from the sun and the weather. */
export function lightingFor(sunAltitude: number, condition: ConditionId): Lighting {
  const day = daylight(sunAltitude);
  const golden =
    Math.max(0, 1 - Math.abs(sunAltitude - 2) / 12) * (1 - overcastOf(condition) * 0.8);
  const veil = veilOf(condition);
  const top = skyColours(sunAltitude, condition).bottom;
  return {
    day: day * (1 - overcastOf(condition) * 0.25),
    golden,
    haze: mix(top, condition === 'fog' || condition === 'blizzard' ? FOG : top, 0.6),
    veil,
    overcast: overcastOf(condition),
  };
}

export function skyColours(sunAltitude: number, condition: ConditionId): { top: Rgb; bottom: Rgb } {
  const day = daylight(sunAltitude);
  const dusk = Math.max(0, 1 - Math.abs(sunAltitude - 1) / 9);
  let top = mix(NIGHT_TOP, DAY_TOP, day);
  let bottom = mix(NIGHT_BOTTOM, DAY_BOTTOM, day);
  top = mix(top, DUSK_TOP, dusk * 0.55);
  bottom = mix(bottom, DUSK_BOTTOM, dusk * 0.85);
  const overcast = overcastOf(condition);
  const grey = condition === 'light-snow' || condition === 'blizzard' ? SNOW_SKY : OVERCAST_BOTTOM;
  top = mix(top, mix(NIGHT_TOP, OVERCAST_TOP, day), overcast * 0.85);
  bottom = mix(bottom, mix(NIGHT_BOTTOM, grey, day), overcast * 0.85);
  if (condition === 'fog') {
    top = mix(top, mix(NIGHT_BOTTOM, FOG, day), 0.6);
    bottom = mix(bottom, mix(NIGHT_BOTTOM, FOG, day), 0.85);
  }
  return { top, bottom };
}

const stars = (() => {
  const rng = createRng('long-haul-stars');
  return Array.from({ length: 140 }, () => ({
    x: rng.next(),
    y: rng.next() * rng.next(),
    size: rng.float(0.4, 1.4),
    twinkle: rng.float(0, Math.PI * 2),
  }));
})();

/** Paints the sky into a rectangle whose bottom is the horizon. */
export function paintSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizon: number,
  state: SkyState,
  reducedMotion: boolean,
) {
  const { top, bottom } = skyColours(state.sunAltitude, state.condition);
  const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
  gradient.addColorStop(0, css(top));
  gradient.addColorStop(1, css(bottom));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, horizon + 2);

  const overcast = overcastOf(state.condition);
  const night = 1 - daylight(state.sunAltitude);
  const starAlpha = Math.max(0, night - 0.35) * (1 - overcast);
  if (starAlpha > 0.02) {
    for (const star of stars) {
      const flicker = reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(state.time * 2 + star.twinkle);
      ctx.fillStyle = `rgba(255, 250, 235, ${starAlpha * flicker})`;
      ctx.fillRect(star.x * width, star.y * horizon * 0.9, star.size, star.size);
    }
  }

  // The sun climbs from the left of the frame to the right; the moon keeps the opposite watch.
  const arcX = width * (0.1 + state.sunArc * 0.8);
  const sunY = horizon - (Math.max(-12, state.sunAltitude) / 60) * horizon * 1.1;
  if (state.sunAltitude > -6 && overcast < 0.9) {
    const glow = ctx.createRadialGradient(arcX, sunY, 0, arcX, sunY, horizon * 0.5);
    const warm = state.sunAltitude < 10 ? '255, 170, 100' : '255, 240, 200';
    glow.addColorStop(0, `rgba(${warm}, ${0.55 * (1 - overcast)})`);
    glow.addColorStop(1, `rgba(${warm}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, horizon);
    ctx.fillStyle = state.sunAltitude < 6 ? '#ffd2a0' : '#fff6dc';
    ctx.globalAlpha = 1 - overcast * 0.9;
    ctx.beginPath();
    ctx.arc(arcX, sunY, Math.max(10, horizon * 0.045), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (night > 0.4 && overcast < 0.8) {
    const moonX = width * (0.9 - state.sunArc * 0.6);
    const moonY = horizon * 0.22;
    const radius = Math.max(8, horizon * 0.03);
    ctx.globalAlpha = (night - 0.4) * 1.6 * (1 - overcast);
    ctx.fillStyle = '#f1ead2';
    ctx.beginPath();
    ctx.arc(moonX, moonY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(top);
    ctx.beginPath();
    ctx.arc(moonX + radius * 0.45, moonY - radius * 0.15, radius * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  paintClouds(ctx, width, horizon, state, overcast, top, reducedMotion);
}

const clouds = (() => {
  const rng = createRng('long-haul-clouds');
  return Array.from({ length: 14 }, () => ({
    x: rng.next(),
    y: rng.float(0.08, 0.6),
    width: rng.float(0.12, 0.3),
    puffs: rng.int(3, 6),
    depth: rng.float(0.02, 0.08),
    seed: rng.next(),
  }));
})();

function paintClouds(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizon: number,
  state: SkyState,
  overcast: number,
  skyTop: Rgb,
  reducedMotion: boolean,
) {
  const day = daylight(state.sunAltitude);
  const base = mix(mix(rgb('#2a3352'), rgb('#ffffff'), day), rgb('#9aa3ad'), overcast * 0.7);
  const shadow = mix(base, skyTop, 0.35);
  const count = Math.round(4 + overcast * 10);
  for (let index = 0; index < count; index++) {
    const cloud = clouds[index % clouds.length];
    if (!cloud) continue;
    const drift = reducedMotion ? 0 : state.time * 4 + state.scroll * cloud.depth;
    const span = width * (1 + cloud.width);
    const x = ((((cloud.x * span - drift) % span) + span) % span) - width * cloud.width * 0.5;
    const y = cloud.y * horizon * (1 - overcast * 0.4);
    const w = cloud.width * width * (1 + overcast * 0.8);
    const h = w * 0.22;
    ctx.fillStyle = css(shadow, 0.55 + overcast * 0.35);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.35, w / 2, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(base, 0.75 + overcast * 0.2);
    for (let puff = 0; puff < cloud.puffs; puff++) {
      const t = puff / Math.max(1, cloud.puffs - 1);
      const radius = h * (0.55 + 0.45 * Math.sin(t * Math.PI));
      ctx.beginPath();
      ctx.arc(x + w * (0.1 + t * 0.8), y + h * 0.2 - radius * 0.35, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
