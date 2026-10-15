import { TANK_CAPACITY, TANK_ORDER, type TankId } from '../engine/aircraft';
import type { Region } from './actions';
import {
  annunciator,
  bezel,
  counter,
  FONT,
  needle,
  polar,
  roundRect,
  text,
  ticks,
  type Context,
} from './canvas-kit';
import type { Palette } from './palette';
import type { CockpitModel } from './view-model';

/**
 * The overhead panel and the flight engineer's station, drawn whole as
 * the eye would see them from the seat. The overhead carries what the
 * classic jumbo's does: the three inertial navigators' mode selectors,
 * engine start and ignition, anti-ice, window heat, wipers, the yaw
 * dampers, the exterior lights and the passenger signs, with the circuit
 * breakers aft. Its landing-light and wiper switches work; the others
 * follow the phase of flight. The engineer's panel reads the aircraft
 * live: the seven fuel tanks, the crossfeed valves (which work), engine
 * oil, generators, hydraulics and the cabin's pressure.
 */
function toggle(
  context: Context,
  x: number,
  y: number,
  size: number,
  up: boolean,
  label: string,
  palette: Palette,
) {
  context.fillStyle = '#121315';
  context.beginPath();
  context.arc(x, y, size * 0.55, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#d8d6ce';
  context.lineWidth = size * 0.28;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x, y + (up ? -1 : 1) * size * 0.9);
  context.stroke();
  context.lineCap = 'butt';
  text(context, label, x, y + size * 1.55, size * 0.55, palette.marking);
}

function rotary(
  context: Context,
  x: number,
  y: number,
  size: number,
  positions: string[],
  selected: number,
  label: string,
  palette: Palette,
) {
  // Three positions sit on a 120° arc; more spread wider so their names keep apart.
  const span = positions.length > 3 ? 200 : 120;
  const angleOf = (index: number) => -span / 2 + (index * span) / Math.max(1, positions.length - 1);
  positions.forEach((position, index) => {
    const [px, py] = polar(x, y, size * (positions.length > 3 ? 1.75 : 1.5), angleOf(index));
    text(context, position, px, py, size * 0.45, palette.marking);
  });
  context.fillStyle = '#26282b';
  context.beginPath();
  context.arc(x, y, size * 0.8, 0, Math.PI * 2);
  context.fill();
  const [px, py] = polar(x, y, size * 0.75, angleOf(selected));
  context.strokeStyle = '#ecebe5';
  context.lineWidth = size * 0.2;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(px, py);
  context.stroke();
  text(context, label, x, y + size * 1.4, size * 0.5, palette.marking);
}

function group(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  unit: number,
  palette: Palette,
) {
  context.strokeStyle = palette.panelEdge;
  context.lineWidth = Math.max(1, unit * 0.3);
  roundRect(context, x, y, width, height, unit);
  context.stroke();
  const size = unit * 1.8;
  context.font = `bold ${size}px ${FONT}`;
  const titleWidth = context.measureText(title).width;
  context.fillStyle = palette.panel;
  context.fillRect(x + unit * 2, y - size * 0.6, titleWidth + unit * 2, size * 1.2);
  text(context, title, x + unit * 3, y, size, palette.marking, 'left');
}

/** Rows of circuit breakers along the aft overhead: black buttons with white collars. */
function circuitBreakers(
  context: Context,
  x: number,
  y: number,
  width: number,
  rows: number,
  unit: number,
) {
  const pitch = unit * 2.6;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column * pitch < width; column++) {
      const cx = x + column * pitch + (row % 2) * pitch * 0.5;
      if (cx > x + width) continue;
      const cy = y + row * pitch;
      context.fillStyle = '#e4e2da';
      context.beginPath();
      context.arc(cx, cy, unit * 0.75, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#141517';
      context.beginPath();
      context.arc(cx, cy, unit * 0.55, 0, Math.PI * 2);
      context.fill();
    }
  }
}

