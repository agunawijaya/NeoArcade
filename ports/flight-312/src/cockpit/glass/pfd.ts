import { label, line, pad3, screen, type Context, type DisplayColours } from './glass-kit';
import type { PfdData } from './glass-model';
import {
  drawAltitudeTape,
  drawSpeedTape,
  drawVerticalSpeed,
  TAPE,
  type DisplayBox,
} from './pfd-tapes';

/**
 * The glass deck's primary flight display, laid out as the -400's: the
 * attitude in the middle with the flight director, the speed tape to its
 * left and the altitude and vertical speed to its right, the heading arc
 * underneath, the ILS deviation scales beside the attitude, and the flight
 * mode annunciations across the top. Everything is placed in fractions of
 * the display's side, so it reads the same from a phone to a wide screen.
 */
const ATTITUDE = { cx: 0.45, cy: TAPE.centre, halfWidth: 0.2, halfHeight: 0.24 } as const;
/** Degrees of pitch from the horizon to the window's edge. */
const PITCH_SPAN_DEG = 21;
/** The bank scale's radius, and the ladder's widths, as fractions of the side. */
const BANK_RADIUS = 0.205;
const DOT = 0.05;
const HEADING = { cy: 1.1, radius: 0.29, spanDeg: 42 } as const;
/** Banked further than this, the sky pointer turns amber. */
const STEEP_BANK_DEG = 35;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function drawPfd(
  context: Context,
  x: number,
  y: number,
  size: number,
  pfd: PfdData,
  colours: DisplayColours,
  blink: boolean,
) {
  const box: DisplayBox = { x, y, s: size };
  const belowMinimums =
    !pfd.onGround && pfd.radioAltitude !== null && pfd.radioAltitude < pfd.minimums;
  screen(context, x, y, size, size, colours, () => {
    drawAttitude(context, box, pfd, colours);
    drawBankScale(context, box, pfd, colours);
    drawDirectorAndSymbol(context, box, pfd, colours);
    drawIls(context, box, pfd, colours);
    drawRadioAltitude(context, box, pfd, colours, belowMinimums, blink);
    drawSpeedTape(context, box, pfd, colours);
    drawAltitudeTape(context, box, pfd, colours, belowMinimums, blink);
    drawVerticalSpeed(context, box, pfd.verticalSpeed, colours);
    drawHeading(context, box, pfd, colours);
    drawModes(context, box, pfd, colours);
  });
}

function attitudeFrame(box: DisplayBox) {
  const { s } = box;
  return {
    cx: box.x + ATTITUDE.cx * s,
    cy: box.y + ATTITUDE.cy * s,
    halfWidth: ATTITUDE.halfWidth * s,
    halfHeight: ATTITUDE.halfHeight * s,
    perDegree: (ATTITUDE.halfHeight * s) / PITCH_SPAN_DEG,
  };
}

