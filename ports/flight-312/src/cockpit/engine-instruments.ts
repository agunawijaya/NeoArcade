import {
  BEZEL_EXTENT,
  bezel,
  clampValue,
  counter,
  face,
  needle,
  polar,
  roundRect,
  text,
  ticks,
  type Context,
} from './canvas-kit';
import type { Palette } from './palette';

/**
 * The centre panel: four columns of engine instruments — EPR with its
 * reference bug, N1, EGT with the redline, N2, fuel flow — each a round
 * dial with a digital counter; the landing gear lever with its three
 * green and red lights; the flap position indicator with inboard and
 * outboard needles; and the master warning and caution lights.
 */
export interface EngineGaugeSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  major: number;
  redline?: number;
  digits: (value: number) => string;
  numerals: number[];
  numeral: (value: number) => string;
}

export const GAUGES = {
  epr: {
    label: 'EPR',
    min: 1,
    max: 1.8,
    step: 0.05,
    major: 0.2,
    redline: 1.62,
    digits: (v: number) => v.toFixed(2),
    numerals: [1, 1.2, 1.4, 1.6, 1.8],
    numeral: (v: number) => v.toFixed(1),
  },
  n1: {
    label: 'N1',
    min: 0,
    max: 110,
    step: 5,
    major: 20,
    redline: 104,
    digits: (v: number) => v.toFixed(1),
    numerals: [0, 20, 40, 60, 80, 100],
    numeral: (v: number) => String(v / 10),
  },
  egt: {
    label: 'EGT',
    min: 0,
    max: 1000,
    step: 50,
    major: 200,
    redline: 915,
    digits: (v: number) => String(Math.round(v)),
    numerals: [0, 200, 400, 600, 800, 1000],
    numeral: (v: number) => String(v / 100),
  },
  n2: {
    label: 'N2',
    min: 0,
    max: 110,
    step: 5,
    major: 20,
    redline: 105,
    digits: (v: number) => v.toFixed(1),
    numerals: [0, 20, 40, 60, 80, 100],
    numeral: (v: number) => String(v / 10),
  },
  ff: {
    label: 'FF',
    min: 0,
    max: 14,
    step: 0.5,
    major: 2,
    digits: (v: number) => (v * 1000).toFixed(0),
    numerals: [0, 4, 8, 12],
    numeral: (v: number) => String(v),
  },
} satisfies Record<string, EngineGaugeSpec>;

const SWEEP = 240;
const START = -120;

export function drawEngineGauge(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  spec: EngineGaugeSpec,
  value: number,
  palette: Palette,
  reference?: number,
) {
  const angle = (v: number) =>
    START + ((clampValue(v, spec.min, spec.max) - spec.min) / (spec.max - spec.min)) * SWEEP;
  face(
    context,
    `engine ${spec.label} ${palette.marking}`,
    cx,
    cy,
    radius * BEZEL_EXTENT,
    (dial) => {
      bezel(dial, 0, 0, radius, palette.face, palette.rim);
      ticks(dial, 0, 0, radius, spec.min, spec.max, spec.step, spec.major, angle, palette.marking);
      for (const mark of spec.numerals) {
        const [x, y] = polar(0, 0, radius * 0.62, angle(mark));
        text(dial, spec.numeral(mark), x, y, radius * 0.22, palette.marking);
      }
      if (spec.redline !== undefined) {
        dial.strokeStyle = palette.warning;
        dial.lineWidth = radius * 0.08;
        dial.beginPath();
        const [x1, y1] = polar(0, 0, radius * 0.97, angle(spec.redline));
        const [x2, y2] = polar(0, 0, radius * 0.72, angle(spec.redline));
        dial.moveTo(x1, y1);
        dial.lineTo(x2, y2);
        dial.stroke();
      }
    },
  );
  if (reference !== undefined) {
    const [bx, by] = polar(cx, cy, radius * 0.98, angle(reference));
    context.fillStyle = palette.caution;
    context.beginPath();
    context.arc(bx, by, radius * 0.07, 0, Math.PI * 2);
    context.fill();
  }
  counter(
    context,
    cx - radius * 0.46,
    cy + radius * 0.3,
    radius * 0.92,
    radius * 0.32,
    spec.digits(value),
  );
  needle(context, cx, cy, radius * 0.88, angle(value), palette.needle, 0.1);
}

export interface GearData {
  leverDown: boolean;
  /** 0 up and locked … 1 down and locked. */
  position: number;
}

