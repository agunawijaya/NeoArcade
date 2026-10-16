import {
  drawDial,
  drawEngPage,
  drawFctlPage,
  drawFuelPage,
  drawGearPage,
  EGT_SCALE,
  EPR_SCALE,
  N1_SCALE,
  type DialScale,
} from './eicas-pages';
import type { EicasData, EicasMessage, LowerPage } from './glass-model';
import { boxed, label, line, screen, type Context, type DisplayColours } from './glass-kit';

/**
 * The engine indication and crew alerting system: the upper screen with
 * the primary engine dials (EPR, N1, EGT for each of the four engines),
 * the thrust reference, the total air temperature, the gear and the flaps
 * when they are out, the fuel and weight, and the crew alerts in their
 * order of urgency; the lower screen with the page the crew chose on the
 * display select panel. Boeing's dials of the era are an open arc with a
 * pointer and the value in a box above, the swept part of the dial shaded.
 */
const MESSAGE_ORDER: EicasMessage['level'][] = ['warning', 'caution', 'advisory', 'memo'];
/** The engines in two pairs, with room between them for the row's name. */
const DIAL_COLUMNS = [0.08, 0.225, 0.435, 0.58];

function drawMessages(
  context: Context,
  x: number,
  y: number,
  size: number,
  messages: readonly EicasMessage[],
  colours: DisplayColours,
) {
  const sorted = [...messages].sort(
    (a, b) => MESSAGE_ORDER.indexOf(a.level) - MESSAGE_ORDER.indexOf(b.level),
  );
  const height = size * 0.044;
  sorted.slice(0, 11).forEach((message, index) => {
    const colour =
      message.level === 'warning'
        ? colours.red
        : message.level === 'memo'
          ? colours.white
          : colours.amber;
    // Advisories sit one character in from the cautions above them.
    const indent = message.level === 'advisory' ? size * 0.018 : 0;
    label(context, message.text, x + indent, y + index * height, size * 0.034, colour, 'left');
  });
}

function drawGear(
  context: Context,
  x: number,
  y: number,
  size: number,
  gear: EicasData['gear'],
  colours: DisplayColours,
) {
  const width = size * 0.13;
  const height = size * 0.05;
  label(context, 'GEAR', x, y - height * 0.95, size * 0.03, colours.white);
  const down = gear.position > 0.99;
  const up = gear.position < 0.01 && !gear.leverDown;
  if (down || up) {
    boxed(
      context,
      down ? 'DOWN' : 'UP',
      x,
      y,
      width,
      height,
      down ? colours.green : colours.white,
      down ? colours.green : colours.white,
    );
    return;
  }
  // In transit: the box crosshatched until the gear locks.
  context.save();
  context.beginPath();
  context.rect(x - width / 2, y - height / 2, width, height);
  context.clip();
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, size * 0.003);
  for (let stripe = -height; stripe < width + height; stripe += height * 0.35) {
    context.beginPath();
    context.moveTo(x - width / 2 + stripe, y + height / 2);
    context.lineTo(x - width / 2 + stripe + height, y - height / 2);
    context.stroke();
  }
  context.restore();
  context.strokeStyle = colours.white;
  context.strokeRect(x - width / 2, y - height / 2, width, height);
}

/** The flap detents, evenly spaced down the tape as the display draws them. */
const FLAP_MARKS = [0, 1, 5, 10, 20, 25, 30];

function flapShare(degrees: number): number {
  for (let index = 1; index < FLAP_MARKS.length; index++) {
    const upper = FLAP_MARKS[index] as number;
    const lower = FLAP_MARKS[index - 1] as number;
    if (degrees <= upper)
      return (index - 1 + (degrees - lower) / (upper - lower)) / (FLAP_MARKS.length - 1);
  }
  return 1;
}

function drawFlaps(
  context: Context,
  x: number,
  top: number,
  bottom: number,
  size: number,
  flapsDeg: number,
  leverDeg: number,
  colours: DisplayColours,
) {
  if (flapsDeg < 0.2 && leverDeg === 0) return;
  const width = size * 0.024;
  const height = bottom - top;
  label(context, 'FLAPS', x, top - size * 0.03, size * 0.03, colours.white);
  context.fillStyle = 'rgba(242, 244, 240, 0.85)';
  context.fillRect(x - width / 2, top, width, height * flapShare(flapsDeg));
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, size * 0.0035);
  context.strokeRect(x - width / 2, top, width, height);
  for (const mark of FLAP_MARKS.slice(1)) {
    const y = top + height * flapShare(mark);
    line(context, x + width / 2, y, x + width * 0.9, y, colours.white, Math.max(1, size * 0.003));
  }
  // The lever's setting: magenta while the flaps travel to it, green once they are there.
  const command = top + height * flapShare(leverDeg);
  const arrived = Math.abs(flapsDeg - leverDeg) < 0.3;
  const tone = arrived ? colours.green : colours.magenta;
  line(
    context,
    x - width * 0.9,
    command,
    x + width * 0.9,
    command,
    tone,
    Math.max(1.5, size * 0.006),
  );
  label(context, String(leverDeg), x - width * 1.2, command, size * 0.04, tone, 'right');
}

