import { label, line, pad3, type Context, type DisplayColours } from './glass-kit';

/**
 * The navigation display's symbols: the compass card and its marks, the
 * heading box, the waypoint star, the navaid, and the aircraft as MAP and
 * the rose draw it.
 */
export interface Frame {
  x: number;
  y: number;
  s: number;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The compass ticks and numbers round a centre, the card turned so `up` is at the top. */
export function compass(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  up: number,
  s: number,
  colours: DisplayColours,
  span: number,
) {
  const thin = Math.max(1, s * 0.0035);
  const first = Math.ceil((up - span) / 5) * 5;
  for (let bearing = first; bearing <= up + span; bearing += 5) {
    const angle = radians(bearing - up);
    const ten = ((bearing % 10) + 10) % 10 === 0;
    const inner = radius - s * (ten ? 0.025 : 0.014);
    line(
      context,
      cx + Math.sin(angle) * radius,
      cy - Math.cos(angle) * radius,
      cx + Math.sin(angle) * inner,
      cy - Math.cos(angle) * inner,
      colours.white,
      thin,
    );
    if (((bearing % 30) + 30) % 30 === 0) {
      const text = radius - s * 0.05;
      context.save();
      context.translate(cx + Math.sin(angle) * text, cy - Math.cos(angle) * text);
      context.rotate(angle);
      label(
        context,
        String(((((bearing % 360) + 360) % 360) / 10).toFixed(0)),
        0,
        0,
        s * 0.04,
        colours.white,
      );
      context.restore();
    }
  }
}

/** A magenta bug sitting on the outside of the compass at a bearing. */
export function headingBug(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  relative: number,
  s: number,
  colours: DisplayColours,
) {
  context.save();
  context.translate(cx, cy);
  context.rotate(radians(relative));
  context.strokeStyle = colours.magenta;
  context.lineWidth = Math.max(1, s * 0.005);
  context.beginPath();
  context.moveTo(-s * 0.02, -radius);
  context.lineTo(-s * 0.02, -radius - s * 0.018);
  context.lineTo(-s * 0.008, -radius - s * 0.018);
  context.lineTo(0, -radius - s * 0.007);
  context.lineTo(s * 0.008, -radius - s * 0.018);
  context.lineTo(s * 0.02, -radius - s * 0.018);
  context.lineTo(s * 0.02, -radius);
  context.stroke();
  context.restore();
}

/** The box at the top of the card: TRK or HDG, the bearing, MAG. */
export function headingBox(
  context: Context,
  frame: Frame,
  kind: 'TRK' | 'HDG',
  value: number,
  colours: DisplayColours,
) {
  const { s } = frame;
  const cx = frame.x + 0.5 * s;
  const cy = frame.y + 0.075 * s;
  context.fillStyle = colours.black;
  context.fillRect(cx - s * 0.045, cy - s * 0.024, s * 0.09, s * 0.048);
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, s * 0.0035);
  context.strokeRect(cx - s * 0.045, cy - s * 0.024, s * 0.09, s * 0.048);
  label(context, pad3(value), cx, cy, s * 0.042, colours.white);
  label(context, kind, cx - s * 0.055, cy, s * 0.03, colours.green, 'right');
  label(context, 'MAG', cx + s * 0.055, cy, s * 0.03, colours.green, 'left');
}

/** The lubber mark at the top of the card. */
export function lubber(
  context: Context,
  cx: number,
  top: number,
  s: number,
  colours: DisplayColours,
) {
  context.fillStyle = colours.white;
  context.beginPath();
  context.moveTo(cx, top + s * 0.004);
  context.lineTo(cx - s * 0.013, top - s * 0.02);
  context.lineTo(cx + s * 0.013, top - s * 0.02);
  context.closePath();
  context.fill();
}

/** A four-pointed star: the -400's waypoint. */
export function waypointStar(
  context: Context,
  x: number,
  y: number,
  size: number,
  colour: string,
  width: number,
) {
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x, y - size);
  context.quadraticCurveTo(x, y, x + size, y);
  context.quadraticCurveTo(x, y, x, y + size);
  context.quadraticCurveTo(x, y, x - size, y);
  context.quadraticCurveTo(x, y, x, y - size);
  context.stroke();
}

/** The VOR/DME symbol: a small hexagon round a dot. */
export function navaid(
  context: Context,
  x: number,
  y: number,
  size: number,
  colours: DisplayColours,
  width: number,
) {
  context.strokeStyle = colours.cyan;
  context.lineWidth = width;
  context.beginPath();
  for (let corner = 0; corner <= 6; corner++) {
    const angle = radians(corner * 60);
    const px = x + Math.cos(angle) * size;
    const py = y + Math.sin(angle) * size;
    if (corner === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.stroke();
  context.fillStyle = colours.cyan;
  context.fillRect(x - width / 2, y - width / 2, width, width);
}

/** The aircraft: an open white triangle, nose up the screen. */
export function aircraftTriangle(
  context: Context,
  cx: number,
  cy: number,
  s: number,
  colours: DisplayColours,
) {
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1.5, s * 0.005);
  context.beginPath();
  context.moveTo(cx, cy - s * 0.04);
  context.lineTo(cx - s * 0.022, cy + s * 0.012);
  context.lineTo(cx + s * 0.022, cy + s * 0.012);
  context.closePath();
  context.stroke();
}

/** A small aircraft at the centre of the rose. */
export function smallAircraft(
  context: Context,
  cx: number,
  cy: number,
  s: number,
  colours: DisplayColours,
) {
  const width = Math.max(1.5, s * 0.006);
  line(context, cx, cy - s * 0.035, cx, cy + s * 0.04, colours.white, width);
  line(context, cx - s * 0.04, cy - s * 0.005, cx + s * 0.04, cy - s * 0.005, colours.white, width);
  line(
    context,
    cx - s * 0.016,
    cy + s * 0.035,
    cx + s * 0.016,
    cy + s * 0.035,
    colours.white,
    width,
  );
}