export function drawGearPanel(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  data: GearData,
  palette: Palette,
) {
  context.fillStyle = palette.panelShade;
  roundRect(context, x, y, width, height, width * 0.06);
  context.fill();
  text(context, 'LANDING GEAR', x + width / 2, y + height * 0.07, width * 0.09, palette.marking);
  const locked = data.position > 0.99;
  const moving = data.position > 0.01 && data.position < 0.99;
  ['BODY', 'NOSE', 'WING'].forEach((label, index) => {
    const cx = x + width * (0.22 + index * 0.28);
    const cy = y + height * 0.22;
    const colour = locked ? palette.green : moving ? palette.warning : '#1c1d1f';
    context.fillStyle = colour;
    if (locked || moving) {
      context.shadowColor = colour;
      context.shadowBlur = width * 0.08;
    }
    roundRect(
      context,
      cx - width * 0.11,
      cy - height * 0.05,
      width * 0.22,
      height * 0.1,
      width * 0.02,
    );
    context.fill();
    context.shadowBlur = 0;
    text(context, label, cx, cy + height * 0.09, width * 0.065, palette.dim);
  });
  // The lever: a wheel-shaped knob, up or down.
  const slotX = x + width * 0.5;
  context.fillStyle = '#121315';
  roundRect(
    context,
    slotX - width * 0.05,
    y + height * 0.38,
    width * 0.1,
    height * 0.5,
    width * 0.04,
  );
  context.fill();
  const knobY = data.leverDown ? y + height * 0.8 : y + height * 0.44;
  context.fillStyle = '#d9d9d2';
  context.beginPath();
  context.arc(slotX, knobY, width * 0.12, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#9b9b95';
  context.beginPath();
  context.arc(slotX, knobY, width * 0.05, 0, Math.PI * 2);
  context.fill();
  text(context, 'UP', x + width * 0.22, y + height * 0.44, width * 0.08, palette.marking);
  text(context, 'DN', x + width * 0.22, y + height * 0.8, width * 0.08, palette.marking);
}

export function drawFlapIndicator(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  flapsDeg: number,
  leverDeg: number,
  palette: Palette,
) {
  const detents = [0, 1, 5, 10, 20, 25, 30];
  // The detents are evenly spaced round the dial, whatever their angles.
  const position = (degrees: number): number => {
    for (let index = 1; index < detents.length; index++) {
      const low = detents[index - 1] as number;
      const high = detents[index] as number;
      if (degrees <= high) return index - 1 + Math.max(0, degrees - low) / (high - low);
    }
    return detents.length - 1;
  };
  const angle = (degrees: number) => -110 + position(degrees) * (220 / (detents.length - 1));
  face(context, `flaps ${palette.marking}`, cx, cy, radius * BEZEL_EXTENT, (dial) => {
    bezel(dial, 0, 0, radius, palette.face, palette.rim);
    for (const detent of detents) {
      const [x1, y1] = polar(0, 0, radius * 0.96, angle(detent));
      const [x2, y2] = polar(0, 0, radius * 0.82, angle(detent));
      dial.strokeStyle = palette.marking;
      dial.lineWidth = radius * 0.04;
      dial.beginPath();
      dial.moveTo(x1, y1);
      dial.lineTo(x2, y2);
      dial.stroke();
      const [x, y] = polar(0, 0, radius * 0.62, angle(detent));
      text(dial, detent === 0 ? 'UP' : String(detent), x, y, radius * 0.2, palette.marking);
    }
    text(dial, 'FLAPS', 0, radius * 0.45, radius * 0.16, palette.dim);
  });
  // The lever's detent as a bug; the two needles are the inboard and outboard flaps, which travel together here.
  const [bx, by] = polar(cx, cy, radius * 1.0, angle(leverDeg));
  context.fillStyle = palette.caution;
  context.beginPath();
  context.arc(bx, by, radius * 0.07, 0, Math.PI * 2);
  context.fill();
  needle(context, cx, cy, radius * 0.86, angle(flapsDeg) - 2, palette.needle, 0.1);
  needle(context, cx, cy, radius * 0.86, angle(flapsDeg) + 2, '#cfcfc8', 0.1);
}

export function drawMasterLights(
  context: Context,
  x: number,
  y: number,
  size: number,
  warning: boolean,
  caution: boolean,
  flash: boolean,
  palette: Palette,
) {
  const lamp = (cx: number, label: string, on: boolean, colour: string) => {
    context.fillStyle = on && flash ? colour : '#26201c';
    if (on && flash) {
      context.shadowColor = colour;
      context.shadowBlur = size * 0.6;
    }
    roundRect(context, cx, y, size * 1.6, size, size * 0.12);
    context.fill();
    context.shadowBlur = 0;
    text(
      context,
      label,
      cx + size * 0.8,
      y + size * 0.5,
      size * 0.32,
      on && flash ? '#140c08' : palette.dim,
    );
  };
  lamp(x, 'WARNING', warning, palette.warning);
  lamp(x + size * 1.8, 'CAUTION', caution, palette.caution);
}
