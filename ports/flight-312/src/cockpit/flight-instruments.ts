import {
  BEZEL_EXTENT,
  bezel,
  clampValue,
  counter,
  face,
  needle,
  polar,
  text,
  ticks,
  type Context,
} from './canvas-kit';
import type { Palette } from './palette';

/**
 * The six-pack of the classic jumbo and its neighbours, each drawn at a
 * centre and a radius: the attitude director with its crosspointer
 * command bars, glideslope and speed-deviation scales and rising runway;
 * the horizontal situation indicator; the airspeed indicator with its
 * maximum-speed pointer and bugs; the drum-pointer altimeter; the
 * instantaneous vertical speed indicator; the radio magnetic indicator;
 * the radio altimeter; the clock; the marker lights.
 */
const SKY = '#4f80b3';
const SKY_DEEP = '#2d5a8c';
const GROUND = '#6a4a2c';
const GROUND_DEEP = '#4a311b';
const AIRCRAFT_SYMBOL = '#ffb21f';
const COMMAND_BARS = '#e64bd3';

export interface AdiData {
  pitch: number;
  bank: number;
  /** Flight director bars, or null when off. */
  director: { pitch: number; bank: number } | null;
  /** Glideslope deviation in dots (+ above), localizer in dots (+ right of course), or null. */
  glideslopeDots: number | null;
  localizerDots: number | null;
  /** Speed against the bug, knots (+ fast). */
  speedError: number;
  slip: number;
  radioAltitudeFt: number | null;
}

