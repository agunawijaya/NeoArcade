import { FLAP_DETENTS } from '../engine/aircraft';
import type { Panel, SpeedbrakeLever } from '../engine/panel';
import type { CockpitAction, Region } from './actions';
import { annunciator, counter, knob, roundRect, text, type Context } from './canvas-kit';
import type { Palette } from './palette';
import { stationName, type CockpitModel } from './view-model';
import type { Flight } from '../engine/flight';

/**
 * Looking down at the centre pedestal: the four thrust levers with their
 * reversers riding piggyback, the speedbrake lever, the flap lever in its
 * gated detents, the parking brake, the radio heads (COMM 1, NAV 1 and
 * NAV 2) and the inertial navigation unit, whose display echoes the
 * original's VLF Omega read-out of latitude and longitude.
 */
const SPEEDBRAKE_POSITIONS: SpeedbrakeLever[] = ['down', 'armed', 'flight', 'up'];

function degreesMinutes(value: number, positive: string, negative: string, width: number): string {
  const hemisphere = value >= 0 ? positive : negative;
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${hemisphere} ${String(degrees).padStart(width, '0')}°${minutes.toFixed(1).padStart(4, '0')}`;
}

export function drawPedestal(
  context: Context,
  model: CockpitModel,
  width: number,
  height: number,
  palette: Palette,
  regions: Region[],
) {
  const flight = model.flight;
  const panel = flight.panel;
  context.fillStyle = '#141516';
  context.fillRect(0, 0, width, height);
  const unit = Math.min(width / 160, height / 100);
  const ox = (width - unit * 160) / 2;
  const oy = (height - unit * 100) / 2;
  const u = (value: number) => value * unit;
  const X = (value: number) => ox + u(value);
  const Y = (value: number) => oy + u(value);

  context.fillStyle = palette.panel;
  roundRect(context, X(34), Y(2), u(92), u(96), u(3));
  context.fill();
  context.fillStyle = palette.panelShade;
  roundRect(context, X(2), Y(2), u(30), u(96), u(3));
  context.fill();
  roundRect(context, X(128), Y(2), u(30), u(96), u(3));
  context.fill();

  drawQuadrant(context, panel, X, Y, u, palette, regions);

  // Radio heads.
  const head = (
    x: number,
    y: number,
    title: string,
    active: string,
    standby: string | null,
    ident: string,
    whole: Region['knob'],
    fraction: Region['knob'],
    swap: Region['click'] | null,
  ) => {
    context.fillStyle = '#1a1b1d';
    roundRect(context, X(x), Y(y), u(28), u(18), u(1.5));
    context.fill();
    text(context, title, X(x + 14), Y(y + 2.5), u(2.2), palette.marking);
    counter(context, X(x + 1.5), Y(y + 5), u(12), u(5), active, '#ffb867');
    if (standby !== null) counter(context, X(x + 14.5), Y(y + 5), u(12), u(5), standby, '#ffb867');
    else text(context, ident, X(x + 20.5), Y(y + 7.5), u(2.6), palette.green);
    knob(context, X(x + 20), Y(y + 14), u(2.6), 0);
    knob(context, X(x + 20), Y(y + 14), u(1.5), 45, '#3a3d41');
    regions.push({
      x: X(x + 15),
      y: Y(y + 11),
      width: u(5),
      height: u(6),
      label: `${title} megahertz`,
      knob: whole,
    });
    regions.push({
      x: X(x + 20),
      y: Y(y + 11),
      width: u(5),
      height: u(6),
      label: `${title} kilohertz`,
      knob: fraction,
    });
    if (swap) {
      annunciator(context, X(x + 3), Y(y + 12), u(9), u(4), 'TFR', false, palette.marking);
      regions.push({
        x: X(x + 3),
        y: Y(y + 12),
        width: u(9),
        height: u(4),
        label: `${title} transfer`,
        click: swap,
      });
    }
  };
  const mhz = (value: number) => value.toFixed(2);
  head(36, 54, 'COMM 1', mhz(panel.comm), mhz(panel.commStandby), '', 'commWhole', 'commFraction', {
    kind: 'swapComm',
  });
  head(
    66,
    54,
    'NAV 1',
    mhz(panel.nav[0].frequency),
    null,
    stationName(panel.nav[0].frequency) ||
      (flight.nav[0].kind === 'localizer' ? flight.nav[0].ident : ''),
    'nav1Whole',
    'nav1Fraction',
    null,
  );
  head(
    96,
    54,
    'NAV 2',
    mhz(panel.nav[1].frequency),
    null,
    stationName(panel.nav[1].frequency),
    'nav2Whole',
    'nav2Fraction',
    null,
  );
  // Transponder and weather radar heads, for the look of the thing.
  context.fillStyle = '#1a1b1d';
  roundRect(context, X(36), Y(76), u(43), u(18), u(1.5));
  context.fill();
  text(context, 'ATC TRANSPONDER', X(57.5), Y(78.5), u(2.2), palette.marking);
  counter(context, X(48), Y(81), u(19), u(6), flight.atcContext.squawk, '#ffb867');
  context.fillStyle = '#1a1b1d';
  roundRect(context, X(81), Y(76), u(43), u(18), u(1.5));
  context.fill();
  text(context, 'WEATHER RADAR', X(102.5), Y(78.5), u(2.2), palette.marking);
  for (let index = 0; index < 4; index++)
    knob(context, X(88 + index * 9), Y(87), u(2.4), index * 40);

  // The inertial navigator's control and display unit, with the Omega's lat/long read-out.
  context.fillStyle = '#1a1b1d';
  roundRect(context, X(4), Y(54), u(26), u(40), u(1.5));
  context.fill();
  text(context, 'INS / VLF OMEGA', X(17), Y(57), u(2.2), palette.marking);
  context.fillStyle = palette.screen;
  context.fillRect(X(6), Y(60), u(22), u(13));
  const ins = model.ins;
  text(context, degreesMinutes(ins.lat, 'N', 'S', 2), X(7), Y(63), u(2.4), palette.green, 'left');
  text(context, degreesMinutes(ins.lon, 'E', 'W', 3), X(7), Y(66.5), u(2.4), palette.green, 'left');
  text(
    context,
    `GS ${Math.round(ins.groundSpeedKt)} TK ${String(Math.round(ins.trackTrue)).padStart(3, '0')}`,
    X(7),
    Y(70),
    u(2.4),
    palette.green,
    'left',
  );
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'].forEach((key, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    context.fillStyle = '#2b2d30';
    roundRect(context, X(7.5 + col * 7), Y(76 + row * 4.5), u(5.5), u(3.5), u(0.6));
    context.fill();
    text(context, key, X(10.25 + col * 7), Y(77.75 + row * 4.5), u(1.8), palette.marking);
  });
  text(
    context,
    `WIND ${String(Math.round(ins.windFrom)).padStart(3, '0')}/${Math.round(ins.windKt)}`,
    X(17),
    Y(95.5),
    u(2.2),
    palette.green,
  );

  drawParkingBrakeAndTrim(context, flight, X, Y, u, palette, regions);
  drawFuelControl(context, X(4), Y(6), u(1), flight.readout.engines, palette);
  drawTrimControls(context, X(130), Y(6), u(1), palette);
}

/** Panel units and their place on the screen, for a pedestal drawn in its own grid. */
export interface PedestalGrid {
  X: (value: number) => number;
  Y: (value: number) => number;
  u: (value: number) => number;
}

/**
 * The throttle quadrant: four thrust levers with their reversers, the
 * speedbrake lever on the left and the flap lever in its gates on the
 * right, in the pedestal's units from 34 to 126 across. Both decks share it.
 */
export function drawQuadrant(
  context: Context,
  panel: Panel,
  X: PedestalGrid['X'],
  Y: PedestalGrid['Y'],
  u: PedestalGrid['u'],
  palette: Palette,
  regions: Region[],
) {
  // Thrust levers: forward is up the screen. Each lever's travel is 40 units.
  const travelTop = Y(8);
  const travelBottom = Y(48);
  text(context, 'THRUST', X(80), Y(5), u(2.6), palette.marking);
  for (let lever = 0; lever < 4; lever++) {
    const cx = X(57 + lever * 15.5);
    context.fillStyle = '#0d0e0f';
    roundRect(context, cx - u(1.4), travelTop, u(2.8), travelBottom - travelTop, u(1));
    context.fill();
    const value = panel.levers[lever] ?? 0;
    const reverse = panel.reverse[lever] ?? 0;
    const y = travelBottom - value * (travelBottom - travelTop);
    context.fillStyle = '#c9c7bf';
    roundRect(context, cx - u(5), y - u(2.2), u(10), u(4.4), u(1.2));
    context.fill();
    text(context, String(lever + 1), cx, y, u(2.6), '#1b1b1b');
    // The reverse lever folds up from the front of the thrust lever.
    context.fillStyle = reverse > 0 ? palette.caution : '#77756f';
    roundRect(context, cx - u(2.2), y + u(2.4), u(4.4), u(2 + reverse * 6), u(0.8));
    context.fill();
  }
  regions.push({
    x: X(48),
    y: travelTop - u(3),
    width: u(64),
    height: travelBottom - travelTop + u(6),
    label: 'Thrust levers',
    drag: (fraction) => ({ kind: 'levers', value: fraction }),
  });
  regions.push({
    x: X(48),
    y: travelBottom + u(3),
    width: u(64),
    height: u(8),
    label: 'Reverse thrust',
    drag: (fraction) => ({ kind: 'reverse', value: 1 - fraction }),
  });
  // The quadrant's scale sits in the gap between levers 2 and 3.
  text(context, 'FULL', X(80.25), travelTop, u(1.9), palette.dim);
  text(context, 'IDLE', X(80.25), travelBottom, u(1.9), palette.dim);
  text(context, 'REV', X(80.25), travelBottom + u(7), u(1.9), palette.caution);

  // Speedbrake on the left, flaps on the right.
  const gate = (
    x: number,
    title: string,
    labels: string[],
    selected: number,
    drag: (fraction: number) => CockpitAction,
  ) => {
    text(context, title, X(x), Y(5), u(2.6), palette.marking);
    context.fillStyle = '#0d0e0f';
    roundRect(context, X(x) - u(1.2), travelTop, u(2.4), travelBottom - travelTop, u(1));
    context.fill();
    labels.forEach((label, index) => {
      const y = travelTop + (index / (labels.length - 1)) * (travelBottom - travelTop);
      context.fillStyle = palette.marking;
      context.fillRect(X(x) + u(2), y - u(0.15), u(2), u(0.3));
      text(context, label, X(x) + u(5), y, u(2.2), palette.marking, 'left');
    });
    const y = travelTop + (selected / (labels.length - 1)) * (travelBottom - travelTop);
    context.fillStyle = '#dcdad2';
    roundRect(context, X(x) - u(4.5), y - u(2), u(9), u(4), u(1));
    context.fill();
    regions.push({
      x: X(x) - u(6),
      y: travelTop - u(3),
      width: u(16),
      height: travelBottom - travelTop + u(6),
      label: title,
      drag: (fraction) => drag(1 - fraction),
    });
  };
  gate(
    38,
    'SPEEDBRAKE',
    ['DOWN', 'ARM', 'FLT', 'UP'],
    SPEEDBRAKE_POSITIONS.indexOf(panel.speedbrake),
    (fraction) => ({
      kind: 'speedbrake',
      lever: SPEEDBRAKE_POSITIONS[Math.round(fraction * 3)] ?? 'down',
    }),
  );
  gate(
    114,
    'FLAPS',
    FLAP_DETENTS.map((detent) => detent.label),
    panel.flapLever,
    (fraction) => ({
      kind: 'flapLever',
      index: Math.round(fraction * (FLAP_DETENTS.length - 1)),
    }),
  );
}

/** The parking brake, and the stabiliser trim indicator in units of airplane nose up, from 131 across and 56 down. */
export function drawParkingBrakeAndTrim(
  context: Context,
  flight: Flight,
  X: PedestalGrid['X'],
  Y: PedestalGrid['Y'],
  u: PedestalGrid['u'],
  palette: Palette,
  regions: Region[],
) {
  annunciator(
    context,
    X(131),
    Y(56),
    u(24),
    u(8),
    'PARK BRAKE',
    flight.panel.parkingBrake,
    palette.warning,
  );
  regions.push({
    x: X(131),
    y: Y(56),
    width: u(24),
    height: u(8),
    label: 'Parking brake',
    click: { kind: 'parkingBrake' },
  });
  drawTrimIndicator(
    context,
    X(136),
    Y(70),
    u(1),
    trimUnits(flight.airframe?.trimAlphaDeg ?? 6, flight.readout.flapsDeg),
    palette,
  );
}

const TRIM_UNITS = 15;
/** The green band the takeoff trim is set inside. */
const TAKEOFF_BAND_UNITS = { low: 4, high: 9 };

/**
 * The model trims to an angle of attack; the jumbo's indicator reads units
 * of stabiliser, which also wind in nose-up as the flaps come down. This is
 * a reading of the one in the language of the other, not a stabiliser model.
 */
function trimUnits(trimAlphaDeg: number, flapsDeg: number): number {
  return Math.min(TRIM_UNITS, Math.max(0, 3 + trimAlphaDeg * 0.5 + flapsDeg * 0.15));
}

/** The four fuel control switches aft of the thrust levers, RUN or CUTOFF. */
function drawFuelControl(
  context: Context,
  x: number,
  y: number,
  unit: number,
  engines: { running: boolean }[],
  palette: Palette,
) {
  text(context, 'FUEL CONTROL', x + unit * 13, y + unit * 2, unit * 2.2, palette.marking);
  text(context, 'RUN', x + unit * 13, y + unit * 7, unit * 1.8, palette.dim);
  text(context, 'CUTOFF', x + unit * 13, y + unit * 35, unit * 1.8, palette.dim);
  engines.forEach((engine, index) => {
    const cx = x + unit * (4 + index * 6);
    context.fillStyle = '#0d0e0f';
    roundRect(context, cx - unit * 0.8, y + unit * 9, unit * 1.6, unit * 24, unit * 0.8);
    context.fill();
    const handleY = y + unit * (engine.running ? 11 : 31);
    context.fillStyle = '#b8231d';
    roundRect(context, cx - unit * 2, handleY - unit * 2, unit * 4, unit * 4, unit * 0.8);
    context.fill();
    text(context, String(index + 1), cx, handleY, unit * 1.8, '#f5e8e2');
  });
}

/** The rudder trim knob and the aileron trim switches, with the stabiliser trim cutouts. */
function drawTrimControls(context: Context, x: number, y: number, unit: number, palette: Palette) {
  text(context, 'RUDDER TRIM', x + unit * 14, y + unit * 2, unit * 2.2, palette.marking);
  knob(context, x + unit * 14, y + unit * 9, unit * 3.4, 0);
  text(context, 'L', x + unit * 8.5, y + unit * 9, unit * 1.8, palette.dim);
  text(context, 'R', x + unit * 19.5, y + unit * 9, unit * 1.8, palette.dim);
  text(context, 'AILERON TRIM', x + unit * 14, y + unit * 17, unit * 2.2, palette.marking);
  for (const side of [-1, 1]) {
    context.fillStyle = '#121315';
    roundRect(
      context,
      x + unit * (14 + side * 3) - unit * 1.6,
      y + unit * 19.5,
      unit * 3.2,
      unit * 5,
      unit * 0.6,
    );
    context.fill();
    context.fillStyle = '#d8d6ce';
    context.fillRect(x + unit * (14 + side * 3) - unit * 0.5, y + unit * 20.5, unit, unit * 3);
  }
  text(context, 'STAB TRIM CUTOUT', x + unit * 14, y + unit * 30, unit * 1.9, palette.marking);
  for (const [index, label] of ['CTR', 'L', 'R'].entries()) {
    const cx = x + unit * (7 + index * 7);
    annunciator(
      context,
      cx - unit * 2.6,
      y + unit * 32.5,
      unit * 5.2,
      unit * 3.4,
      'NORM',
      false,
      palette.marking,
    );
    text(context, label, cx, y + unit * 38.5, unit * 1.6, palette.dim);
  }
}

function drawTrimIndicator(
  context: Context,
  x: number,
  y: number,
  unit: number,
  units: number,
  palette: Palette,
) {
  const top = y + unit * 4;
  const length = unit * 20;
  const at = (units: number) => top + length * (1 - units / TRIM_UNITS);
  text(context, 'STAB TRIM', x + unit * 7, y, unit * 2.2, palette.marking);
  context.fillStyle = '#0f1011';
  roundRect(context, x, top - unit * 2, unit * 14, length + unit * 4, unit);
  context.fill();
  context.fillStyle = palette.green;
  context.fillRect(
    x + unit * 5.6,
    at(TAKEOFF_BAND_UNITS.high),
    unit * 1.4,
    at(TAKEOFF_BAND_UNITS.low) - at(TAKEOFF_BAND_UNITS.high),
  );
  for (let units = 0; units <= TRIM_UNITS; units++) {
    const major = units % 5 === 0;
    context.fillStyle = palette.marking;
    context.fillRect(
      x + unit * (major ? 3.6 : 4.4),
      at(units) - unit * 0.12,
      unit * (major ? 2 : 1.2),
      unit * 0.24,
    );
    if (major) text(context, String(units), x + unit * 2.2, at(units), unit * 1.8, palette.marking);
  }
  const pointer = at(units);
  context.fillStyle = '#f2f0e8';
  context.beginPath();
  context.moveTo(x + unit * 7.4, pointer);
  context.lineTo(x + unit * 10.4, pointer - unit * 1.2);
  context.lineTo(x + unit * 10.4, pointer + unit * 1.2);
  context.closePath();
  context.fill();
  for (const [label, labelY] of [
    ['NOSE', top + unit * 0.6],
    ['UP', top + unit * 2.4],
    ['NOSE', top + length - unit * 2.4],
    ['DN', top + length - unit * 0.6],
  ] as const)
    text(context, label, x + unit * 12.3, labelY, unit * 1.4, palette.dim);
}
