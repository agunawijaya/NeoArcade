import type { Camera } from './camera';
import { add, dot, scale, type Vec3 } from './geometry';

/**
 * Lamps are drawn after the body, live, so they can blink and glow without
 * redrawing the panels around them: a bright lens, a halo the post-effects
 * bloom picks up, and for a few of them a pool of light on the road.
 */
export type LampColour = 'white' | 'amber' | 'red';

export type LampRole = 'head' | 'marker' | 'tail' | 'brake' | 'left' | 'right' | 'spot';

export interface Lamp {
  at: Vec3;
  /** Which way the lamp faces; it fades out as it turns away from the eye. */
  normal: Vec3;
  radius: number;
  colour: LampColour;
  roles: readonly LampRole[];
}

const GLOW: Readonly<Record<LampColour, string>> = {
  white: '255, 244, 214',
  amber: '255, 168, 46',
  red: '255, 42, 30',
};

const LENS: Readonly<Record<LampColour, string>> = {
  white: '#fffaf0',
  amber: '#ffd27a',
  red: '#ff6a54',
};

/**
 * Draws every lamp whose strength is above zero. `strength` says how bright
 * each one is now (a marker at dusk, a brake light, a blinking signal);
 * `halo` scales the glow, larger at night.
 */
export function drawLamps(
  ctx: CanvasRenderingContext2D,
  lamps: readonly Lamp[],
  camera: Camera,
  strength: (lamp: Lamp) => number,
  halo: number,
) {
  for (const lamp of lamps) {
    const power = strength(lamp);
    if (power <= 0.01) continue;
    const facing = dot(lamp.normal, camera.toEye(lamp.at));
    if (facing < -0.15) continue;
    const seen = Math.min(1, 0.25 + Math.max(0, facing) * 1.1);
    const centre = camera.project(lamp.at);
    const size = Math.max(0.8, lamp.radius * camera.pixelsAt(lamp.at));
    const glow = GLOW[lamp.colour];
    const reach = size * (2.2 + halo * 5.5) * (lamp.colour === 'white' ? 1.6 : 1);
    const gradient = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach);
    gradient.addColorStop(0, `rgba(${glow}, ${0.55 * power * seen})`);
    gradient.addColorStop(0.3, `rgba(${glow}, ${0.2 * power * seen})`);
    gradient.addColorStop(1, `rgba(${glow}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(centre.x - reach, centre.y - reach, reach * 2, reach * 2);
    ctx.globalAlpha = Math.min(1, power * (0.4 + seen * 0.6));
    ctx.fillStyle = LENS[lamp.colour];
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, size * (0.55 + 0.45 * Math.max(0, facing)), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** A lamp on a face: `at` the face, pushed a hair outwards so it sorts in front of it. */
export function lampOn(
  at: Vec3,
  normal: Vec3,
  radius: number,
  colour: LampColour,
  roles: readonly LampRole[],
): Lamp {
  return { at: add(at, scale(normal, 0.02)), normal, radius, colour, roles };
}