export function drawAdi(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  data: AdiData,
  palette: Palette,
) {
  bezel(context, cx, cy, radius, palette.face, palette.rim);
  const ball = radius * 0.8;
  const perDegree = ball * 0.034;
  context.save();
  context.beginPath();
  context.arc(cx, cy, ball, 0, Math.PI * 2);
  context.clip();
  context.translate(cx, cy);
  context.rotate((-data.bank * Math.PI) / 180);
  const horizon = data.pitch * perDegree;
  const skyGradient = context.createLinearGradient(0, horizon - ball * 1.6, 0, horizon);
  skyGradient.addColorStop(0, SKY_DEEP);
  skyGradient.addColorStop(1, SKY);
  context.fillStyle = skyGradient;
  context.fillRect(-ball * 2, horizon - ball * 3, ball * 4, ball * 3);
  const groundGradient = context.createLinearGradient(0, horizon, 0, horizon + ball * 1.6);
  groundGradient.addColorStop(0, GROUND);
  groundGradient.addColorStop(1, GROUND_DEEP);
  context.fillStyle = groundGradient;
  context.fillRect(-ball * 2, horizon, ball * 4, ball * 3);
  context.strokeStyle = palette.marking;
  context.lineWidth = radius * 0.02;
  context.beginPath();
  context.moveTo(-ball * 1.5, horizon);
  context.lineTo(ball * 1.5, horizon);
  context.stroke();
  for (let degrees = -60; degrees <= 60; degrees += 5) {
    if (degrees === 0) continue;
    const y = horizon - degrees * perDegree;
    if (Math.abs(y) > ball * 1.05) continue;
    const half = degrees % 10 === 0 ? ball * 0.3 : ball * 0.13;
    context.lineWidth = radius * (degrees % 10 === 0 ? 0.018 : 0.012);
    context.beginPath();
    context.moveTo(-half, y);
    context.lineTo(half, y);
    context.stroke();
    if (degrees % 10 === 0) {
      text(
        context,
        String(Math.abs(degrees)),
        -half - ball * 0.12,
        y,
        radius * 0.11,
        palette.marking,
      );
      text(
        context,
        String(Math.abs(degrees)),
        half + ball * 0.12,
        y,
        radius * 0.11,
        palette.marking,
      );
    }
  }
  // The bank pointer rides on the sphere.
  context.fillStyle = palette.marking;
  context.beginPath();
  context.moveTo(0, -ball * 0.96);
  context.lineTo(-ball * 0.06, -ball * 0.84);
  context.lineTo(ball * 0.06, -ball * 0.84);
  context.closePath();
  context.fill();
  context.restore();

  // The bank scale is fixed to the case.
  context.strokeStyle = palette.marking;
  for (const bank of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const long = Math.abs(bank) === 30 || Math.abs(bank) === 60;
    const [x1, y1] = polar(cx, cy, radius * 0.98, bank);
    const [x2, y2] = polar(cx, cy, radius * (long ? 0.86 : 0.9), bank);
    context.lineWidth = radius * 0.025;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }
  context.fillStyle = palette.marking;
  context.beginPath();
  const [tx, ty] = polar(cx, cy, radius * 0.86, 0);
  context.moveTo(tx, ty);
  context.lineTo(tx - radius * 0.06, ty - radius * 0.1);
  context.lineTo(tx + radius * 0.06, ty - radius * 0.1);
  context.closePath();
  context.fill();

  // Command bars: a vertical one for roll, a horizontal one for pitch.
  if (data.director) {
    const bankBar = clampValue((data.director.bank - data.bank) * 0.018, -0.6, 0.6) * ball;
    const pitchBar = clampValue((data.director.pitch - data.pitch) * 0.05, -0.6, 0.6) * ball;
    context.strokeStyle = COMMAND_BARS;
    context.lineWidth = radius * 0.035;
    context.beginPath();
    context.moveTo(cx + bankBar, cy - ball * 0.55);
    context.lineTo(cx + bankBar, cy + ball * 0.55);
    context.moveTo(cx - ball * 0.55, cy - pitchBar);
    context.lineTo(cx + ball * 0.55, cy - pitchBar);
    context.stroke();
  }

  // The aircraft: two wings and a dot.
  context.fillStyle = AIRCRAFT_SYMBOL;
  context.strokeStyle = '#151515';
  context.lineWidth = radius * 0.012;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(cx + side * ball * 0.22, cy);
    context.lineTo(cx + side * ball * 0.62, cy);
    context.lineTo(cx + side * ball * 0.62, cy + radius * 0.05);
    context.lineTo(cx + side * ball * 0.28, cy + radius * 0.05);
    context.lineTo(cx + side * ball * 0.22, cy + radius * 0.13);
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.fillRect(cx - radius * 0.035, cy - radius * 0.035, radius * 0.07, radius * 0.07);

  // Glideslope scale on the right, speed scale on the left.
  const scale = (x: number, dots: number | null, flag: string) => {
    for (const dot of [-2, -1, 1, 2]) {
      context.beginPath();
      context.arc(x, cy - dot * ball * 0.22, radius * 0.025, 0, Math.PI * 2);
      context.strokeStyle = palette.marking;
      context.lineWidth = radius * 0.012;
      context.stroke();
    }
    context.fillStyle = palette.marking;
    context.fillRect(x - radius * 0.05, cy - radius * 0.006, radius * 0.1, radius * 0.012);
    if (dots === null) {
      text(context, flag, x, cy - ball * 0.6, radius * 0.09, palette.warning);
      return;
    }
    const y = cy + clampValue(dots, -2.4, 2.4) * ball * 0.22;
    context.fillStyle = AIRCRAFT_SYMBOL;
    context.beginPath();
    context.moveTo(x, y - radius * 0.06);
    context.lineTo(x + radius * 0.045, y);
    context.lineTo(x, y + radius * 0.06);
    context.lineTo(x - radius * 0.045, y);
    context.closePath();
    context.fill();
  };
  // The pointer shows where the glideslope lies: above it, the pointer sits low and says fly down.
  scale(cx + radius * 0.92, data.glideslopeDots, 'GS');
  scale(cx - radius * 0.92, clampValue(-data.speedError / 10, -2.4, 2.4), '');
  text(context, 'F', cx - radius * 0.92, cy - ball * 0.68, radius * 0.08, palette.dim);
  text(context, 'S', cx - radius * 0.92, cy + ball * 0.68, radius * 0.08, palette.dim);

  // The rising runway: the localizer laterally, the ground coming up below 200 ft.
  const bottom = cy + ball * 0.82;
  if (data.localizerDots !== null) {
    const rise =
      data.radioAltitudeFt !== null
        ? clampValue((200 - data.radioAltitudeFt) / 200, 0, 1) * ball * 0.3
        : 0;
    const x = cx + clampValue(-data.localizerDots, -2.4, 2.4) * ball * 0.22;
    context.fillStyle = '#2f9e4a';
    context.beginPath();
    context.moveTo(x - radius * 0.06, bottom - rise);
    context.lineTo(x + radius * 0.06, bottom - rise);
    context.lineTo(x + radius * 0.12, bottom - rise + radius * 0.07);
    context.lineTo(x - radius * 0.12, bottom - rise + radius * 0.07);
    context.closePath();
    context.fill();
  }
  // The slip ball.
  const tube = { x: cx, y: cy + radius * 1.0, half: radius * 0.34 };
  context.fillStyle = '#1b1d1f';
  context.fillRect(tube.x - tube.half, tube.y - radius * 0.05, tube.half * 2, radius * 0.1);
  context.fillStyle = '#e8e6de';
  context.beginPath();
  context.arc(
    tube.x + clampValue(data.slip * 0.06, -1, 1) * tube.half * 0.8,
    tube.y,
    radius * 0.045,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.strokeStyle = palette.marking;
  context.lineWidth = radius * 0.01;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(tube.x + side * radius * 0.06, tube.y - radius * 0.05);
    context.lineTo(tube.x + side * radius * 0.06, tube.y + radius * 0.05);
    context.stroke();
  }
}

