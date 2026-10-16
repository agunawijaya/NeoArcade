import type { TankId } from '../../engine/aircraft';
import type { EicasData } from './glass-model';
import { boxed, label, line, type Context, type DisplayColours } from './glass-kit';

/**
 * The EICAS's round engine dials, and the lower screen's pages: the
 * secondary engine indications, the fuel synoptic, the gear with its tyres
 * and brakes, and the flight control surfaces. The engine model has no oil
 * system, vibration or tyres of its own: those numbers are worked out from
 * the fan and core speeds and the weather, steady where a healthy jumbo's
 * would be steady.
 */
export interface DialScale {
  min: number;
  max: number;
  /** Amber: the most the engine may give for long; red: never past it. */
  amber?: number;
  red?: number;
  digits: (value: number) => string;
}

export const EPR_SCALE: DialScale = { min: 1, max: 1.7, red: 1.62, digits: (v) => v.toFixed(2) };
export const N1_SCALE: DialScale = { min: 0, max: 115, red: 111.4, digits: (v) => v.toFixed(1) };
export const EGT_SCALE: DialScale = {
  min: 0,
  max: 1000,
  amber: 875,
  red: 915,
  digits: (v) => String(Math.round(v)),
};
const N2_SCALE: DialScale = { min: 0, max: 115, red: 105, digits: (v) => v.toFixed(1) };

/** The arc runs clockwise from nine o'clock to about four. */
const ARC_START = 270;
const ARC_SWEEP = 210;
const RADIANS = Math.PI / 180;

/** A clock angle (0 at twelve, clockwise) as canvas radians. */
const canvasAngle = (clock: number) => (clock - 90) * RADIANS;

function dialAngle(scale: DialScale, value: number): number {
  const share = Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)));
  return ARC_START + share * ARC_SWEEP;
}

function radial(
  context: Context,
  cx: number,
  cy: number,
  clock: number,
  inner: number,
  outer: number,
  colour: string,
  width: number,
) {
  const angle = canvasAngle(clock);
  line(
    context,
    cx + Math.cos(angle) * inner,
    cy + Math.sin(angle) * inner,
    cx + Math.cos(angle) * outer,
    cy + Math.sin(angle) * outer,
    colour,
    width,
  );
}

/**
 * One of the round engine dials: the open arc, the swept sector shaded,
 * the limit marks, the pointer, and the value in a box above and to the
 * right. Past the red line the value turns red, and its box flashes.
 */
