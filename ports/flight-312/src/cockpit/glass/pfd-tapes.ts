import { label, line, type Context, type DisplayColours } from './glass-kit';
import type { PfdData } from './glass-model';

/**
 * The PFD's moving tapes: airspeed on the left with its bugs, trend vector
 * and limit bands, altitude on the right with the selected altitude and the
 * baro setting, and the vertical speed scale beside it. Each tape is laid
 * out in fractions of the display's side, `s`, from its top-left corner.
 */
export interface DisplayBox {
  x: number;
  y: number;
  s: number;
}

/** Where the tapes sit: their sides, and the shared centre line they read against. */
export const TAPE = { top: 0.165, bottom: 0.725, centre: 0.445 } as const;
const SPEED = { left: 0.045, right: 0.185 } as const;
const ALTITUDE = { left: 0.69, right: 0.83 } as const;
const VSI = { left: 0.855, right: 0.955, half: 0.22 } as const;
/** Knots and feet either side of the readout that fit on a tape. */
const SPEED_SPAN_KT = 42;
const ALTITUDE_SPAN_FT = 450;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Digits on a drum: the one showing, with its neighbours above and below
 * so the last digit rolls rather than jumps. `value` is in units of `step`.
 */
function rollingDigits(
  context: Context,
  value: number,
  format: (whole: number) => string,
  cx: number,
  cy: number,
  pitch: number,
  size: number,
  colour: string,
) {
  const whole = Math.floor(value);
  const fraction = value - whole;
  for (const offset of [-1, 0, 1, 2]) {
    label(context, format(whole + offset), cx, cy + (fraction - offset) * pitch, size, colour);
  }
}

/** A readout box with a notch pointing at the attitude: right for speed, left for altitude. */
function readoutBox(
  context: Context,
  left: number,
  right: number,
  cy: number,
  half: number,
  notch: 'left' | 'right',
  colours: DisplayColours,
  width: number,
) {
  const tip = half * 0.45;
  context.beginPath();
  if (notch === 'right') {
    context.moveTo(left, cy - half);
    context.lineTo(right - tip, cy - half);
    context.lineTo(right - tip, cy - tip);
    context.lineTo(right, cy);
    context.lineTo(right - tip, cy + tip);
    context.lineTo(right - tip, cy + half);
    context.lineTo(left, cy + half);
  } else {
    context.moveTo(right, cy - half);
    context.lineTo(left + tip, cy - half);
    context.lineTo(left + tip, cy - tip);
    context.lineTo(left, cy);
    context.lineTo(left + tip, cy + tip);
    context.lineTo(left + tip, cy + half);
    context.lineTo(right, cy + half);
  }
  context.closePath();
  context.fillStyle = colours.black;
  context.fill();
  context.strokeStyle = colours.white;
  context.lineWidth = width;
  context.stroke();
}

/**
 * The taller window round the last digits, where the drum rolls: it stands
 * out above and below the readout box, as the -400's does. Leaves the
 * context clipped to it.
 */
function drumWindow(
  context: Context,
  left: number,
  width: number,
  centre: number,
  half: number,
  colours: DisplayColours,
  thin: number,
) {
  context.fillStyle = colours.black;
  context.fillRect(left, centre - half, width, half * 2);
  context.strokeStyle = colours.white;
  context.lineWidth = thin;
  context.strokeRect(left, centre - half, width, half * 2);
  context.beginPath();
  context.rect(left, centre - half, width, half * 2);
  context.clip();
}

/** A strip of alternating colour, scrolling with the tape: the barber poles. */
function checkerStrip(
  context: Context,
  x: number,
  width: number,
  from: number,
  to: number,
  cell: number,
  phase: number,
  colours: [string, string],
) {
  const top = Math.min(from, to);
  const bottom = Math.max(from, to);
  if (bottom - top < 0.5) return;
  const start = Math.floor((top - phase) / cell);
  for (let index = start; index * cell + phase < bottom; index++) {
    const cellTop = index * cell + phase;
    const y0 = Math.max(top, cellTop);
    const y1 = Math.min(bottom, cellTop + cell);
    if (y1 <= y0) continue;
    context.fillStyle = colours[((index % 2) + 2) % 2] as string;
    context.fillRect(x, y0, width, y1 - y0);
  }
}