export interface HsiData {
  heading: number;
  headingBug: number;
  course: number;
  /** Course deviation in dots (+ course to the right), or null with the NAV flag in view. */
  deviationDots: number | null;
  toFrom: 'to' | 'from' | 'off';
  glideslopeDots: number | null;
  dmeNm: number | null;
  track: number;
}

const CARDINALS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

/** A compass card that turns with the heading, as on the HSI and the RMI: drawn north up, then turned. */
function compassCard(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  heading: number,
  palette: Palette,
) {
  const drawCard = (card: Context) => {
    ticks(card, 0, 0, radius, 0, 355, 5, 10, (value) => value, palette.marking);
    for (let degrees = 0; degrees < 360; degrees += 30) {
      const [x, y] = polar(0, 0, radius * 0.72, degrees);
      card.save();
      card.translate(x, y);
      card.rotate((degrees * Math.PI) / 180);
      text(card, CARDINALS[degrees] ?? String(degrees / 10), 0, 0, radius * 0.15, palette.marking);
      card.restore();
    }
  };
  face(context, `card ${palette.marking}`, cx, cy, radius, drawCard, -heading);
}

export function drawHsi(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  data: HsiData,
  palette: Palette,
) {
  face(context, `hsi ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    text(dial, 'DME', -radius * 0.85, -radius * 0.86, radius * 0.07, palette.dim);
    text(dial, 'CRS', radius * 0.85, -radius * 0.86, radius * 0.07, palette.dim);
  });
  compassCard(context, cx, cy, radius * 0.92, data.heading, palette);
  // Lubber line and the aircraft.
  context.fillStyle = palette.marking;
  context.fillRect(cx - radius * 0.012, cy - radius * 1.02, radius * 0.024, radius * 0.12);
  context.strokeStyle = AIRCRAFT_SYMBOL;
  context.lineWidth = radius * 0.035;
  context.beginPath();
  context.moveTo(cx, cy - radius * 0.14);
  context.lineTo(cx, cy + radius * 0.16);
  context.moveTo(cx - radius * 0.14, cy - radius * 0.02);
  context.lineTo(cx + radius * 0.14, cy - radius * 0.02);
  context.moveTo(cx - radius * 0.06, cy + radius * 0.14);
  context.lineTo(cx + radius * 0.06, cy + radius * 0.14);
  context.stroke();

  // Heading bug and track triangle on the card's rim.
  const [bx, by] = polar(cx, cy, radius * 0.93, data.headingBug - data.heading);
  context.save();
  context.translate(bx, by);
  context.rotate(((data.headingBug - data.heading) * Math.PI) / 180);
  context.fillStyle = '#e55af0';
  context.fillRect(-radius * 0.07, -radius * 0.02, radius * 0.05, radius * 0.08);
  context.fillRect(radius * 0.02, -radius * 0.02, radius * 0.05, radius * 0.08);
  context.restore();
  const [ux, uy] = polar(cx, cy, radius * 0.84, data.track - data.heading);
  context.fillStyle = palette.marking;
  context.beginPath();
  context.arc(ux, uy, radius * 0.03, 0, Math.PI * 2);
  context.fill();

  // Course arrow and deviation bar, turning with the card.
  context.save();
  context.translate(cx, cy);
  context.rotate(((data.course - data.heading) * Math.PI) / 180);
  const arrow = '#f2c94c';
  context.fillStyle = arrow;
  context.fillRect(-radius * 0.022, -radius * 0.78, radius * 0.044, radius * 0.4);
  context.beginPath();
  context.moveTo(0, -radius * 0.86);
  context.lineTo(-radius * 0.07, -radius * 0.72);
  context.lineTo(radius * 0.07, -radius * 0.72);
  context.closePath();
  context.fill();
  context.fillRect(-radius * 0.022, radius * 0.38, radius * 0.044, radius * 0.4);
  for (const dot of [-2, -1, 1, 2]) {
    context.beginPath();
    context.arc(dot * radius * 0.17, 0, radius * 0.03, 0, Math.PI * 2);
    context.strokeStyle = palette.marking;
    context.lineWidth = radius * 0.014;
    context.stroke();
  }
  if (data.deviationDots !== null) {
    const x = clampValue(data.deviationDots, -2.5, 2.5) * radius * 0.17;
    context.fillStyle = arrow;
    context.fillRect(x - radius * 0.022, -radius * 0.34, radius * 0.044, radius * 0.68);
    if (data.toFrom !== 'off') {
      const tip = data.toFrom === 'to' ? -1 : 1;
      context.fillStyle = palette.marking;
      context.beginPath();
      context.moveTo(radius * 0.36, tip * radius * 0.28);
      context.lineTo(radius * 0.3, tip * radius * 0.18);
      context.lineTo(radius * 0.42, tip * radius * 0.18);
      context.closePath();
      context.fill();
    }
  }
  context.restore();
  if (data.deviationDots === null) {
    context.fillStyle = palette.warning;
    context.fillRect(cx - radius * 0.5, cy - radius * 0.42, radius * 0.24, radius * 0.11);
    text(context, 'NAV', cx - radius * 0.38, cy - radius * 0.365, radius * 0.08, '#fff');
  }
  if (data.glideslopeDots !== null) {
    const y = cy + clampValue(data.glideslopeDots, -2.4, 2.4) * radius * 0.17;
    context.fillStyle = AIRCRAFT_SYMBOL;
    context.beginPath();
    context.moveTo(cx + radius * 0.82, y);
    context.lineTo(cx + radius * 0.9, y - radius * 0.05);
    context.lineTo(cx + radius * 0.9, y + radius * 0.05);
    context.closePath();
    context.fill();
  }
  counter(
    context,
    cx - radius * 1.06,
    cy - radius * 1.1,
    radius * 0.42,
    radius * 0.17,
    data.dmeNm === null ? '----' : data.dmeNm.toFixed(data.dmeNm < 100 ? 1 : 0),
  );
  counter(
    context,
    cx + radius * 0.64,
    cy - radius * 1.1,
    radius * 0.42,
    radius * 0.17,
    String(Math.round(data.course) % 360 || 360).padStart(3, '0'),
  );
}

export interface AirspeedData {
  ias: number;
  mach: number;
  vmo: number;
  bug: number;
  referenceBugs: number[];
}

/** 60 kt at the top, 400 kt most of the way round: a 330° dial, wider spaced at the low end where it matters. */
function airspeedAngle(knots: number): number {
  const value = clampValue(knots, 40, 420);
  if (value <= 200) return ((value - 40) / 160) * 190;
  return 190 + ((value - 200) / 220) * 145;
}

export function drawAirspeed(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  data: AirspeedData,
  palette: Palette,
) {
  face(context, `airspeed ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    ticks(dial, 0, 0, radius, 60, 200, 5, 10, airspeedAngle, palette.marking);
    ticks(dial, 0, 0, radius, 200, 420, 10, 50, airspeedAngle, palette.marking);
    for (const knots of [60, 80, 100, 120, 140, 160, 180, 200, 250, 300, 350, 400]) {
      const [x, y] = polar(0, 0, radius * 0.66, airspeedAngle(knots));
      text(dial, String(knots), x, y, radius * 0.13, palette.marking);
    }
    text(dial, 'KNOTS', 0, radius * 0.3, radius * 0.08, palette.dim);
    text(dial, 'MACH', 0, -radius * 0.12, radius * 0.07, palette.dim);
  });
  counter(
    context,
    cx - radius * 0.24,
    cy - radius * 0.34,
    radius * 0.48,
    radius * 0.17,
    `.${Math.round(clampValue(data.mach, 0, 0.99) * 1000)
      .toString()
      .padStart(3, '0')}`,
  );
  for (const bug of data.referenceBugs) {
    const [x, y] = polar(cx, cy, radius * 0.99, airspeedAngle(bug));
    context.fillStyle = palette.bug;
    context.beginPath();
    context.arc(x, y, radius * 0.035, 0, Math.PI * 2);
    context.fill();
  }
  const [bx, by] = polar(cx, cy, radius * 0.96, airspeedAngle(data.bug));
  context.save();
  context.translate(bx, by);
  context.rotate((airspeedAngle(data.bug) * Math.PI) / 180);
  context.fillStyle = '#e55af0';
  context.fillRect(-radius * 0.05, -radius * 0.03, radius * 0.1, radius * 0.1);
  context.restore();
  // The striped maximum-speed pointer, moving down with altitude as Mach takes over.
  needle(context, cx, cy, radius * 0.92, airspeedAngle(data.vmo), '#d43c33', 0.05);
  needle(context, cx, cy, radius * 0.9, airspeedAngle(data.ias), palette.needle);
}