export function drawDial(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  scale: DialScale,
  value: number,
  colours: DisplayColours,
  blink: boolean,
  reference?: number,
) {
  const over = scale.red !== undefined && value >= scale.red;
  const caution = !over && scale.amber !== undefined && value >= scale.amber;
  const tone = over ? colours.red : caution ? colours.amber : colours.white;
  context.fillStyle = over ? 'rgba(255, 59, 47, 0.3)' : 'rgba(150, 160, 172, 0.3)';
  context.beginPath();
  context.moveTo(cx, cy);
  context.arc(cx, cy, radius, canvasAngle(ARC_START), canvasAngle(dialAngle(scale, value)));
  context.closePath();
  context.fill();
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, radius * 0.05);
  context.beginPath();
  context.arc(cx, cy, radius, canvasAngle(ARC_START), canvasAngle(ARC_START + ARC_SWEEP));
  context.stroke();
  const width = Math.max(1, radius * 0.08);
  if (scale.amber !== undefined)
    radial(
      context,
      cx,
      cy,
      dialAngle(scale, scale.amber),
      radius * 0.82,
      radius * 1.12,
      colours.amber,
      width,
    );
  if (scale.red !== undefined)
    radial(
      context,
      cx,
      cy,
      dialAngle(scale, scale.red),
      radius * 0.78,
      radius * 1.16,
      colours.red,
      width,
    );
  if (reference !== undefined) {
    // The reference EPR, as a green bug just outside the arc.
    const angle = canvasAngle(dialAngle(scale, reference));
    context.fillStyle = colours.green;
    context.beginPath();
    context.arc(
      cx + Math.cos(angle) * radius * 1.06,
      cy + Math.sin(angle) * radius * 1.06,
      Math.max(1.5, radius * 0.1),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  radial(
    context,
    cx,
    cy,
    dialAngle(scale, value),
    0,
    radius * 0.96,
    tone,
    Math.max(1, radius * 0.08),
  );
  if (over && !blink) return;
  boxed(
    context,
    scale.digits(value),
    cx + radius * 0.3,
    cy - radius * 1.34,
    radius * 1.6,
    radius * 0.52,
    tone,
    tone,
  );
}

function title(
  context: Context,
  x: number,
  y: number,
  size: number,
  text: string,
  colours: DisplayColours,
) {
  label(context, text, x + size / 2, y + size * 0.05, size * 0.042, colours.white);
}

/** A row's name between the second and third engines, as the displays put it. */
function rowName(
  context: Context,
  x: number,
  y: number,
  size: number,
  text: string,
  colours: DisplayColours,
) {
  label(context, text, x + size * 0.5, y, size * 0.03, colours.white);
}

const engineX = (x: number, size: number, engine: number) => x + size * (0.14 + engine * 0.24);

/** A vertical scale with a pointer and the value under it: oil pressure and temperature. */
function bar(
  context: Context,
  cx: number,
  top: number,
  height: number,
  share: number,
  digits: string,
  size: number,
  colours: DisplayColours,
) {
  const width = size * 0.012;
  line(context, cx, top, cx, top + height, colours.white, width * 0.4);
  for (const mark of [0, 0.5, 1])
    line(
      context,
      cx - width,
      top + height * mark,
      cx,
      top + height * mark,
      colours.white,
      width * 0.3,
    );
  const y = top + height * (1 - Math.min(1, Math.max(0, share)));
  context.fillStyle = colours.white;
  context.beginPath();
  context.moveTo(cx + width * 0.4, y);
  context.lineTo(cx + width * 2.4, y - width * 1.1);
  context.lineTo(cx + width * 2.4, y + width * 1.1);
  context.closePath();
  context.fill();
  label(context, digits, cx, top + height + size * 0.03, size * 0.032, colours.white);
}

export function drawEngPage(
  context: Context,
  x: number,
  y: number,
  size: number,
  eicas: EicasData,
  colours: DisplayColours,
) {
  title(context, x, y, size, 'ENG', colours);
  const radius = size * 0.07;
  eicas.engines.forEach((engine, index) => {
    const cx = engineX(x, size, index);
    drawDial(context, cx, y + size * 0.23, radius, N2_SCALE, engine.n2, colours, true);
    label(
      context,
      (engine.fuelFlow / 1000).toFixed(2),
      cx,
      y + size * 0.36,
      size * 0.036,
      colours.white,
    );
    // No oil system in the engine model: pressure and temperature follow the core's speed.
    const running = engine.running ? 1 : 0;
    const pressure = running * (18 + engine.n2 * 0.42);
    const temperature = 40 + running * (30 + engine.n2 * 0.5);
    bar(
      context,
      cx,
      y + size * 0.44,
      size * 0.12,
      pressure / 80,
      String(Math.round(pressure)),
      size,
      colours,
    );
    bar(
      context,
      cx,
      y + size * 0.65,
      size * 0.12,
      temperature / 200,
      String(Math.round(temperature)),
      size,
      colours,
    );
    label(
      context,
      (18.2 - index * 0.3).toFixed(1),
      cx,
      y + size * 0.86,
      size * 0.032,
      colours.white,
    );
    const vibration = running * (0.2 + engine.n1 * 0.008);
    label(context, vibration.toFixed(1), cx, y + size * 0.93, size * 0.032, colours.white);
  });
  rowName(context, x, y + size * 0.23, size, 'N2', colours);
  rowName(context, x, y + size * 0.36, size, 'FF', colours);
  rowName(context, x, y + size * 0.5, size, 'OIL P', colours);
  rowName(context, x, y + size * 0.71, size, 'OIL T', colours);
  rowName(context, x, y + size * 0.86, size, 'OIL Q', colours);
  rowName(context, x, y + size * 0.93, size, 'VIB', colours);
}

/** The tanks as the synoptic draws them, left to right across the wings. */
const TANKS: { id: TankId; name: string; from: number; to: number }[] = [
  { id: 'reserve1', name: 'RES 1', from: 0.04, to: 0.14 },
  { id: 'main1', name: 'MAIN 1', from: 0.15, to: 0.28 },
  { id: 'main2', name: 'MAIN 2', from: 0.29, to: 0.42 },
  { id: 'centre', name: 'CTR', from: 0.43, to: 0.57 },
  { id: 'main3', name: 'MAIN 3', from: 0.58, to: 0.71 },
  { id: 'main4', name: 'MAIN 4', from: 0.72, to: 0.85 },
  { id: 'reserve4', name: 'RES 4', from: 0.86, to: 0.96 },
];

/** A valve: a circle with its gate in line with the flow when open, across it when shut. */
function valve(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  open: boolean,
  horizontal: boolean,
  colours: DisplayColours,
) {
  context.strokeStyle = open ? colours.green : colours.white;
  context.lineWidth = Math.max(1, radius * 0.18);
  context.fillStyle = colours.background;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  const along = open === horizontal;
  line(
    context,
    cx - (along ? radius : 0),
    cy - (along ? 0 : radius),
    cx + (along ? radius : 0),
    cy + (along ? 0 : radius),
    open ? colours.green : colours.white,
    Math.max(1, radius * 0.18),
  );
}

export function drawFuelPage(
  context: Context,
  x: number,
  y: number,
  size: number,
  eicas: EicasData,
  colours: DisplayColours,
) {
  title(context, x, y, size, 'FUEL', colours);
  const s = (value: number) => value * size;
  const manifold = y + s(0.33);
  const tankTop = y + s(0.47);
  const tankBottom = y + s(0.72);
  const flowLine = Math.max(1.5, s(0.006));
  const engineXs = [0.215, 0.355, 0.645, 0.785].map((share) => x + s(share));
  const centreFeeds = eicas.fuel.centre > 0;
  // The crossfeed manifold, live while the centre tank or the crossfeed joins the engines.
  const manifoldLive = centreFeeds || eicas.crossfeed;
  line(
    context,
    engineXs[0] as number,
    manifold,
    engineXs[3] as number,
    manifold,
    manifoldLive ? colours.green : colours.grey,
    flowLine,
  );
  line(
    context,
    x + s(0.5),
    manifold,
    x + s(0.5),
    tankTop,
    centreFeeds ? colours.green : colours.grey,
    flowLine,
  );
  eicas.engines.forEach((engine, index) => {
    const ex = engineXs[index] as number;
    const flowing = engine.running && engine.fuelFlow > 0;
    context.strokeStyle = colours.white;
    context.lineWidth = Math.max(1, s(0.004));
    context.strokeRect(ex - s(0.035), y + s(0.11), s(0.07), s(0.07));
    label(context, String(index + 1), ex, y + s(0.145), s(0.036), colours.white);
    line(context, ex, y + s(0.18), ex, tankTop, flowing ? colours.green : colours.grey, flowLine);
    valve(context, ex, manifold, s(0.022), eicas.crossfeed || centreFeeds, true, colours);
  });
  label(context, 'X FEED', x + s(0.5), manifold - s(0.035), s(0.026), colours.white);
  for (const tank of TANKS) {
    const left = x + s(tank.from);
    const width = s(tank.to - tank.from);
    const pounds = eicas.fuel[tank.id];
    context.strokeStyle = colours.white;
    context.lineWidth = Math.max(1, s(0.004));
    context.strokeRect(left, tankTop, width, tankBottom - tankTop);
    label(context, tank.name, left + width / 2, tankTop + s(0.04), s(0.025), colours.white);
    label(
      context,
      (pounds / 1000).toFixed(1),
      left + width / 2,
      tankTop + s(0.13),
      s(0.038),
      pounds < 2000 && tank.id.startsWith('main') ? colours.amber : colours.white,
    );
  }
  // Fuel temperature: the tanks cold-soak toward the outside air on a long flight.
  const fuelTemp = Math.round(Math.max(-38, Math.min(25, eicas.tatC * 0.6)));
  label(context, 'TOTAL FUEL', x + s(0.06), y + s(0.82), s(0.03), colours.white, 'left');
  label(
    context,
    (eicas.totalFuelLb / 1000).toFixed(1),
    x + s(0.44),
    y + s(0.82),
    s(0.042),
    colours.white,
    'right',
  );
  label(context, 'LB X 1000', x + s(0.46), y + s(0.82), s(0.024), colours.white, 'left');
  label(context, 'FUEL TEMP', x + s(0.06), y + s(0.89), s(0.03), colours.white, 'left');
  label(
    context,
    `${fuelTemp >= 0 ? '+' : ''}${fuelTemp}c`,
    x + s(0.44),
    y + s(0.89),
    s(0.036),
    colours.white,
    'right',
  );
  if (eicas.crossfeed)
    label(context, 'FUEL BALANCE', x + s(0.94), y + s(0.82), s(0.03), colours.white, 'right');
}

/** The gear groups as seen from above: nose, the two wing gears, the two body gears. */
const GEARS: { name: string; x: number; y: number; wheels: number; pressure: number }[] = [
  { name: 'NOSE', x: 0.5, y: 0.2, wheels: 2, pressure: 196 },
  { name: 'WING', x: 0.2, y: 0.47, wheels: 4, pressure: 205 },
  { name: 'BODY', x: 0.38, y: 0.6, wheels: 4, pressure: 207 },
  { name: 'BODY', x: 0.62, y: 0.6, wheels: 4, pressure: 207 },
  { name: 'WING', x: 0.8, y: 0.47, wheels: 4, pressure: 205 },
];

export function drawGearPage(
  context: Context,
  x: number,
  y: number,
  size: number,
  eicas: EicasData,
  colours: DisplayColours,
) {
  title(context, x, y, size, 'GEAR', colours);
  const s = (value: number) => value * size;
  const down = eicas.gear.position > 0.99;
  const up = eicas.gear.position < 0.01 && !eicas.gear.leverDown;
  // Brakes on the 0 to 9.9 scale of the brake temperature monitor.
  const brakes = Math.min(9.9, Math.max(0, eicas.brakeTempC / 100));
  GEARS.forEach((gear, index) => {
    const cx = x + s(gear.x);
    const cy = y + s(gear.y);
    const wheelWidth = s(0.06);
    const wheelHeight = s(0.075);
    const columns = gear.wheels === 2 ? 2 : 2;
    const rows = gear.wheels / columns;
    for (let wheel = 0; wheel < gear.wheels; wheel++) {
      const column = wheel % columns;
      const row = Math.floor(wheel / columns);
      const wx = cx + (column - 0.5) * wheelWidth * 1.25;
      const wy = cy + (row - (rows - 1) / 2) * wheelHeight * 1.5;
      context.strokeStyle = colours.white;
      context.lineWidth = Math.max(1, s(0.004));
      context.beginPath();
      context.roundRect(
        wx - wheelWidth / 2,
        wy - wheelHeight / 2,
        wheelWidth,
        wheelHeight,
        s(0.012),
      );
      context.stroke();
      label(
        context,
        String(gear.pressure - (wheel % 3)),
        wx,
        wy - wheelHeight * 0.18,
        s(0.024),
        colours.white,
      );
      if (index > 0)
        label(
          context,
          brakes.toFixed(1),
          wx,
          wy + wheelHeight * 0.22,
          s(0.028),
          brakes >= 5 ? colours.amber : colours.green,
        );
    }
    const status = down ? 'DN' : up ? 'UP' : '';
    label(
      context,
      gear.name,
      cx,
      cy - wheelHeight * (rows === 1 ? 1.05 : 1.75),
      s(0.026),
      colours.white,
    );
    if (status)
      label(
        context,
        status,
        cx,
        cy + wheelHeight * (rows === 1 ? 1.05 : 1.75),
        s(0.03),
        down ? colours.green : colours.white,
      );
  });
  const doorsOpen = !down && !up;
  label(context, 'DOORS', x + s(0.06), y + s(0.86), s(0.03), colours.white, 'left');
  label(
    context,
    doorsOpen ? 'OPEN' : 'CLOSED',
    x + s(0.26),
    y + s(0.86),
    s(0.034),
    doorsOpen ? colours.amber : colours.white,
    'left',
  );
  label(
    context,
    'TIRE PSI / BRAKE TEMP',
    x + s(0.94),
    y + s(0.86),
    s(0.024),
    colours.white,
    'right',
  );
  if (eicas.parkingBrake)
    label(context, 'PARKING BRAKE SET', x + s(0.5), y + s(0.93), s(0.034), colours.white);
}

/** A control surface's travel: a scale, its neutral mark, and a pointer at the deflection. */
function travel(
  context: Context,
  cx: number,
  cy: number,
  length: number,
  value: number,
  vertical: boolean,
  size: number,
  colours: DisplayColours,
) {
  const half = length / 2;
  const width = Math.max(1, size * 0.004);
  if (vertical) {
    line(context, cx, cy - half, cx, cy + half, colours.white, width);
    line(context, cx - size * 0.012, cy, cx + size * 0.012, cy, colours.white, width);
  } else {
    line(context, cx - half, cy, cx + half, cy, colours.white, width);
    line(context, cx, cy - size * 0.012, cx, cy + size * 0.012, colours.white, width);
  }
  const share = Math.max(-1, Math.min(1, value));
  const px = vertical ? cx : cx + share * half;
  const py = vertical ? cy - share * half : cy;
  const tip = size * 0.018;
  context.fillStyle = colours.green;
  context.beginPath();
  if (vertical) {
    context.moveTo(px + size * 0.004, py);
    context.lineTo(px + tip * 1.4, py - tip * 0.7);
    context.lineTo(px + tip * 1.4, py + tip * 0.7);
  } else {
    context.moveTo(px, py - size * 0.004);
    context.lineTo(px - tip * 0.7, py - tip * 1.4);
    context.lineTo(px + tip * 0.7, py - tip * 1.4);
  }
  context.closePath();
  context.fill();
}

export function drawFctlPage(
  context: Context,
  x: number,
  y: number,
  size: number,
  eicas: EicasData,
  colours: DisplayColours,
) {
  title(context, x, y, size, 'FLT CTRL', colours);
  const s = (value: number) => value * size;
  const { aileron, elevator, rudder, spoilers, stabiliser } = eicas.controls;
  // The wings' trailing edges sweep forward to the tips, seen from above.
  const edge = (share: number) => 0.36 - (Math.abs(share - 0.5) - 0.04) * (0.16 / 0.42);
  context.strokeStyle = colours.grey;
  context.lineWidth = Math.max(1, s(0.003));
  context.beginPath();
  context.moveTo(x + s(0.04), y + s(edge(0.04)));
  context.lineTo(x + s(0.46), y + s(edge(0.46)));
  context.moveTo(x + s(0.54), y + s(edge(0.54)));
  context.lineTo(x + s(0.96), y + s(edge(0.96)));
  context.moveTo(x + s(0.28), y + s(0.66));
  context.lineTo(x + s(0.46), y + s(0.7));
  context.moveTo(x + s(0.54), y + s(0.7));
  context.lineTo(x + s(0.72), y + s(0.66));
  context.stroke();
  // Roll right: the right ailerons rise and the left ones go down; up is up on every scale.
  const surfaces: [string, number, number][] = [
    ['OUTBD', 0.09, -aileron],
    ['INBD', 0.24, -aileron * 0.8],
    ['INBD', 0.76, aileron * 0.8],
    ['OUTBD', 0.91, aileron],
  ];
  for (const [name, at, value] of surfaces) {
    travel(context, x + s(at), y + s(edge(at)), s(0.13), value, true, size, colours);
    label(context, name, x + s(at), y + s(edge(at)) + s(0.1), s(0.024), colours.white);
  }
  label(context, 'AILERONS', x + s(0.5), y + s(0.16), s(0.028), colours.white);
  // Six spoiler panels a wing: up with the speedbrake, and on the wing going down in a roll.
  for (const side of [-1, 1]) {
    const assist = Math.max(0, -side * aileron) * 0.6;
    const raised = Math.min(1, spoilers + assist);
    for (let panel = 0; panel < 6; panel++) {
      const share = 0.5 + side * (0.06 + panel * 0.03);
      const px = x + s(share);
      const base = y + s(edge(share));
      const height = s(0.012 + raised * 0.06);
      context.fillStyle = raised > 0.02 ? colours.green : colours.background;
      context.strokeStyle = colours.white;
      context.lineWidth = Math.max(1, s(0.003));
      context.fillRect(px - s(0.011), base - height, s(0.022), height);
      context.strokeRect(px - s(0.011), base - height, s(0.022), height);
    }
  }
  label(context, 'SPOILERS', x + s(0.5), y + s(0.43), s(0.026), colours.white);
  travel(context, x + s(0.38), y + s(0.68), s(0.13), elevator, true, size, colours);
  travel(context, x + s(0.62), y + s(0.68), s(0.13), elevator, true, size, colours);
  label(context, 'ELEV', x + s(0.5), y + s(0.6), s(0.026), colours.white);
  label(context, 'RUDDER', x + s(0.5), y + s(0.79), s(0.026), colours.white);
  travel(context, x + s(0.5), y + s(0.85), s(0.3), rudder, false, size, colours);
  travel(context, x + s(0.5), y + s(0.93), s(0.3), rudder, false, size, colours);
  label(context, 'UPR', x + s(0.31), y + s(0.85), s(0.024), colours.white, 'right');
  label(context, 'LWR', x + s(0.31), y + s(0.93), s(0.024), colours.white, 'right');
  // Stabiliser trim in the units of the trim indicator, from the trimmed angle of attack.
  const units = Math.min(15, Math.max(0, 3 + stabiliser * 0.5));
  label(context, 'STAB', x + s(0.86), y + s(0.62), s(0.026), colours.white);
  boxed(
    context,
    units.toFixed(1),
    x + s(0.86),
    y + s(0.68),
    s(0.1),
    s(0.05),
    colours.green,
    colours.white,
  );
  label(context, 'UNITS', x + s(0.86), y + s(0.74), s(0.024), colours.white);
}
