import type { Lighting } from '../palette';

/**
 * The glass deck's drawing kit: the colours of its displays — sky and
 * ground, white, the magenta of anything the crew or the computer selected,
 * green for engaged modes, cyan for prompts and navaids, amber and red for
 * the cautions and warnings — the lettering, and a screen to draw into.
 * Displays draw in their own square of pixels, `size` across, from (x, y).
 */
export type Context = CanvasRenderingContext2D;

export interface DisplayColours {
  background: string;
  sky: string;
  ground: string;
  horizon: string;
  white: string;
  grey: string;
  tape: string;
  magenta: string;
  green: string;
  cyan: string;
  amber: string;
  red: string;
  black: string;
  /** Display brightness, 0–1: the crew turn them down at night. */
  brightness: number;
}

const DISPLAY: Omit<DisplayColours, 'brightness'> = {
  background: '#030507',
  sky: '#2c86cf',
  ground: '#8c5a2a',
  horizon: '#f2f4f0',
  white: '#f2f4f0',
  grey: '#9aa3ad',
  tape: 'rgba(110, 118, 128, 0.55)',
  magenta: '#ff52da',
  green: '#3be36d',
  cyan: '#38dcff',
  amber: '#ffb21f',
  red: '#ff3b2f',
  black: '#000000',
};

/** The same colours by day and night; the night turns the screens down a little. */
export function displayColours(lighting: Lighting): DisplayColours {
  return { ...DISPLAY, brightness: lighting === 'night' ? 0.82 : lighting === 'dusk' ? 0.92 : 1 };
}

/** The displays' lettering: plain, upright and even, like the stroke characters of the era's tubes. */
export const DISPLAY_FONT =
  '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", "Liberation Sans Narrow", Arial, sans-serif';
/** The CDU's fixed-pitch lettering. */
export const CDU_FONT = 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace';

export function label(
  context: Context,
  value: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  align: CanvasTextAlign = 'center',
  font = DISPLAY_FONT,
) {
  context.fillStyle = colour;
  // Half-pixel sizes: a handful of fonts the canvas keeps parsed, not a new one for every label.
  context.font = `${Math.max(1, Math.round(size * 2) / 2)}px ${font}`;
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillText(value, x, y);
}

/** A screen: black glass, clipped, and turned down by the brightness for whatever is drawn in it. */
export function screen(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  colours: DisplayColours,
  draw: () => void,
) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = colours.background;
  context.fillRect(x, y, width, height);
  draw();
  if (colours.brightness < 1) {
    context.fillStyle = `rgba(0, 0, 0, ${1 - colours.brightness})`;
    context.fillRect(x, y, width, height);
  }
  context.restore();
}

/**
 * A display drawn once into a canvas of its own, at the panel's pixel
 * scale, so the panel can show it twice — each pilot has a PFD and an ND
 * reading the same aircraft — for the price of one.
 */
export class DisplayStamp {
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d');

  /** Draws the display, `size` across at the target's scale; false if there is no canvas to draw in. */
  paint(target: Context, size: number, draw: (context: Context, size: number) => void): boolean {
    if (!this.context) return false;
    const scale = scaleOf(target);
    const pixels = Math.ceil(size * scale);
    if (this.canvas.width !== pixels) this.canvas.width = this.canvas.height = pixels;
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    this.context.clearRect(0, 0, size, size);
    draw(this.context, size);
    return true;
  }

  /** Puts the picture at (x, y), on whole pixels so its lettering stays sharp. */
  stamp(target: Context, x: number, y: number) {
    const { e, f } = target.getTransform();
    const scale = scaleOf(target);
    const left = (Math.round(x * scale + e) - e) / scale;
    const top = (Math.round(y * scale + f) - f) / scale;
    const size = this.canvas.width / scale;
    target.drawImage(this.canvas, left, top, size, size);
  }
}

function scaleOf(context: Context): number {
  const { a, b } = context.getTransform();
  return Math.hypot(a, b);
}

/** A line from one point to another. */
export function line(
  context: Context,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: string,
  width: number,
) {
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

/** Text in a box, as the displays frame a number they want read. */
export function boxed(
  context: Context,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: string,
  border: string,
  background = '#000000',
) {
  context.fillStyle = background;
  context.fillRect(x - width / 2, y - height / 2, width, height);
  context.strokeStyle = border;
  context.lineWidth = Math.max(1, height * 0.06);
  context.strokeRect(x - width / 2, y - height / 2, width, height);
  label(context, value, x, y + height * 0.03, height * 0.72, colour);
}

export const pad3 = (value: number) => String(Math.round(value) % 360 || 360).padStart(3, '0');