export interface AltimeterData {
  altitudeFt: number;
  settingInHg: number;
}

export function drawAltimeter(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  data: AltimeterData,
  palette: Palette,
) {
  face(context, `altimeter ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    ticks(dial, 0, 0, radius, 0, 980, 20, 100, (value) => (value / 1000) * 360, palette.marking);
    for (let hundreds = 0; hundreds < 10; hundreds++) {
      const [x, y] = polar(0, 0, radius * 0.7, hundreds * 36);
      text(dial, String(hundreds), x, y, radius * 0.17, palette.marking);
    }
    text(dial, 'IN HG', 0, radius * 0.52, radius * 0.07, palette.dim);
  });
  const altitude = data.altitudeFt;
  const thousands = Math.floor(Math.abs(altitude) / 1000);
  const hundreds = Math.floor((Math.abs(altitude) % 1000) / 100);
  const drum = `${altitude < 0 ? '-' : ''}${String(thousands).padStart(2, '0')}${hundreds}00`;
  counter(
    context,
    cx - radius * 0.36,
    cy - radius * 0.36,
    radius * 0.72,
    radius * 0.22,
    `${drum.slice(0, -3)} ${drum.slice(-3)}`,
  );
  counter(
    context,
    cx - radius * 0.26,
    cy + radius * 0.28,
    radius * 0.52,
    radius * 0.16,
    data.settingInHg.toFixed(2),
  );
  needle(
    context,
    cx,
    cy,
    radius * 0.9,
    ((((altitude % 1000) + 1000) % 1000) / 1000) * 360,
    palette.needle,
    0.12,
  );
}

/** The IVSI's scale: 0 at nine o'clock, logarithmic out to 6,000 fpm either way. */
function verticalSpeedAngle(fpm: number): number {
  const value = clampValue(Math.abs(fpm), 0, 6000);
  const fraction =
    value <= 1000
      ? (value / 1000) * 0.45
      : 0.45 + (Math.log10(value / 1000) / Math.log10(6)) * 0.55;
  return 270 + Math.sign(fpm) * fraction * 168;
}

export function drawVerticalSpeed(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  fpm: number,
  palette: Palette,
) {
  face(context, `vertical speed ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    const marks = [0, 500, 1000, 1500, 2000, 3000, 4000, 6000];
    for (const sign of [-1, 1]) {
      for (const mark of marks) {
        const angle = verticalSpeedAngle(sign * mark);
        const [x1, y1] = polar(0, 0, radius * 0.96, angle);
        const [x2, y2] = polar(0, 0, radius * (mark % 1000 === 0 ? 0.8 : 0.87), angle);
        dial.strokeStyle = palette.marking;
        dial.lineWidth = radius * 0.025;
        dial.beginPath();
        dial.moveTo(x1, y1);
        dial.lineTo(x2, y2);
        dial.stroke();
        if ([1000, 2000, 4000, 6000].includes(mark) || (mark === 500 && sign > 0)) {
          const [x, y] = polar(0, 0, radius * 0.62, angle);
          const label = mark === 500 ? '.5' : String(mark / 1000);
          text(dial, label, x, y, radius * 0.14, palette.marking);
        }
      }
    }
    text(dial, 'UP', radius * 0.05, -radius * 0.3, radius * 0.08, palette.dim);
    text(dial, 'DN', radius * 0.05, radius * 0.3, radius * 0.08, palette.dim);
    text(dial, 'FPM ×1000', radius * 0.12, 0, radius * 0.065, palette.dim);
  });
  needle(context, cx, cy, radius * 0.9, verticalSpeedAngle(fpm), palette.needle);
}