/** Sky, ground, horizon and the pitch ladder, all turning with the bank inside a rounded window. */
function drawAttitude(context: Context, box: DisplayBox, pfd: PfdData, colours: DisplayColours) {
  const { s } = box;
  const { cx, cy, halfWidth, halfHeight, perDegree } = attitudeFrame(box);
  context.save();
  context.beginPath();
  context.roundRect(cx - halfWidth, cy - halfHeight, halfWidth * 2, halfHeight * 2, s * 0.035);
  context.clip();
  context.translate(cx, cy);
  context.rotate(radians(-pfd.bank));
  const horizon = pfd.pitch * perDegree;
  const reach = s;
  context.fillStyle = colours.sky;
  context.fillRect(-reach, horizon - reach * 2, reach * 2, reach * 2);
  context.fillStyle = colours.ground;
  context.fillRect(-reach, horizon, reach * 2, reach * 2);
  line(context, -reach, horizon, reach, horizon, colours.horizon, Math.max(1, s * 0.004));

  // The ladder is kept to the middle of the window, where the -400 shows it.
  context.beginPath();
  context.rect(-halfWidth * 0.62, -halfHeight * 0.78, halfWidth * 1.24, halfHeight * 1.56);
  context.clip();
  const thin = Math.max(1, s * 0.0035);
  const lowest = Math.ceil((pfd.pitch - PITCH_SPAN_DEG) / 2.5) * 2.5;
  for (let degrees = lowest; degrees <= pfd.pitch + PITCH_SPAN_DEG; degrees += 2.5) {
    if (Math.abs(degrees) < 0.01 || Math.abs(degrees) > 90) continue;
    const rungY = horizon - degrees * perDegree;
    const ten = Math.abs(degrees % 10) < 0.01;
    const five = Math.abs(degrees % 5) < 0.01;
    const half = s * (ten ? 0.075 : five ? 0.042 : 0.02);
    line(context, -half, rungY, half, rungY, colours.white, thin);
    if (ten) {
      const value = String(Math.abs(degrees));
      label(context, value, -half - s * 0.028, rungY, s * 0.032, colours.white);
      label(context, value, half + s * 0.028, rungY, s * 0.032, colours.white);
    }
  }
  context.restore();
}

/** The fixed bank scale, and the sky pointer with its slip-skid trapezoid that turn with the horizon. */
function drawBankScale(context: Context, box: DisplayBox, pfd: PfdData, colours: DisplayColours) {
  const { s } = box;
  const { cx, cy } = attitudeFrame(box);
  const radius = BANK_RADIUS * s;
  const thin = Math.max(1, s * 0.004);
  context.strokeStyle = colours.white;
  context.lineWidth = thin;
  context.beginPath();
  context.arc(cx, cy, radius, radians(-90 - 60), radians(-90 + 60));
  context.stroke();
  for (const bank of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const long = Math.abs(bank) === 30 || Math.abs(bank) === 60;
    const angle = radians(bank - 90);
    const outer = radius + s * (long ? 0.03 : 0.018);
    line(
      context,
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      cx + Math.cos(angle) * outer,
      cy + Math.sin(angle) * outer,
      colours.white,
      thin,
    );
  }
  // The zero mark: a fixed triangle pointing down onto the scale.
  context.fillStyle = colours.white;
  context.beginPath();
  context.moveTo(cx, cy - radius);
  context.lineTo(cx - s * 0.016, cy - radius - s * 0.026);
  context.lineTo(cx + s * 0.016, cy - radius - s * 0.026);
  context.closePath();
  context.fill();

  context.save();
  context.translate(cx, cy);
  context.rotate(radians(-pfd.bank));
  const steep = Math.abs(pfd.bank) > STEEP_BANK_DEG;
  context.fillStyle = steep ? colours.amber : colours.white;
  context.strokeStyle = steep ? colours.amber : colours.white;
  context.beginPath();
  context.moveTo(0, -radius + s * 0.002);
  context.lineTo(-s * 0.016, -radius + s * 0.027);
  context.lineTo(s * 0.016, -radius + s * 0.027);
  context.closePath();
  context.fill();
  // The slip-skid trapezoid slides sideways under the pointer.
  const slip = clamp(pfd.slip * s * 0.006, -s * 0.03, s * 0.03);
  context.lineWidth = thin;
  context.beginPath();
  context.moveTo(slip - s * 0.017, -radius + s * 0.031);
  context.lineTo(slip + s * 0.017, -radius + s * 0.031);
  context.lineTo(slip + s * 0.021, -radius + s * 0.041);
  context.lineTo(slip - s * 0.021, -radius + s * 0.041);
  context.closePath();
  context.stroke();
  context.restore();
}

