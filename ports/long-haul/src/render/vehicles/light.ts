import type { ConditionId } from '../../engine/conditions';
import { litRgb, mix, rgb, shade, type Lighting, type Rgb } from '../colour';
import { lightingFor, skyColours } from '../sky';
import { daylight } from '../sun';
import { dot, normalize, type Vec3 } from './geometry';

/**
 * The light a vehicle stands in, and how each material answers it. Diffuse
 * colour goes through the scenery's own grading (`litRgb`), so a red cab at
 * dusk warms and darkens exactly as a red barn beside it does; reflections
 * come straight from the sky and the road, which are already the colour of
 * the moment. Chrome is almost all reflection, paint a little, rubber hardly
 * any.
 */
export interface Environment {
  lighting: Lighting;
  /** The sky straight up and at the horizon, as painted behind the scene. */
  skyTop: Rgb;
  skyHorizon: Rgb;
  /** The road under the vehicle, as lit. */
  ground: Rgb;
  /** The distant land at the horizon, the dark band in every chrome reflection. */
  horizon: Rgb;
  /** Unit vector towards the sun. */
  sun: Vec3;
  /** 0 at night … 1 in full sun; less under cloud. */
  sunStrength: number;
  /** 0 noon white … 1 deep gold. */
  sunWarmth: number;
  night: number;
  /** A wet road and wet paint: more reflection, darker colours. */
  wet: number;
  /** Snow settled on everything that faces up. */
  snow: number;
}

export interface EnvironmentOptions {
  sunAltitude: number;
  condition: ConditionId;
  /** Where the sun is in the world the camera looks at. */
  sun: Vec3;
  ground: string;
  horizon: string;
}

export function environmentFor(options: EnvironmentOptions): Environment {
  const { sunAltitude, condition } = options;
  const lighting = lightingFor(sunAltitude, condition);
  const sky = skyColours(sunAltitude, condition);
  const night = 1 - daylight(sunAltitude);
  const cloud = lighting.overcast;
  return {
    lighting,
    skyTop: sky.top,
    skyHorizon: sky.bottom,
    ground: litRgb(options.ground, lighting),
    horizon: litRgb(options.horizon, lighting, 0.6),
    sun: normalize(options.sun),
    sunStrength: Math.max(0, Math.min(1, (sunAltitude + 2) / 10)) * (1 - cloud * 0.85),
    sunWarmth: Math.max(0, Math.min(1, 1 - (sunAltitude - 3) / 22)),
    night,
    wet: condition === 'rain' ? 1 : condition === 'wet' ? 0.6 : 0,
    snow: condition === 'blizzard' ? 1 : condition === 'light-snow' ? 0.55 : 0,
  };
}

/**
 * The sun's direction for a view that looks across the road, as the side
 * diorama and the cab both do: across the frame by `arc` (0 left … 1 right),
 * up by its altitude, and leaning a little along `lean`.
 */
export function sunAcross(arc: number, altitude: number, lean: Vec3): Vec3 {
  const radians = (Math.max(-4, altitude) * Math.PI) / 180;
  const across = (arc - 0.5) * 2 * Math.cos(radians);
  return normalize([
    across + lean[0] * 0.45,
    Math.max(0.05, Math.sin(radians)) + lean[1] * 0.45,
    lean[2] * 0.45,
  ]);
}

export type MaterialKind =
  'paint' | 'chrome' | 'glass' | 'rubber' | 'metal' | 'aluminium' | 'plastic' | 'lens';

export interface Material {
  kind: MaterialKind;
  /** The colour in plain daylight. */
  colour: string;
  /** 0 matte … 1 mirror; each kind has its own default. */
  gloss?: number;
}

const GLOSS: Readonly<Record<MaterialKind, number>> = {
  paint: 0.55,
  chrome: 1,
  glass: 0.9,
  rubber: 0.08,
  metal: 0.15,
  aluminium: 0.35,
  plastic: 0.2,
  lens: 0.7,
};

const SUN_WHITE = rgb('#fff6e4');
const SUN_GOLD = rgb('#ffb466');
const SNOW = rgb('#f4f7fb');

/** What a mirror-like surface sees in direction `d`: sky above, a dark line of land, the road. */
export function reflected(d: Vec3, env: Environment, sharp: boolean): Rgb {
  const y = d[1];
  if (y >= 0) {
    let colour = mix(env.skyHorizon, env.skyTop, Math.min(1, Math.pow(y, 0.65) * 1.25));
    const toSun = dot(d, env.sun);
    if (toSun > 0.9 && env.sunStrength > 0) {
      const glare = Math.pow((toSun - 0.9) / 0.1, 3) * env.sunStrength;
      colour = mix(colour, mix(SUN_WHITE, SUN_GOLD, env.sunWarmth), glare);
    }
    // Chrome shows the horizon as a hard edge just above the dark band.
    if (sharp && y < 0.08) colour = mix(colour, shade(env.skyHorizon, 0.25), 1 - y / 0.08);
    return colour;
  }
  const band = sharp ? 0.14 : 0.3;
  if (-y < band) return mix(env.horizon, env.ground, sharp ? Math.pow(-y / band, 2) : -y / band);
  return mix(env.ground, shade(env.ground, -0.35), Math.min(1, (-y - band) * 1.2));
}

