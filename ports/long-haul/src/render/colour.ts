/**
 * Small colour arithmetic for lighting the scenery: every landscape is
 * painted in daylight colours, then mixed towards night, dusk or fog.
 */
export type Rgb = readonly [number, number, number];

const cache = new Map<string, Rgb>();

export function rgb(hex: string): Rgb {
  const known = cache.get(hex);
  if (known) return known;
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((digit) => digit + digit).join('') : value;
  const parsed: Rgb = [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
  cache.set(hex, parsed);
  return parsed;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function css(colour: Rgb, alpha = 1): string {
  const [r, g, b] = colour.map((channel) => Math.round(channel));
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function shade(colour: Rgb, amount: number): Rgb {
  return amount < 0 ? mix(colour, [0, 0, 0], -amount) : mix(colour, [255, 255, 255], amount);
}

/**
 * The light on the scenery right now: how much day there is, a warm tint at
 * the ends of the day, and a veil of fog or snow.
 */
export interface Lighting {
  /** 0 night … 1 full day. */
  day: number;
  /** 0 … 1, strongest when the sun is near the horizon. */
  golden: number;
  /** The colour distant things fade into. */
  haze: Rgb;
  /** 0 clear … 1 thick fog or a whiteout. */
  veil: number;
  /** Rain or snow greys and darkens everything a little. */
  overcast: number;
}

const NIGHT: Rgb = [16, 22, 44];
const GOLD: Rgb = [255, 160, 90];

/** A day colour as it looks under the current light, at a distance from 0 (near) to 1 (horizon). */
export function lit(colour: string | Rgb, light: Lighting, distance = 0): string {
  return css(litRgb(colour, light, distance));
}

export function litRgb(colour: string | Rgb, light: Lighting, distance = 0): Rgb {
  let value = typeof colour === 'string' ? rgb(colour) : colour;
  value = mix(value, GOLD, light.golden * 0.28);
  value = mix(value, shade(value, -0.25), light.overcast);
  value = mix(NIGHT, value, 0.12 + light.day * 0.88);
  const fade = Math.min(1, distance * (0.25 + light.veil * 0.9) + light.veil * 0.35);
  return mix(value, light.haze, fade);
}