export function drawOverhead(
  context: Context,
  model: CockpitModel,
  width: number,
  height: number,
  palette: Palette,
  regions: Region[],
) {
  const flight = model.flight;
  const panel = flight.panel;
  const readout = flight.readout;
  context.fillStyle = palette.panel;
  context.fillRect(0, 0, width, height);
  const unit = Math.min(width / 160, height / 100);
  const ox = (width - unit * 160) / 2;
  const oy = (height - unit * 100) / 2;
  const u = (value: number) => value * unit;
  const X = (value: number) => ox + u(value);
  const Y = (value: number) => oy + u(value);
  const below10000 = readout.altitudeFt < 10_000;
  const icing = flight.world.weather.destination.temperatureC < 3;

  // Forward row: the three inertial navigators' mode selectors and the engine start panel.
  group(context, X(3), Y(5), u(66), u(26), 'INERTIAL NAVIGATION', unit, palette);
  for (let index = 0; index < 3; index++) {
    const cx = X(15 + index * 21);
    rotary(
      context,
      cx,
      Y(18),
      u(2.6),
      ['OFF', 'STBY', 'ALN', 'NAV', 'ATT'],
      3,
      `INS ${index + 1}`,
      palette,
    );
    annunciator(context, cx + u(5), Y(11), u(6), u(3), 'BATT', false, palette.caution);
  }
  group(context, X(72), Y(5), u(85), u(26), 'ENGINE START', unit, palette);
  readout.engines.forEach((engine, index) => {
    const cx = X(82 + index * 12);
    annunciator(context, cx - u(4), Y(9), u(8), u(3.4), 'VALVE', false, palette.caution);
    toggle(context, cx, Y(20), u(2.8), engine.running, `${index + 1}`, palette);
  });
  rotary(
    context,
    X(141),
    Y(18),
    u(3),
    ['OFF', '1', '2', 'FLT'],
    below10000 ? 3 : 1,
    'IGNITION',
    palette,
  );

  // Middle row: anti-ice, window heat, wipers and the yaw dampers.
  group(context, X(3), Y(37), u(54), u(23), 'ANTI-ICE', unit, palette);
  ['NAC 1', 'NAC 2', 'NAC 3', 'NAC 4', 'WING'].forEach((label, index) => {
    const cx = X(10 + index * 10);
    annunciator(context, cx - u(4), Y(41), u(8), u(3.4), 'VALVE', icing, palette.caution);
    toggle(context, cx, Y(51), u(2.4), icing, label, palette);
  });
  group(context, X(60), Y(37), u(36), u(23), 'WINDOW HEAT', unit, palette);
  ['L SIDE', 'L FWD', 'R FWD', 'R SIDE'].forEach((label, index) => {
    const cx = X(66 + index * 8);
    annunciator(context, cx - u(3.2), Y(41), u(6.4), u(3.4), 'ON', true, palette.green);
    toggle(context, cx, Y(51), u(2.2), true, label, palette);
  });
  group(context, X(99), Y(37), u(30), u(23), 'WIPERS', unit, palette);
  const wiper = ['off', 'low', 'high'].indexOf(panel.wipers);
  for (const [index, side] of ['L', 'R'].entries())
    rotary(
      context,
      X(107 + index * 14),
      Y(50),
      u(2.8),
      ['OFF', 'LOW', 'HIGH'],
      wiper,
      side,
      palette,
    );
  regions.push({
    x: X(100),
    y: Y(40),
    width: u(28),
    height: u(19),
    label: 'Wipers',
    click: { kind: 'wipers' },
  });
  group(context, X(132), Y(37), u(25), u(23), 'YAW DAMPER', unit, palette);
  ['UPPER', 'LOWER'].forEach((label, index) => {
    const cx = X(139 + index * 11);
    annunciator(context, cx - u(3.4), Y(41), u(6.8), u(3.4), 'INOP', false, palette.caution);
    toggle(context, cx, Y(51), u(2.4), true, label, palette);
  });

  // Aft row: the exterior lights, the passenger signs and the emergency lights.
  group(context, X(3), Y(66), u(98), u(20), 'LIGHTS', unit, palette);
  ['OUTBD L', 'INBD L', 'INBD R', 'OUTBD R'].forEach((label, index) =>
    toggle(context, X(10 + index * 7.5), Y(74), u(2.4), panel.landingLights, label, palette),
  );
  text(context, 'LANDING', X(21.25), Y(82.5), u(1.6), palette.dim);
  regions.push({
    x: X(6),
    y: Y(68),
    width: u(31),
    height: u(17),
    label: 'Landing lights',
    click: { kind: 'landingLights' },
  });
  const onRunwayOrLow = readout.onGround || readout.heightFt < 2500;
  const exterior: [string, boolean][] = [
    ['TURNOFF L', onRunwayOrLow],
    ['TURNOFF R', onRunwayOrLow],
    ['TAXI', readout.onGround],
    ['NAV', true],
    ['BEACON', true],
    ['STROBE', !readout.onGround || flight.brakesReleasedAt !== null],
    ['WING', below10000],
    ['LOGO', readout.heightFt < 2500],
  ];
  exterior.forEach(([label, on], index) =>
    toggle(context, X(44 + index * 7.5), Y(74), u(2.4), on, label, palette),
  );
  group(context, X(104), Y(66), u(30), u(20), 'PASSENGER SIGNS', unit, palette);
  rotary(context, X(112), Y(75), u(2.6), ['OFF', 'AUTO', 'ON'], 2, 'NO SMOKING', palette);
  rotary(
    context,
    X(126),
    Y(75),
    u(2.6),
    ['OFF', 'AUTO', 'ON'],
    below10000 ? 2 : 1,
    'SEAT BELTS',
    palette,
  );
  group(context, X(137), Y(66), u(20), u(20), 'EMER LIGHTS', unit, palette);
  rotary(context, X(147), Y(75), u(2.6), ['OFF', 'ARMED', 'ON'], 1, '', palette);

  circuitBreakers(context, X(5), Y(91), u(150), 3, unit);
}