export interface RmiData {
  heading: number;
  bearings: (number | null)[];
}

export function drawRmi(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  data: RmiData,
  palette: Palette,
) {
  face(context, `rmi ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    text(dial, 'VOR 1', -radius * 0.62, radius * 1.0, radius * 0.07, '#f2c94c');
    text(dial, 'VOR 2', radius * 0.62, radius * 1.0, radius * 0.07, '#9ad7ff');
  });
  compassCard(context, cx, cy, radius * 0.94, data.heading, palette);
  context.fillStyle = palette.marking;
  context.fillRect(cx - radius * 0.012, cy - radius * 1.02, radius * 0.024, radius * 0.1);
  data.bearings.forEach((bearing, index) => {
    if (bearing === null) return;
    const angle = bearing - data.heading;
    const colour = index === 0 ? '#f2c94c' : '#9ad7ff';
    context.save();
    context.translate(cx, cy);
    context.rotate((angle * Math.PI) / 180);
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = radius * (index === 0 ? 0.045 : 0.02);
    const offsets = index === 0 ? [0] : [-radius * 0.035, radius * 0.035];
    for (const offset of offsets) {
      context.beginPath();
      context.moveTo(offset, radius * 0.82);
      context.lineTo(offset, -radius * 0.62);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(0, -radius * 0.84);
    context.lineTo(-radius * 0.08, -radius * 0.6);
    context.lineTo(radius * 0.08, -radius * 0.6);
    context.closePath();
    context.fill();
    context.restore();
  });
}

/** The radio altimeter: expanded below 500 ft, 2,500 ft at the end of the scale. */
function radioAngle(feet: number): number {
  const value = clampValue(feet, 0, 2500);
  if (value <= 500) return 30 + (value / 500) * 200;
  return 230 + ((value - 500) / 2000) * 100;
}

export function drawRadioAltimeter(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  feet: number | null,
  decisionHeight: number,
  palette: Palette,
) {
  face(context, `radio ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    ticks(dial, 0, 0, radius, 0, 500, 20, 100, radioAngle, palette.marking);
    ticks(dial, 0, 0, radius, 500, 2500, 100, 500, radioAngle, palette.marking);
    for (const mark of [0, 100, 200, 300, 400, 500, 1000, 2000]) {
      const [x, y] = polar(0, 0, radius * 0.64, radioAngle(mark));
      const label = mark >= 1000 ? `${mark / 1000}K` : String(mark / 100);
      text(dial, label, x, y, radius * 0.14, palette.marking);
    }
    text(dial, 'RADIO ALT', 0, radius * 0.38, radius * 0.075, palette.dim);
  });
  const [bx, by] = polar(cx, cy, radius * 0.98, radioAngle(decisionHeight));
  context.fillStyle = AIRCRAFT_SYMBOL;
  context.beginPath();
  context.arc(bx, by, radius * 0.05, 0, Math.PI * 2);
  context.fill();
  if (feet === null) {
    context.fillStyle = palette.warning;
    context.fillRect(cx - radius * 0.25, cy - radius * 0.42, radius * 0.5, radius * 0.16);
    text(context, 'OFF', cx, cy - radius * 0.34, radius * 0.1, '#fff');
    needle(context, cx, cy, radius * 0.88, radioAngle(2500), palette.needle);
    return;
  }
  if (feet < decisionHeight) {
    context.fillStyle = AIRCRAFT_SYMBOL;
    context.beginPath();
    context.arc(cx + radius * 0.5, cy - radius * 0.45, radius * 0.1, 0, Math.PI * 2);
    context.fill();
    text(context, 'DH', cx + radius * 0.5, cy - radius * 0.45, radius * 0.08, '#111');
  }
  needle(context, cx, cy, radius * 0.88, radioAngle(feet), palette.needle);
}