export function drawSpeedTape(
  context: Context,
  box: DisplayBox,
  pfd: PfdData,
  colours: DisplayColours,
) {
  const { s } = box;
  const left = box.x + SPEED.left * s;
  const right = box.x + SPEED.right * s;
  const top = box.y + TAPE.top * s;
  const bottom = box.y + TAPE.bottom * s;
  const centre = box.y + TAPE.centre * s;
  const perKt = (bottom - top) / 2 / SPEED_SPAN_KT;
  // The tape stops at 30 knots: below that it reads nothing useful.
  const ias = Math.max(30, pfd.ias);
  const yOf = (kt: number) => centre - (kt - ias) * perKt;
  const thin = Math.max(1, s * 0.0035);

  context.save();
  context.beginPath();
  context.rect(left, top, right - left, bottom - top);
  context.clip();
  context.fillStyle = colours.tape;
  context.fillRect(left, top, right - left, bottom - top);
  for (
    let kt = Math.ceil((ias - SPEED_SPAN_KT - 10) / 10) * 10;
    kt <= ias + SPEED_SPAN_KT + 10;
    kt += 10
  ) {
    if (kt < 30) continue;
    const y = yOf(kt);
    line(context, right - s * 0.02, y, right, y, colours.white, thin);
    if (kt % 20 === 0)
      label(context, String(kt), right - s * 0.027, y, s * 0.04, colours.white, 'right');
  }
  // The limits along the tape's edge: the barber pole above the fastest speed, amber and red below the slowest.
  const strip = { x: right - s * 0.012, width: s * 0.012 };
  const cell = s * 0.018;
  const phase = yOf(0) % (cell * 2);
  checkerStrip(context, strip.x, strip.width, top, yOf(pfd.maxSpeed), cell, phase, [
    colours.red,
    colours.black,
  ]);
  if (!pfd.onGround) {
    context.fillStyle = colours.amber;
    const amberTop = yOf(pfd.minManoeuvre);
    const amberBottom = yOf(pfd.stall);
    context.fillRect(
      strip.x + strip.width * 0.35,
      amberTop,
      strip.width * 0.3,
      amberBottom - amberTop,
    );
    checkerStrip(context, strip.x, strip.width, yOf(pfd.stall), bottom, cell, phase, [
      colours.red,
      colours.black,
    ]);
  }
  drawSelectedSpeed(context, right, clamp(yOf(pfd.selectedSpeed), top, bottom), s, colours);
  if (Math.abs(pfd.trendKt) > 2) {
    const tipY = clamp(yOf(ias + pfd.trendKt), top, bottom);
    const x = right - s * 0.006;
    line(context, x, centre, x, tipY, colours.green, Math.max(1, s * 0.005));
    const head = Math.sign(pfd.trendKt) * s * 0.012;
    context.fillStyle = colours.green;
    context.beginPath();
    context.moveTo(x, tipY - head * 0.2);
    context.lineTo(x - s * 0.009, tipY + head);
    context.lineTo(x + s * 0.009, tipY + head);
    context.closePath();
    context.fill();
  }
  context.restore();

  for (const bug of pfd.bugs) {
    const y = yOf(bug.kt);
    // V1 above the tape's reach is shown as a number at its top, as the -400 does.
    if (y < top && bug.label === 'V1')
      label(
        context,
        `V1 ${Math.round(bug.kt)}`,
        right + s * 0.012,
        top + s * 0.012,
        s * 0.028,
        colours.green,
        'left',
      );
    if (y < top || y > bottom) continue;
    line(context, right, y, right + s * 0.012, y, colours.green, Math.max(1, s * 0.004));
    label(context, bug.label, right + s * 0.015, y, s * 0.028, colours.green, 'left');
  }
  readoutBox(
    context,
    left + s * 0.004,
    right - s * 0.008,
    centre,
    s * 0.038,
    'right',
    colours,
    thin,
  );
  const digitSize = s * 0.05;
  label(
    context,
    String(Math.floor(ias / 10)),
    left + s * 0.078,
    centre,
    digitSize,
    colours.white,
    'right',
  );
  context.save();
  drumWindow(context, left + s * 0.077, s * 0.034, centre, s * 0.056, colours, thin);
  rollingDigits(
    context,
    ias % 10,
    (digit) => String(((digit % 10) + 10) % 10),
    left + s * 0.094,
    centre,
    s * 0.062,
    digitSize,
    colours.white,
  );
  context.restore();

  label(
    context,
    String(Math.round(pfd.selectedSpeed)),
    (left + right) / 2,
    top - s * 0.03,
    s * 0.045,
    colours.magenta,
  );
  if (pfd.mach > 0.4)
    label(
      context,
      `.${String(Math.round(pfd.mach * 1000))
        .padStart(3, '0')
        .slice(-3)}`,
      (left + right) / 2,
      bottom + s * 0.032,
      s * 0.04,
      colours.white,
    );
  if (pfd.noVSpeeds) {
    ['NO', 'V', 'SPD'].forEach((word, index) =>
      label(
        context,
        word,
        right + s * 0.022,
        centre - s * 0.16 + index * s * 0.032,
        s * 0.028,
        colours.amber,
      ),
    );
  }
}