/** A small round gauge for the engineer's panel: a numbered arc, a needle and a counter. */
function smallGauge(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  value: number,
  max: number,
  units: string,
  digits: string,
  palette: Palette,
) {
  bezel(context, cx, cy, radius, palette.face, palette.rim);
  const angle = (v: number) => -120 + (Math.min(Math.max(v, 0), max) / max) * 240;
  ticks(context, cx, cy, radius, 0, max, max / 10, max / 2, angle, palette.marking);
  for (const numeral of [0, max / 2, max]) {
    const [x, y] = polar(cx, cy, radius * 0.66, angle(numeral));
    text(context, String(numeral), x, y, radius * 0.2, palette.marking);
  }
  counter(context, cx - radius * 0.42, cy + radius * 0.36, radius * 0.84, radius * 0.3, digits);
  text(context, units, cx, cy - radius * 0.3, radius * 0.17, palette.dim);
  needle(context, cx, cy, radius * 0.85, angle(value), palette.needle, 0.1);
}

const TANK_LABELS: Record<TankId, string> = {
  reserve1: 'RES 1',
  main1: 'MAIN 1',
  main2: 'MAIN 2',
  centre: 'CENTER',
  main3: 'MAIN 3',
  main4: 'MAIN 4',
  reserve4: 'RES 4',
};