export function drawUpperEicas(
  context: Context,
  x: number,
  y: number,
  size: number,
  eicas: EicasData,
  colours: DisplayColours,
  blink: boolean,
) {
  const s = (value: number) => value * size;
  screen(context, x, y, size, size, colours, () => {
    const tat = Math.round(eicas.tatC);
    label(
      context,
      `TAT ${tat >= 0 ? '+' : ''}${tat}c`,
      x + s(0.025),
      y + s(0.032),
      s(0.032),
      colours.white,
      'left',
    );
    label(
      context,
      `${eicas.thrustReference} ${eicas.eprReference.toFixed(2)}`,
      x + s(0.23),
      y + s(0.032),
      s(0.036),
      colours.green,
      'left',
    );
    const radius = s(0.066);
    const rows: [string, (index: number) => number, DialScale, number][] = [
      ['EPR', (index) => eicas.engines[index]?.epr ?? 1, EPR_SCALE, 0.2],
      ['N1', (index) => eicas.engines[index]?.n1 ?? 0, N1_SCALE, 0.45],
      ['EGT', (index) => eicas.engines[index]?.egt ?? 0, EGT_SCALE, 0.7],
    ];
    for (const [name, valueOf, scale, row] of rows) {
      for (let engine = 0; engine < 4; engine++) {
        const cx = x + s(DIAL_COLUMNS[engine] ?? 0);
        drawDial(
          context,
          cx,
          y + s(row),
          radius,
          scale,
          valueOf(engine),
          colours,
          blink,
          name === 'EPR' ? eicas.eprReference : undefined,
        );
        if (name === 'EPR' && (eicas.engines[engine]?.reverser ?? 0) > 0.1) {
          const open = (eicas.engines[engine]?.reverser ?? 0) > 0.95;
          label(
            context,
            'REV',
            cx - radius * 0.45,
            y + s(row) - radius * 1.32,
            s(0.03),
            open ? colours.green : colours.amber,
          );
        }
      }
      // Below the level where the arcs end, so a pointer at full scale never crosses it.
      label(context, name, x + s(0.33), y + s(row) + radius * 0.95, s(0.034), colours.white);
    }
    drawMessages(context, x + s(0.66), y + s(0.06), size, eicas.messages, colours);
    drawGear(context, x + s(0.725), y + s(0.68), size, eicas.gear, colours);
    drawFlaps(
      context,
      x + s(0.915),
      y + s(0.53),
      y + s(0.8),
      size,
      eicas.flapsDeg,
      eicas.flapLeverDeg,
      colours,
    );
    label(context, 'TOTAL FUEL', x + s(0.66), y + s(0.88), s(0.028), colours.white, 'left');
    label(
      context,
      (eicas.totalFuelLb / 1000).toFixed(1),
      x + s(0.97),
      y + s(0.88),
      s(0.04),
      colours.white,
      'right',
    );
    label(context, 'GROSS WT', x + s(0.66), y + s(0.94), s(0.028), colours.white, 'left');
    label(
      context,
      (eicas.grossWeightLb / 1000).toFixed(1),
      x + s(0.97),
      y + s(0.94),
      s(0.04),
      colours.white,
      'right',
    );
  });
}

export function drawLowerEicas(
  context: Context,
  x: number,
  y: number,
  size: number,
  eicas: EicasData,
  page: LowerPage,
  colours: DisplayColours,
) {
  screen(context, x, y, size, size, colours, () => {
    switch (page) {
      case 'eng':
        drawEngPage(context, x, y, size, eicas, colours);
        return;
      case 'fuel':
        drawFuelPage(context, x, y, size, eicas, colours);
        return;
      case 'gear':
        drawGearPage(context, x, y, size, eicas, colours);
        return;
      case 'fctl':
        drawFctlPage(context, x, y, size, eicas, colours);
        return;
    }
  });
}