/** The flight director's magenta bars, then the aircraft symbol over them. */
function drawDirectorAndSymbol(
  context: Context,
  box: DisplayBox,
  pfd: PfdData,
  colours: DisplayColours,
) {
  const { s } = box;
  const { cx, cy, halfHeight, perDegree } = attitudeFrame(box);
  if (pfd.director) {
    const reach = s * 0.12;
    const pitchOffset = clamp(
      (pfd.director.pitch - pfd.pitch) * perDegree,
      -halfHeight * 0.6,
      halfHeight * 0.6,
    );
    const bankOffset = clamp((pfd.director.bank - pfd.bank) * s * 0.0045, -reach, reach);
    const width = Math.max(1.5, s * 0.008);
    line(
      context,
      cx - reach,
      cy - pitchOffset,
      cx + reach,
      cy - pitchOffset,
      colours.magenta,
      width,
    );
    line(context, cx + bankOffset, cy - reach, cx + bankOffset, cy + reach, colours.magenta, width);
  }
  // Two L-shaped wings, black with a white edge, and the centre square.
  const thickness = s * 0.014;
  context.lineWidth = Math.max(1, s * 0.004);
  context.strokeStyle = colours.white;
  context.fillStyle = colours.black;
  for (const side of [-1, 1]) {
    const inner = cx + side * s * 0.055;
    const outer = cx + side * s * 0.15;
    context.beginPath();
    context.moveTo(outer, cy - thickness / 2);
    context.lineTo(inner, cy - thickness / 2);
    context.lineTo(inner, cy + s * 0.035);
    context.lineTo(inner + side * thickness, cy + s * 0.035);
    context.lineTo(inner + side * thickness, cy + thickness / 2);
    context.lineTo(outer, cy + thickness / 2);
    context.closePath();
    context.fill();
    context.stroke();
  }
  const square = s * 0.009;
  context.fillRect(cx - square, cy - square, square * 2, square * 2);
  context.strokeRect(cx - square, cy - square, square * 2, square * 2);
}

/** A deviation diamond: filled on the scale, hollow when it is pegged at the end. */
function diamond(
  context: Context,
  x: number,
  y: number,
  size: number,
  pegged: boolean,
  colours: DisplayColours,
) {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.75, y);
  context.lineTo(x, y + size);
  context.lineTo(x - size * 0.75, y);
  context.closePath();
  context.fillStyle = colours.magenta;
  context.strokeStyle = colours.magenta;
  context.lineWidth = Math.max(1, size * 0.25);
  if (pegged) context.stroke();
  else context.fill();
}

function deviationDots(
  context: Context,
  along: (offset: number) => [number, number],
  s: number,
  colours: DisplayColours,
) {
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, s * 0.0035);
  for (const dot of [-2, -1, 1, 2]) {
    const [dx, dy] = along(dot * DOT * s);
    context.beginPath();
    context.arc(dx, dy, s * 0.0085, 0, Math.PI * 2);
    context.stroke();
  }
}