export function drawEngineer(
  context: Context,
  model: CockpitModel,
  width: number,
  height: number,
  palette: Palette,
  regions: Region[],
) {
  const flight = model.flight;
  const readout = flight.readout;
  context.fillStyle = palette.panel;
  context.fillRect(0, 0, width, height);
  const unit = Math.min(width / 160, height / 100);
  const ox = (width - unit * 160) / 2;
  const oy = (height - unit * 100) / 2;
  const u = (value: number) => value * unit;
  const X = (value: number) => ox + u(value);
  const Y = (value: number) => oy + u(value);

  group(context, X(3), Y(4), u(154), u(44), 'FUEL QUANTITY · LB × 1000', unit, palette);
  TANK_ORDER.forEach((tank, index) => {
    const quantity = readout.fuel[tank];
    const cx = X(14 + index * 22);
    smallGauge(
      context,
      cx,
      Y(16),
      u(7.5),
      quantity / 1000,
      Math.ceil(TANK_CAPACITY[tank] / 10_000) * 10,
      'LB×1000',
      (quantity / 1000).toFixed(1),
      palette,
    );
    text(context, TANK_LABELS[tank], cx, Y(26.5), u(2), palette.marking);
  });
  // The crossfeed valves: one bar per engine, in line when open.
  for (let engine = 0; engine < 4; engine++) {
    const cx = X(25 + engine * 37);
    const cy = Y(35);
    context.strokeStyle = palette.marking;
    context.lineWidth = u(0.6);
    context.beginPath();
    context.arc(cx, cy, u(3.2), 0, Math.PI * 2);
    context.stroke();
    context.lineWidth = u(1.1);
    context.beginPath();
    if (flight.panel.crossfeed) {
      context.moveTo(cx - u(2.6), cy);
      context.lineTo(cx + u(2.6), cy);
    } else {
      context.moveTo(cx, cy - u(2.6));
      context.lineTo(cx, cy + u(2.6));
    }
    context.stroke();
    text(context, `X-FEED ${engine + 1}`, cx, cy + u(5.2), u(1.9), palette.marking);
  }
  context.strokeStyle = flight.panel.crossfeed ? palette.green : palette.dim;
  context.lineWidth = u(0.7);
  context.beginPath();
  context.moveTo(X(28.2), Y(35));
  context.lineTo(X(132), Y(35));
  context.stroke();
  regions.push({
    x: X(18),
    y: Y(30),
    width: u(124),
    height: u(12),
    label: 'Crossfeed valves',
    click: { kind: 'crossfeed' },
  });
  text(context, 'TOTAL', X(80), Y(39.5), u(1.9), palette.dim);
  counter(
    context,
    X(68),
    Y(41.5),
    u(24),
    u(4.5),
    `${Math.round(readout.fuelLb).toLocaleString('en-US')} LB`,
    '#ffb867',
  );

  group(context, X(3), Y(54), u(76), u(42), 'ENGINE OIL', unit, palette);
  text(context, 'PRESS', X(7), Y(65), u(1.7), palette.dim, 'left');
  text(context, 'TEMP', X(7), Y(82), u(1.7), palette.dim, 'left');
  readout.engines.forEach((engine, index) => {
    const pressure = engine.running ? 25 + engine.n2 * 0.45 : 0;
    const temperature = 40 + engine.n2 * 0.75;
    const cx = X(23 + index * 15.5);
    smallGauge(
      context,
      cx,
      Y(65),
      u(6),
      pressure,
      100,
      'PSI',
      String(Math.round(pressure)),
      palette,
    );
    smallGauge(
      context,
      cx,
      Y(82),
      u(6),
      temperature,
      160,
      '°C',
      String(Math.round(temperature)),
      palette,
    );
    text(context, String(index + 1), cx, Y(91.5), u(2.2), palette.marking);
  });
  group(context, X(83), Y(54), u(36), u(42), 'GENERATORS · HYD', unit, palette);
  readout.engines.forEach((engine, index) => {
    const cx = X(92 + (index % 2) * 18);
    const cy = Y(64 + Math.floor(index / 2) * 15);
    annunciator(
      context,
      cx - u(7),
      cy - u(3),
      u(14),
      u(6),
      `${engine.running ? '115V' : 'OFF'} ${index + 1}`,
      engine.running,
      palette.green,
    );
    text(context, `${engine.running ? 3000 : 0} PSI`, cx, cy + u(5), u(2), palette.marking);
  });
  group(context, X(123), Y(54), u(34), u(42), 'PRESSURIZATION', unit, palette);
  const cabin = Math.min(8000, Math.max(0, readout.altitudeFt * 0.22));
  smallGauge(
    context,
    X(140),
    Y(70),
    u(9),
    cabin / 1000,
    10,
    'CABIN FT×1000',
    `${Math.round(cabin / 100) * 100}`,
    palette,
  );
  const differential = Math.max(0, (readout.altitudeFt - cabin) * 0.00025);
  text(context, `DIFF ${differential.toFixed(1)} PSI`, X(140), Y(88), u(2.2), palette.marking);
}