/** The selected-speed (or altitude) bug: a magenta notch on the tape's edge. */
function drawSelectedSpeed(
  context: Context,
  edge: number,
  y: number,
  s: number,
  colours: DisplayColours,
) {
  const half = s * 0.016;
  context.strokeStyle = colours.magenta;
  context.lineWidth = Math.max(1, s * 0.005);
  context.beginPath();
  context.moveTo(edge, y - half);
  context.lineTo(edge - s * 0.02, y - half);
  context.lineTo(edge - s * 0.02, y - half * 0.4);
  context.lineTo(edge - s * 0.012, y);
  context.lineTo(edge - s * 0.02, y + half * 0.4);
  context.lineTo(edge - s * 0.02, y + half);
  context.lineTo(edge, y + half);
  context.stroke();
}

export function drawAltitudeTape(
  context: Context,
  box: DisplayBox,
  pfd: PfdData,
  colours: DisplayColours,
  belowMinimums: boolean,
  blink: boolean,
) {
  const { s } = box;
  const left = box.x + ALTITUDE.left * s;
  const right = box.x + ALTITUDE.right * s;
  const top = box.y + TAPE.top * s;
  const bottom = box.y + TAPE.bottom * s;
  const centre = box.y + TAPE.centre * s;
  const perFt = (bottom - top) / 2 / ALTITUDE_SPAN_FT;
  const altitude = pfd.altitude;
  const yOf = (feet: number) => centre - (feet - altitude) * perFt;
  const thin = Math.max(1, s * 0.0035);

  context.save();
  context.beginPath();
  context.rect(left, top, right - left, bottom - top);
  context.clip();
  context.fillStyle = colours.tape;
  context.fillRect(left, top, right - left, bottom - top);
  // The ground under the wheels, from the radio altimeter: amber hatching below it, as the -400 marks the landing altitude.
  if (pfd.radioAltitude !== null) {
    const groundY = yOf(altitude - pfd.radioAltitude);
    if (groundY < bottom) {
      context.fillStyle = 'rgba(0, 0, 0, 0.35)';
      context.fillRect(left, groundY, right - left, bottom - groundY);
      context.strokeStyle = colours.amber;
      context.lineWidth = Math.max(1, s * 0.003);
      context.beginPath();
      for (let offset = -s * 0.2; offset < right - left; offset += s * 0.016) {
        context.moveTo(left + offset, bottom);
        context.lineTo(left + offset + (bottom - groundY), groundY);
      }
      context.stroke();
      line(context, left, groundY, right, groundY, colours.amber, Math.max(1, s * 0.005));
    }
  }
  const first = Math.ceil((altitude - ALTITUDE_SPAN_FT - 100) / 100) * 100;
  for (let feet = first; feet <= altitude + ALTITUDE_SPAN_FT + 100; feet += 100) {
    const y = yOf(feet);
    line(context, left, y, left + s * 0.018, y, colours.white, thin);
    if (feet % 200 !== 0) continue;
    const thousand = feet % 1000 === 0;
    label(
      context,
      String(feet),
      left + s * 0.026,
      y,
      s * (thousand ? 0.04 : 0.034),
      colours.white,
      'left',
    );
    if (thousand) {
      // The thousands are boxed above and below, as the -400's tape marks them.
      line(context, left + s * 0.024, y - s * 0.024, right, y - s * 0.024, colours.white, thin);
      line(context, left + s * 0.024, y + s * 0.024, right, y + s * 0.024, colours.white, thin);
    }
  }
  const bugY = clamp(yOf(pfd.selectedAltitude), top, bottom);
  context.strokeStyle = colours.magenta;
  context.lineWidth = Math.max(1, s * 0.005);
  context.beginPath();
  context.moveTo(left, bugY - s * 0.03);
  context.lineTo(left + s * 0.02, bugY - s * 0.03);
  context.lineTo(left + s * 0.02, bugY - s * 0.008);
  context.lineTo(left + s * 0.01, bugY);
  context.lineTo(left + s * 0.02, bugY + s * 0.008);
  context.lineTo(left + s * 0.02, bugY + s * 0.03);
  context.lineTo(left, bugY + s * 0.03);
  context.stroke();
  context.restore();

  readoutBox(
    context,
    left - s * 0.012,
    right + s * 0.004,
    centre,
    s * 0.045,
    'left',
    colours,
    thin,
  );
  const absolute = Math.abs(altitude);
  const sign = altitude < 0 ? '-' : '';
  const thousands = Math.floor(absolute / 1000);
  const hundreds = Math.floor((absolute % 1000) / 100);
  const big = s * 0.05;
  label(
    context,
    `${sign}${thousands > 0 ? thousands : ''}`,
    left + s * 0.05,
    centre,
    big,
    colours.white,
    'right',
  );
  label(context, String(hundreds), left + s * 0.064, centre + s * 0.004, s * 0.042, colours.white);
  context.save();
  drumWindow(context, left + s * 0.079, s * 0.058, centre, s * 0.05, colours, thin);
  rollingDigits(
    context,
    (absolute % 100) / 20,
    (step) => String((((step % 5) + 5) % 5) * 20).padStart(2, '0'),
    left + s * 0.106,
    centre,
    s * 0.044,
    s * 0.034,
    colours.white,
  );
  context.restore();

  const middle = (left + right) / 2;
  label(
    context,
    String(Math.round(pfd.selectedAltitude)),
    middle,
    top - s * 0.03,
    s * 0.045,
    colours.magenta,
  );
  const minimumsColour = belowMinimums ? colours.amber : colours.green;
  if (!belowMinimums || blink)
    label(context, `MINS ${pfd.minimums}`, middle, bottom + s * 0.035, s * 0.032, minimumsColour);
  const standard = Math.abs(pfd.baroInHg - 29.92) < 0.005 && altitude > 18_000;
  label(
    context,
    standard ? 'STD' : `${pfd.baroInHg.toFixed(2)} IN`,
    middle,
    bottom + s * 0.075,
    s * 0.036,
    colours.green,
  );
}

