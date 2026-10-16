/** Small colour helpers for the code-drawn art. Colours are #rrggbb strings. */

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([red, green, blue]: [number, number, number]): string {
  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)));
  return `#${((1 << 24) | (clamp(red) << 16) | (clamp(green) << 8) | clamp(blue)).toString(16).slice(1)}`;
}

/** Lightens towards white (amount > 0) or darkens towards black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const share = Math.min(1, Math.abs(amount));
  return toHex(
    channels(hex).map((channel) => channel + (target - channel) * share) as [
      number,
      number,
      number,
    ],
  );
}

export function mix(from: string, to: string, share: number): string {
  const a = channels(from);
  const b = channels(to);
  return toHex(
    [0, 1, 2].map(
      (index) => (a[index] as number) + ((b[index] as number) - (a[index] as number)) * share,
    ) as [number, number, number],
  );
}

export function withAlpha(hex: string, alpha: number): string {
  const [red, green, blue] = channels(hex);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