/** The localizer under the attitude and the glideslope beside it, with the ILS's name, course and distance. */
function drawIls(context: Context, box: DisplayBox, pfd: PfdData, colours: DisplayColours) {
  const { s } = box;
  const { cx, cy, halfWidth, halfHeight } = attitudeFrame(box);
  const diamondSize = s * 0.016;
  if (pfd.localizerDots !== null) {
    const scaleY = cy + halfHeight + s * 0.032;
    deviationDots(context, (offset) => [cx + offset, scaleY], s, colours);
    line(
      context,
      cx,
      scaleY - s * 0.014,
      cx,
      scaleY + s * 0.014,
      colours.white,
      Math.max(1, s * 0.004),
    );
    // The diamond is the beam: it sits on the side the runway's centreline lies.
    const courseRight = -pfd.localizerDots;
    diamond(
      context,
      cx + clamp(courseRight, -2.3, 2.3) * DOT * s,
      scaleY,
      diamondSize,
      Math.abs(courseRight) > 2.3,
      colours,
    );
  }
  if (pfd.glideslopeDots !== null) {
    const scaleX = cx + halfWidth + s * 0.026;
    deviationDots(context, (offset) => [scaleX, cy + offset], s, colours);
    line(
      context,
      scaleX - s * 0.014,
      cy,
      scaleX + s * 0.014,
      cy,
      colours.white,
      Math.max(1, s * 0.004),
    );
    // Above the slope, the beam is below: the diamond shows where to fly.
    diamond(
      context,
      scaleX,
      cy + clamp(pfd.glideslopeDots, -2.3, 2.3) * DOT * s,
      diamondSize,
      Math.abs(pfd.glideslopeDots) > 2.3,
      colours,
    );
  }
  // Above the attitude, clear of the bank scale: the ILS on the left, the marker on the right.
  const above = cy - halfHeight - s * 0.024;
  if (pfd.ils) {
    const text = `${pfd.ils.ident}/${pad3(pfd.ils.course)}${pfd.ils.dme !== null ? `  DME ${pfd.ils.dme.toFixed(1)}` : ''}`;
    label(context, text, cx - halfWidth, above, s * 0.03, colours.white, 'left');
  }
  if (pfd.marker) {
    const outer = pfd.marker === 'outer';
    const colour = outer ? colours.cyan : colours.amber;
    const markerX = cx + halfWidth - s * 0.03;
    const markerY = above;
    context.strokeStyle = colour;
    context.lineWidth = Math.max(1, s * 0.004);
    context.strokeRect(markerX - s * 0.028, markerY - s * 0.019, s * 0.056, s * 0.038);
    label(context, outer ? 'OM' : 'MM', markerX, markerY, s * 0.03, colour);
  }
}

/** The radio altitude at the foot of the attitude, and the minimums call when it is reached. */
function drawRadioAltitude(
  context: Context,
  box: DisplayBox,
  pfd: PfdData,
  colours: DisplayColours,
  belowMinimums: boolean,
  blink: boolean,
) {
  const radio = pfd.radioAltitude;
  if (radio === null || radio >= 2500) return;
  const { s } = box;
  const { cx, cy, halfHeight } = attitudeFrame(box);
  // Two-foot steps near the ground, ten-foot steps above a hundred, as the radio altimeter reads out.
  const shown = radio < 100 ? Math.round(radio / 2) * 2 : Math.round(radio / 10) * 10;
  const colour = belowMinimums ? colours.amber : colours.white;
  const readout = cy + halfHeight - s * 0.04;
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(cx - s * 0.05, readout - s * 0.026, s * 0.1, s * 0.052);
  label(context, String(shown), cx, readout, s * 0.046, colour);
  if (belowMinimums && blink) {
    const warning = readout - s * 0.058;
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(cx - s * 0.085, warning - s * 0.022, s * 0.17, s * 0.044);
    label(context, 'MINIMUMS', cx, warning, s * 0.036, colours.amber);
  }
}