export function drawClock(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  secondsOfDay: number,
  palette: Palette,
) {
  face(context, `clock ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    ticks(dial, 0, 0, radius, 0, 59, 1, 5, (value) => value * 6, palette.marking);
    for (let hour = 1; hour <= 12; hour++) {
      const [x, y] = polar(0, 0, radius * 0.7, hour * 30);
      text(dial, String(hour), x, y, radius * 0.17, palette.marking);
    }
  });
  const hours = (secondsOfDay / 3600) % 12;
  const minutes = (secondsOfDay / 60) % 60;
  needle(context, cx, cy, radius * 0.5, hours * 30, palette.needle, 0.1);
  needle(context, cx, cy, radius * 0.8, minutes * 6, palette.needle, 0.1);
  needle(context, cx, cy, radius * 0.92, Math.floor(secondsOfDay % 60) * 6, '#e0473d', 0.2);
}

export function drawMarkers(
  context: Context,
  x: number,
  y: number,
  size: number,
  lit: 'outer' | 'middle' | null,
  flashOn: boolean,
  palette: Palette,
) {
  const lamps = [
    { label: 'O', colour: '#5d7dff', on: lit === 'outer' && flashOn },
    { label: 'M', colour: '#ffb21f', on: lit === 'middle' && flashOn },
    { label: 'I', colour: '#f4f4f0', on: false },
  ];
  lamps.forEach((lamp, index) => {
    const cx = x + index * size * 1.25;
    context.beginPath();
    context.arc(cx, y, size * 0.5, 0, Math.PI * 2);
    context.fillStyle = lamp.on ? lamp.colour : '#1d1e20';
    if (lamp.on) {
      context.shadowColor = lamp.colour;
      context.shadowBlur = size * 0.8;
    }
    context.fill();
    context.shadowBlur = 0;
    text(context, lamp.label, cx, y, size * 0.5, lamp.on ? '#111' : palette.dim);
  });
}
