/**
 * The cockpit's drawing kit: bezels, dials, ticks, numerals, needles and
 * the condensed lettering of the era's instruments, all on a Canvas 2D
 * context in panel units. Angles are degrees clockwise from twelve o'clock,
 * as instrument makers draw them.
 */
export type Context = CanvasRenderingContext2D;

export const FONT =
  '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", "Liberation Sans Narrow", Arial, sans-serif';

const RADIANS = Math.PI / 180;

export function polar(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const angle = (degrees - 90) * RADIANS;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

export function roundRect(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function text(
  context: Context,
  value: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  align: CanvasTextAlign = 'center',
  weight = 'bold',
) {
  context.fillStyle = colour;
  context.font = `${weight} ${size}px ${FONT}`;
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillText(value, x, y);
}

/**
 * A dial's face — the case, ticks, numerals and printed words — changes
 * only with its size and the cockpit lighting, so it is drawn once into a
 * canvas of its own and stamped each frame, while needles, bugs, counters
 * and flags are drawn live. The face is drawn about (0, 0) and reaches
 * `extent` each way; `turnDegrees` turns the stamp, for compass cards.
 */
const faces = new Map<string, HTMLCanvasElement>();
/** Enough for every dial at two sizes; a resize past that starts afresh. */
const FACE_LIMIT = 160;

export function face(
  context: Context,
  key: string,
  cx: number,
  cy: number,
  extent: number,
  draw: (face: Context) => void,
  turnDegrees = 0,
) {
  const transform = context.getTransform();
  const pixels = Math.max(1, Math.ceil(extent * 2 * Math.hypot(transform.a, transform.b)));
  const id = `${key} ${pixels}`;
  let canvas = faces.get(id);
  if (!canvas) {
    if (faces.size >= FACE_LIMIT) faces.clear();
    canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = pixels;
    const faceContext = canvas.getContext('2d');
    if (!faceContext) return;
    faceContext.scale(pixels / (extent * 2), pixels / (extent * 2));
    faceContext.translate(extent, extent);
    draw(faceContext);
    faces.set(id, canvas);
  }
  context.save();
  context.translate(cx, cy);
  if (turnDegrees !== 0) context.rotate(turnDegrees * RADIANS);
  context.drawImage(canvas, -extent, -extent, extent * 2, extent * 2);
  context.restore();
}

/** How far a bezel reaches from the dial's centre, as a fraction of its radius. */
export const BEZEL_EXTENT = 1.15;

/** A round instrument's case: a black bezel with a lit rim and four screws. */
export function bezel(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  face: string,
  rim: string,
) {
  const outer = radius * 1.12;
  context.fillStyle = '#111214';
  roundRect(context, cx - outer, cy - outer, outer * 2, outer * 2, radius * 0.16);
  context.fill();
  context.strokeStyle = rim;
  context.lineWidth = radius * 0.025;
  context.stroke();
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    context.beginPath();
    context.arc(cx + dx * outer * 0.84, cy + dy * outer * 0.84, radius * 0.045, 0, Math.PI * 2);
    context.fillStyle = '#2a2c2f';
    context.fill();
  }
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = face;
  context.fill();
}

/** Ticks round a dial from one value to another, with a mark every `step` and longer ones every `major`. */
export function ticks(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
  step: number,
  major: number,
  angleOf: (value: number) => number,
  colour: string,
) {
  context.strokeStyle = colour;
  for (let value = from; value <= to + 1e-9; value += step) {
    const isMajor = Math.abs(value / major - Math.round(value / major)) < 1e-6;
    const length = radius * (isMajor ? 0.14 : 0.07);
    context.lineWidth = radius * (isMajor ? 0.03 : 0.018);
    const angle = angleOf(value);
    const [x1, y1] = polar(cx, cy, radius * 0.97, angle);
    const [x2, y2] = polar(cx, cy, radius * 0.97 - length, angle);
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }
}

/** A tapered white needle from the hub. */
export function needle(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  degrees: number,
  colour: string,
  tail = 0.18,
) {
  const [tx, ty] = polar(cx, cy, radius, degrees);
  const [bx, by] = polar(cx, cy, radius * tail, degrees + 180);
  const [lx, ly] = polar(cx, cy, radius * 0.035, degrees - 90);
  const [rx, ry] = polar(cx, cy, radius * 0.035, degrees + 90);
  context.fillStyle = colour;
  context.beginPath();
  context.moveTo(tx, ty);
  context.lineTo(lx, ly);
  context.lineTo(bx, by);
  context.lineTo(rx, ry);
  context.closePath();
  context.fill();
  context.beginPath();
  context.arc(cx, cy, radius * 0.07, 0, Math.PI * 2);
  context.fillStyle = '#1b1c1e';
  context.fill();
}

/** A digital counter window: black slot, white figures, a little shadow at top and bottom like a drum. */
export function counter(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  value: string,
  colour = '#f2f2ee',
) {
  context.fillStyle = '#060607';
  context.fillRect(x, y, width, height);
  const shade = context.createLinearGradient(0, y, 0, y + height);
  shade.addColorStop(0, 'rgba(0,0,0,0.6)');
  shade.addColorStop(0.3, 'rgba(0,0,0,0)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  text(context, value, x + width / 2, y + height / 2 + height * 0.04, height * 0.72, colour);
  context.fillStyle = shade;
  context.fillRect(x, y, width, height);
}

/** A press-button with an annunciator: label on top, lit or dark. */
export function annunciator(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  lit: boolean,
  litColour: string,
  darkColour = '#3a3b3d',
) {
  context.fillStyle = '#121315';
  roundRect(context, x, y, width, height, height * 0.12);
  context.fill();
  context.fillStyle = lit ? litColour : '#1f2022';
  roundRect(context, x + width * 0.06, y + height * 0.1, width * 0.88, height * 0.8, height * 0.08);
  context.fill();
  if (lit) {
    context.shadowColor = litColour;
    context.shadowBlur = height * 0.4;
  }
  text(context, label, x + width / 2, y + height / 2, height * 0.34, lit ? '#101010' : darkColour);
  context.shadowBlur = 0;
}

/** A knob seen from the front: knurled edge and a pointer line. */
export function knob(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  degrees: number,
  body = '#26282b',
) {
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = body;
  context.fill();
  context.strokeStyle = '#4a4d51';
  context.lineWidth = radius * 0.12;
  context.setLineDash([radius * 0.12, radius * 0.12]);
  context.stroke();
  context.setLineDash([]);
  const [x, y] = polar(cx, cy, radius * 0.75, degrees);
  context.strokeStyle = '#e9e9e4';
  context.lineWidth = radius * 0.14;
  context.beginPath();
  context.moveTo(cx, cy);
  context.lineTo(x, y);
  context.stroke();
}

export const clampValue = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