function reflect(eye: Vec3, normal: Vec3): Vec3 {
  // The eye ray arriving at the surface is −eye; bounce it about the normal.
  const k = 2 * dot(eye, normal);
  return [normal[0] * k - eye[0], normal[1] * k - eye[1], normal[2] * k - eye[2]];
}

/** The colour of a surface with normal `n`, seen from direction `eye` (both unit vectors). */
export function surfaceColour(material: Material, n: Vec3, eye: Vec3, env: Environment): Rgb {
  const albedo = rgb(material.colour);
  const gloss = (material.gloss ?? GLOSS[material.kind]) * (1 + env.wet * 0.35);
  const facing = Math.max(0, dot(n, eye));
  const fresnel = 0.04 + 0.96 * Math.pow(1 - facing, 5);
  const view = reflect(eye, n);

  if (material.kind === 'chrome') {
    // Polished metal is never a perfect mirror: a little of its own pale grey shows through.
    const seen = reflected(view, env, true);
    return withSnow(
      moonlit(mix(seen, litRgb(albedo, env.lighting), 0.28), view, 1, env),
      n,
      env,
      0.4,
    );
  }
  if (material.kind === 'glass') {
    const seen = reflected(view, env, false);
    // Glass is mostly the dark inside, turning to a mirror at a glancing angle.
    const inside = litRgb(albedo, env.lighting);
    return mix(inside, seen, Math.min(1, 0.3 + fresnel * 0.7) * gloss);
  }

  // Light from the sky above, a little bounced off the road, and the sun.
  const sky = 0.8 + 0.2 * n[1];
  const bounce = Math.max(0, -n[1]) * 0.12;
  const sunlit = Math.max(0, dot(n, env.sun)) * env.sunStrength;
  // A low sun is weak, but it is all there is to light the side of things: it counts for more.
  const brightness =
    (sky + bounce) * (0.97 - env.wet * 0.12) + sunlit * (0.3 + env.sunWarmth * 0.45);
  let colour = litRgb(
    [
      Math.min(255, albedo[0] * brightness),
      Math.min(255, albedo[1] * brightness),
      Math.min(255, albedo[2] * brightness),
    ],
    env.lighting,
  );
  if (sunlit > 0) {
    colour = mix(colour, mix(colour, SUN_GOLD, 0.5), Math.min(1, sunlit * env.sunWarmth * 0.9));
    // Edges turned towards a low sun, and away from the eye, flare: the rim light of late afternoon.
    const rim = sunlit * Math.pow(1 - facing, 2) * env.sunWarmth;
    colour = mix(colour, mix(SUN_GOLD, SUN_WHITE, 0.35), Math.min(0.85, rim * 1.4));
  }
  if (material.kind !== 'rubber' && material.kind !== 'metal') {
    const seen = reflected(view, env, material.kind === 'paint');
    colour = mix(colour, seen, gloss * (0.15 + fresnel * 0.6));
    const hot = dot(view, env.sun);
    if (hot > 0.985 && env.sunStrength > 0)
      colour = mix(colour, SUN_WHITE, ((hot - 0.985) / 0.015) * gloss * env.sunStrength * 0.8);
  }
  return withSnow(moonlit(colour, view, gloss, env), n, env, 1);
}

const MOON: Vec3 = normalize([0.25, 0.85, 0.45]);
const MOONLIGHT: Rgb = [128, 146, 186];

/**
 * By night the moon and the sky's last glow pick out every upper edge in a
 * cool line, so a dark rig still reads against a dark sky.
 */
function moonlit(colour: Rgb, view: Vec3, gloss: number, env: Environment): Rgb {
  if (env.night <= 0.3) return colour;
  const catch_ = Math.max(0, dot(view, MOON));
  return mix(colour, MOONLIGHT, (env.night - 0.3) * Math.pow(catch_, 3) * (0.25 + gloss * 0.45));
}

function withSnow(colour: Rgb, n: Vec3, env: Environment, amount: number): Rgb {
  if (env.snow <= 0 || n[1] < 0.55) return colour;
  return mix(
    colour,
    litRgb(SNOW, env.lighting),
    env.snow * amount * Math.min(1, (n[1] - 0.55) * 3),
  );
}

/** The light, rounded, as a cache key: two keys match when a repaint would look the same. */
export function environmentKey(env: Environment): string {
  const round = (value: number, steps = 40) => Math.round(value * steps);
  const colour = (value: Rgb) => value.map((channel) => Math.round(channel / 6)).join('.');
  const { lighting } = env;
  return [
    round(lighting.day),
    round(lighting.golden),
    round(lighting.overcast, 10),
    round(lighting.veil, 10),
    colour(lighting.haze),
    colour(env.skyTop),
    colour(env.skyHorizon),
    colour(env.ground),
    colour(env.horizon),
    env.sun.map((value) => round(value, 20)).join('.'),
    round(env.sunStrength, 20),
    round(env.sunWarmth, 20),
    round(env.night, 20),
    env.wet,
    env.snow,
  ].join('|');
}
