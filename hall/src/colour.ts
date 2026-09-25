/** "#ff8a3d" → "rgba(255, 138, 61, 0.5)". */
export function withAlpha(hex: string, alpha: number): string {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(value)) return [255, 255, 255];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Dark ink on bright accents, white on deep ones, so button labels stay readable. */
export function inkOn(hex: string): string {
  const [red, green, blue] = hexToRgb(hex).map((channel) => {
    const linear = channel / 255;
    return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.2 ? '#140a1c' : '#ffffff';
}

/** Mixes a colour towards black (amount < 0) or white (amount > 0). */
export function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const weight = Math.min(1, Math.abs(amount));
  const [red, green, blue] = hexToRgb(hex).map((channel) =>
    Math.round(channel + (target - channel) * weight),
  ) as [number, number, number];
  return `rgb(${red}, ${green}, ${blue})`;
}