/** The heading arc under the attitude: a slice of the compass rose, heading up. */
function drawHeading(context: Context, box: DisplayBox, pfd: PfdData, colours: DisplayColours) {
  const { s } = box;
  const cx = box.x + ATTITUDE.cx * s;
  const cy = box.y + HEADING.cy * s;
  const radius = HEADING.radius * s;
  const thin = Math.max(1, s * 0.0035);
  const at = (relative: number, distance: number): [number, number] => [
    cx + Math.sin(radians(relative)) * distance,
    cy - Math.cos(radians(relative)) * distance,
  ];
  context.fillStyle = colours.tape;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  const first = Math.ceil((pfd.heading - HEADING.spanDeg) / 5) * 5;
  for (let bearing = first; bearing <= pfd.heading + HEADING.spanDeg; bearing += 5) {
    const relative = bearing - pfd.heading;
    const ten = ((bearing % 10) + 10) % 10 === 0;
    const [x1, y1] = at(relative, radius);
    const [x2, y2] = at(relative, radius - s * (ten ? 0.022 : 0.013));
    line(context, x1, y1, x2, y2, colours.white, thin);
    if (ten) {
      const [tx, ty] = at(relative, radius - s * 0.045);
      const value = (((bearing % 360) + 360) % 360) / 10;
      label(context, String(value), tx, ty, s * (value % 3 === 0 ? 0.034 : 0.025), colours.white);
    }
  }
  const track = clamp(
    ((pfd.track - pfd.heading + 540) % 360) - 180,
    -HEADING.spanDeg,
    HEADING.spanDeg,
  );
  const [trackX, trackY] = at(track, radius - s * 0.06);
  const [trackEndX, trackEndY] = at(track, radius);
  line(context, trackX, trackY, trackEndX, trackEndY, colours.white, Math.max(1, s * 0.005));
  const selected = clamp(
    ((pfd.selectedHeading - pfd.heading + 540) % 360) - 180,
    -HEADING.spanDeg,
    HEADING.spanDeg,
  );
  context.save();
  context.translate(...at(selected, radius));
  context.rotate(radians(selected));
  context.strokeStyle = colours.magenta;
  context.lineWidth = Math.max(1, s * 0.005);
  context.beginPath();
  context.moveTo(-s * 0.018, 0);
  context.lineTo(-s * 0.018, -s * 0.016);
  context.lineTo(-s * 0.007, -s * 0.016);
  context.lineTo(0, -s * 0.006);
  context.lineTo(s * 0.007, -s * 0.016);
  context.lineTo(s * 0.018, -s * 0.016);
  context.lineTo(s * 0.018, 0);
  context.stroke();
  context.restore();
  // The lubber line and the heading in its box, with MAG beside it.
  const top = cy - radius;
  context.fillStyle = colours.white;
  context.beginPath();
  context.moveTo(cx, top + s * 0.006);
  context.lineTo(cx - s * 0.012, top - s * 0.012);
  context.lineTo(cx + s * 0.012, top - s * 0.012);
  context.closePath();
  context.fill();
  const boxY = top - s * 0.04;
  context.fillStyle = colours.black;
  context.fillRect(cx - s * 0.042, boxY - s * 0.022, s * 0.084, s * 0.044);
  context.strokeStyle = colours.white;
  context.lineWidth = thin;
  context.strokeRect(cx - s * 0.042, boxY - s * 0.022, s * 0.084, s * 0.044);
  label(context, pad3(pfd.heading), cx, boxY, s * 0.038, colours.white);
  label(context, 'MAG', cx + s * 0.052, boxY, s * 0.026, colours.green, 'left');
}

/** The flight mode annunciations: thrust, roll and pitch, armed modes beneath, and the AFDS status. */
function drawModes(context: Context, box: DisplayBox, pfd: PfdData, colours: DisplayColours) {
  const { s } = box;
  const left = box.x + 0.18 * s;
  const width = 0.54 * s;
  const column = width / 3;
  const thin = Math.max(1, s * 0.0035);
  for (const divider of [1, 2])
    line(
      context,
      left + divider * column,
      box.y + s * 0.012,
      left + divider * column,
      box.y + s * 0.08,
      colours.white,
      thin,
    );
  const columns: [string, string][] = [
    [pfd.fma.thrust, ''],
    [pfd.fma.roll, pfd.fma.armedRoll],
    [pfd.fma.pitch, pfd.fma.armedPitch],
  ];
  columns.forEach(([active, armed], index) => {
    const middle = left + column * (index + 0.5);
    if (active) label(context, active, middle, box.y + s * 0.032, s * 0.036, colours.green);
    if (armed) label(context, armed, middle, box.y + s * 0.067, s * 0.029, colours.white);
  });
  if (pfd.fma.status)
    label(
      context,
      pfd.fma.status,
      box.x + ATTITUDE.cx * s,
      box.y + s * 0.122,
      s * 0.045,
      colours.green,
    );
}