/** The -400's vertical speed scale: expanded near zero, compressed out to six thousand. */
function vsiFraction(fpm: number): number {
  const magnitude = Math.abs(fpm);
  const fraction =
    magnitude <= 1000
      ? (0.45 * magnitude) / 1000
      : magnitude <= 2000
        ? 0.45 + (0.3 * (magnitude - 1000)) / 1000
        : 0.75 + (0.17 * Math.min(magnitude - 2000, 4000)) / 4000;
  return Math.sign(fpm) * fraction;
}

export function drawVerticalSpeed(
  context: Context,
  box: DisplayBox,
  verticalSpeed: number,
  colours: DisplayColours,
) {
  const { s } = box;
  const left = box.x + VSI.left * s;
  const right = box.x + VSI.right * s;
  const centre = box.y + TAPE.centre * s;
  const half = VSI.half * s;
  const chamfer = s * 0.03;
  const thin = Math.max(1, s * 0.0035);
  context.save();
  context.beginPath();
  context.moveTo(left, centre - half + chamfer);
  context.lineTo(left + chamfer, centre - half);
  context.lineTo(right, centre - half);
  context.lineTo(right, centre + half);
  context.lineTo(left + chamfer, centre + half);
  context.lineTo(left, centre + half - chamfer);
  context.closePath();
  context.fillStyle = colours.tape;
  context.fill();
  context.clip();
  for (const mark of [500, 1000, 1500, 2000, 6000]) {
    for (const sign of [-1, 1]) {
      const y = centre - vsiFraction(sign * mark) * half;
      const major = mark === 1000 || mark === 2000 || mark === 6000;
      line(context, left + s * 0.008, y, left + s * (major ? 0.03 : 0.02), y, colours.white, thin);
      if (major) label(context, String(mark / 1000), left + s * 0.045, y, s * 0.032, colours.white);
    }
  }
  line(
    context,
    left + s * 0.004,
    centre,
    left + s * 0.04,
    centre,
    colours.white,
    Math.max(1, s * 0.006),
  );
  // The needle swings from a pivot off to the right of the scale.
  const tipY = centre - vsiFraction(verticalSpeed) * half;
  line(
    context,
    right + s * 0.12,
    centre,
    left + s * 0.01,
    tipY,
    colours.white,
    Math.max(1, s * 0.006),
  );
  context.restore();
  if (Math.abs(verticalSpeed) > 400) {
    const value = String(Math.round(Math.abs(verticalSpeed) / 50) * 50);
    const y = verticalSpeed > 0 ? centre - half - s * 0.028 : centre + half + s * 0.028;
    label(context, value, (left + right) / 2, y, s * 0.034, colours.white);
  }
}
