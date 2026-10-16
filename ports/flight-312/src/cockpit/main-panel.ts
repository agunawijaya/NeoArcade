import type { Deck } from '../engine/flight';
import type { Region } from './actions';
import { annunciator, counter, knob, roundRect, text, type Context } from './canvas-kit';
import {
  drawEngineGauge,
  drawFlapIndicator,
  drawGearPanel,
  drawMasterLights,
  GAUGES,
} from './engine-instruments';
import {
  drawAdi,
  drawAirspeed,
  drawAltimeter,
  drawClock,
  drawHsi,
  drawMarkers,
  drawRadioAltimeter,
  drawRmi,
  drawVerticalSpeed,
} from './flight-instruments';
import type { Palette } from './palette';
import type { CockpitModel } from './view-model';

/**
 * The view ahead: the glareshield with the autopilot's mode control panel,
 * and below it the captain's flight instruments, the centre panel's engine
 * instruments, gear and flaps, and the first officer's side as far as the
 * screen reaches. Laid out in panel units (the panel is 100 units tall),
 * so it keeps its proportions from a phone to a wide monitor; narrow
 * screens get a compact arrangement of the instruments that matter most.
 */
export interface MainLayout {
  width: number;
  height: number;
  glareTop: number;
  glareBottom: number;
  panelTop: number;
  /** Pixels per panel unit. */
  unit: number;
  compact: boolean;
}

/** Panel units the captain's instruments, the centre panel and the gear need side by side. */
const CORE_WIDTH = 290;

/**
 * The glass deck sits the glareshield a little higher: its six screens need
 * the height more than the windscreen does, and they hold the picture of the
 * world the classic deck's pilots looked out for.
 */
export function mainLayout(width: number, height: number, deck: Deck = 'classic'): MainLayout {
  const compact = height < 520 || width < 900;
  const glass = deck === 'glass';
  const glareTop = height * (compact ? (glass ? 0.4 : 0.43) : glass ? 0.39 : 0.455);
  const glareBottom = height * (compact ? 0.52 : glass ? 0.49 : 0.56);
  const panelTop = glareBottom;
  const unit = compact
    ? (height - panelTop) / 100
    : Math.min((height - panelTop) / 100, width / CORE_WIDTH);
  return { width, height, glareTop, glareBottom, panelTop, unit, compact };
}

/** Where straight ahead sits in the picture, so the horizon shows over the glareshield as from the seat. */
export const mainBoresight = (layout: MainLayout) => (layout.glareTop / layout.height) * 0.74;

export function drawMainView(
  context: Context,
  model: CockpitModel,
  layout: MainLayout,
  palette: Palette,
  regions: Region[],
  blink: boolean,
  cap: boolean,
) {
  drawGlareshield(context, model, layout, palette, regions);
  if (cap) drawCap(context, layout);
  const { width, height, panelTop, unit } = layout;
  const panel = context.createLinearGradient(0, panelTop, 0, height);
  panel.addColorStop(0, palette.panelShade);
  panel.addColorStop(0.08, palette.panel);
  panel.addColorStop(1, palette.panelShade);
  context.fillStyle = panel;
  context.fillRect(0, panelTop, width, height - panelTop);
  const u = (value: number) => value * unit;
  const at = (x: number, y: number): [number, number] => [u(x), panelTop + u(y)];
  if (layout.compact) {
    drawCompactPanel(context, model, layout, palette, regions, blink, u, at);
    return;
  }

  // The captain's six, with the clock, radio altimeter and marker lights to their left.
  const flight = model.flight;
  const span = width / unit;
  drawClock(context, ...at(14, 18), u(10.5), model.clockSeconds, palette);
  drawRadioAltimeter(context, ...at(14, 50), u(11), model.radioAltitudeFt, 200, palette);
  drawMarkers(
    context,
    ...at(5, 82),
    u(5.5),
    flight.marker,
    blink || flight.marker === null,
    palette,
  );
  drawAirspeed(context, ...at(48, 27), u(18), model.airspeed, palette);
  drawAdi(context, ...at(93, 27), u(21), model.adi, palette);
  drawAltimeter(
    context,
    ...at(138, 27),
    u(18),
    { altitudeFt: model.altimeterFt, settingInHg: flight.panel.altimeterInHg },
    palette,
  );
  drawRmi(
    context,
    ...at(48, 75),
    u(17),
    { heading: model.hsi[0].heading, bearings: model.rmiBearings },
    palette,
  );
  drawHsi(context, ...at(93, 75), u(20), model.hsi[0], palette);
  drawVerticalSpeed(context, ...at(138, 75), u(17), flight.readout.verticalSpeedFpm, palette);
  knobRegion(regions, ...at(48 - 16, 27 + 16), u(5), 'speedBug', 'Airspeed bug');
  knobRegion(regions, ...at(138 - 16, 27 + 16), u(5), 'altimeter', 'Altimeter setting');
  knobRegion(regions, ...at(93 - 18, 75 + 17), u(5), 'heading', 'Heading bug');
  knobRegion(regions, ...at(93 + 18, 75 + 17), u(5), 'course1', 'Course 1');

  // The centre panel: five rows of four engine dials, then gear and flaps.
  const rows = [
    { spec: GAUGES.epr, value: (index: number) => flight.readout.engines[index]?.epr ?? 1 },
    { spec: GAUGES.n1, value: (index: number) => flight.readout.engines[index]?.n1 ?? 0 },
    { spec: GAUGES.egt, value: (index: number) => flight.readout.engines[index]?.egt ?? 0 },
    { spec: GAUGES.n2, value: (index: number) => flight.readout.engines[index]?.n2 ?? 0 },
    {
      spec: GAUGES.ff,
      value: (index: number) => (flight.readout.engines[index]?.fuelFlow ?? 0) / 1000,
    },
  ];
  rows.forEach((row, rowIndex) => {
    for (let engine = 0; engine < 4; engine++) {
      drawEngineGauge(
        context,
        ...at(183 + engine * 19, 13 + rowIndex * 18.5),
        u(8),
        row.spec,
        row.value(engine),
        palette,
        rowIndex === 0 ? model.eprReference : undefined,
      );
    }
    const [lx, ly] = at(167, 13 + rowIndex * 18.5);
    text(context, row.spec.label, lx, ly, u(3.2), palette.marking);
  });
  drawMasterLights(
    context,
    ...at(176, 1),
    u(3.6),
    model.masterWarning,
    model.masterCaution,
    blink,
    palette,
  );
  const [gx, gy] = at(252, 4);
  drawGearPanel(
    context,
    gx,
    gy,
    u(32),
    u(48),
    { leverDown: flight.panel.gearDown, position: flight.readout.gear },
    palette,
  );
  regions.push({
    x: gx,
    y: gy + u(18),
    width: u(32),
    height: u(30),
    label: 'Landing gear lever',
    click: { kind: 'gear' },
  });
  drawFlapIndicator(
    context,
    ...at(268, 77),
    u(13.5),
    flight.readout.flapsDeg,
    model.flapLeverDeg,
    palette,
  );

  // The first officer's side, reading NAV 2, as far as the screen reaches.
  const fo = 292;
  if (span > fo + 10) {
    drawAirspeed(context, ...at(fo + 19, 27), u(18), model.airspeed, palette);
    drawAdi(context, ...at(fo + 64, 27), u(21), model.adi, palette);
    drawAltimeter(
      context,
      ...at(fo + 109, 27),
      u(18),
      { altitudeFt: model.altimeterFt, settingInHg: flight.panel.altimeterInHg },
      palette,
    );
    drawHsi(context, ...at(fo + 64, 75), u(20), model.hsi[1], palette);
    drawVerticalSpeed(
      context,
      ...at(fo + 109, 75),
      u(17),
      flight.readout.verticalSpeedFpm,
      palette,
    );
    knobRegion(regions, ...at(fo + 64 + 18, 75 + 17), u(5), 'course2', 'Course 2');
  }
}

function knobRegion(
  regions: Region[],
  cx: number,
  cy: number,
  radius: number,
  knobId: Region['knob'],
  label: string,
) {
  regions.push({
    x: cx - radius * 1.6,
    y: cy - radius * 1.6,
    width: radius * 3.2,
    height: radius * 3.2,
    label,
    knob: knobId,
  });
}

/** A phone held sideways: the instruments that fly the aircraft, larger, and the engines as one row. */
function drawCompactPanel(
  context: Context,
  model: CockpitModel,
  layout: MainLayout,
  palette: Palette,
  regions: Region[],
  blink: boolean,
  u: (value: number) => number,
  at: (x: number, y: number) => [number, number],
) {
  const flight = model.flight;
  const span = layout.width / layout.unit;
  const centre = span / 2;
  drawAirspeed(context, ...at(centre - 118, 50), u(30), model.airspeed, palette);
  drawAdi(context, ...at(centre - 44, 50), u(36), model.adi, palette);
  drawHsi(context, ...at(centre + 38, 52), u(33), model.hsi[0], palette);
  drawAltimeter(
    context,
    ...at(centre + 112, 50),
    u(30),
    { altitudeFt: model.altimeterFt, settingInHg: flight.panel.altimeterInHg },
    palette,
  );
  if (span > 300) {
    for (let engine = 0; engine < 4; engine++) {
      drawEngineGauge(
        context,
        ...at(centre + 170 + (engine % 2) * 26, 26 + Math.floor(engine / 2) * 48),
        u(11),
        GAUGES.n1,
        flight.readout.engines[engine]?.n1 ?? 0,
        palette,
      );
    }
  }
  drawMarkers(
    context,
    ...at(centre - 190, 20),
    u(8),
    flight.marker,
    blink || flight.marker === null,
    palette,
  );
  drawFlapIndicator(
    context,
    ...at(centre - 172, 66),
    u(17),
    flight.readout.flapsDeg,
    model.flapLeverDeg,
    palette,
  );
  knobRegion(regions, ...at(centre + 38 - 28, 52 + 26), u(7), 'heading', 'Heading bug');
}

/** The glareshield and the autopilot and flight director's mode control panel on it. */
/** A captain's cap left on the glareshield, left of the autopilot panel: crown, visor, braid and badge. */
function drawCap(context: Context, layout: MainLayout) {
  const { width, glareTop, glareBottom } = layout;
  const size = (glareBottom - glareTop) * 0.55;
  const cx = width * 0.12;
  const base = glareBottom - (glareBottom - glareTop) * 0.22;
  context.fillStyle = '#0c0d0f';
  context.beginPath();
  context.ellipse(cx + size * 0.35, base, size * 0.95, size * 0.16, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#1a2340';
  context.beginPath();
  context.moveTo(cx - size * 0.9, base - size * 0.08);
  context.quadraticCurveTo(cx - size * 1.05, base - size * 0.78, cx, base - size * 0.82);
  context.quadraticCurveTo(
    cx + size * 1.05,
    base - size * 0.78,
    cx + size * 0.9,
    base - size * 0.08,
  );
  context.closePath();
  context.fill();
  context.fillStyle = '#c99a2e';
  context.fillRect(cx - size * 0.88, base - size * 0.24, size * 1.76, size * 0.12);
  context.beginPath();
  context.arc(cx, base - size * 0.45, size * 0.13, 0, Math.PI * 2);
  context.fill();
}

function drawGlareshield(
  context: Context,
  model: CockpitModel,
  layout: MainLayout,
  palette: Palette,
  regions: Region[],
) {
  const { width, glareTop, glareBottom } = layout;
  const shade = context.createLinearGradient(0, glareTop, 0, glareBottom);
  shade.addColorStop(0, '#2a2b2e');
  shade.addColorStop(0.15, palette.glareshield);
  shade.addColorStop(1, '#070708');
  context.fillStyle = shade;
  context.beginPath();
  context.moveTo(0, glareTop + (glareBottom - glareTop) * 0.25);
  context.quadraticCurveTo(
    width / 2,
    glareTop - (glareBottom - glareTop) * 0.25,
    width,
    glareTop + (glareBottom - glareTop) * 0.25,
  );
  context.lineTo(width, glareBottom);
  context.lineTo(0, glareBottom);
  context.closePath();
  context.fill();

  const height = (glareBottom - glareTop) * 0.74;
  const panelWidth = Math.min(width * 0.7, height * 13.5);
  const x0 = (width - panelWidth) / 2;
  const y0 = glareBottom - height - (glareBottom - glareTop) * 0.12;
  context.fillStyle = palette.panel;
  roundRect(context, x0, y0, panelWidth, height, height * 0.08);
  context.fill();
  const flight = model.flight;
  const afds = flight.afds;
  const available = model.autopilotAvailable;
  const cell = panelWidth / 15;
  const lit = available ? '#f5f1e3' : '#2a2b2d';
  const armed = '#ffbf3a';
  const readout = (column: number, label: string, value: string, knobId: Region['knob']) => {
    const cx = x0 + cell * column;
    text(context, label, cx + cell * 0.5, y0 + height * 0.16, height * 0.16, palette.marking);
    counter(
      context,
      cx + cell * 0.08,
      y0 + height * 0.28,
      cell * 0.84,
      height * 0.3,
      available ? value : '',
      '#ffd88a',
    );
    knob(context, cx + cell * 0.5, y0 + height * 0.78, height * 0.16, 0);
    if (available) regions.push({ x: cx, y: y0, width: cell, height, label, knob: knobId });
  };
  const button = (
    column: number,
    label: string,
    on: boolean,
    isArmed: boolean,
    press: Region['click'],
  ) => {
    const cx = x0 + cell * column;
    annunciator(
      context,
      cx + cell * 0.08,
      y0 + height * 0.25,
      cell * 0.84,
      height * 0.5,
      label,
      available && (on || isArmed),
      on ? lit : armed,
    );
    if (available && press)
      regions.push({ x: cx, y: y0, width: cell, height, label, click: press });
  };
  const course = (nav: number) =>
    String(Math.round(flight.panel.nav[nav]?.course ?? 0) % 360 || 360).padStart(3, '0');
  readout(0, 'CRS 1', course(0), 'course1');
  button(1, 'A/T', afds.autothrottle, false, { kind: 'button', button: 'autothrottle' });
  readout(2, 'IAS', String(Math.round(afds.speedKt)).padStart(3, '0'), 'speed');
  button(3, 'IAS', afds.pitchMode === 'speed', false, { kind: 'button', button: 'speed' });
  readout(
    4,
    'HDG',
    String(Math.round(flight.panel.headingBug) % 360 || 360).padStart(3, '0'),
    'heading',
  );
  button(5, 'HDG', afds.rollMode === 'heading', false, { kind: 'button', button: 'heading' });
  button(
    6,
    'VOR LOC',
    afds.rollMode === 'navigation' || afds.rollMode === 'localizer',
    afds.armedNavigation && !afds.armedGlideslope,
    { kind: 'button', button: 'navigation' },
  );
  button(7, 'ILS', afds.pitchMode === 'glideslope', afds.armedGlideslope, {
    kind: 'button',
    button: 'approach',
  });
  readout(8, 'ALT', String(Math.round(afds.altitude)).padStart(5, '0'), 'altitude');
  button(
    9,
    'ALT HLD',
    afds.pitchMode === 'altitudeHold' || afds.pitchMode === 'altitudeCapture',
    false,
    { kind: 'button', button: 'altitudeHold' },
  );
  readout(
    10,
    'V/S',
    `${afds.verticalSpeed >= 0 ? '+' : '−'}${String(Math.abs(Math.round(afds.verticalSpeed))).padStart(4, '0')}`,
    'verticalSpeed',
  );
  button(11, 'V/S', afds.pitchMode === 'verticalSpeed', false, {
    kind: 'button',
    button: 'verticalSpeed',
  });
  button(12, 'A/P CMD', afds.autopilot, false, { kind: 'button', button: 'autopilot' });
  button(13, 'F/D', afds.flightDirector, false, { kind: 'button', button: 'flightDirector' });
  readout(14, 'CRS 2', course(1), 'course2');
  if (!available) {
    // An INOP placard taped across the panel, as a crew would find a dead autopilot.
    const placardWidth = panelWidth * 0.42;
    const placardX = x0 + (panelWidth - placardWidth) / 2;
    context.fillStyle = '#1b1912';
    roundRect(context, placardX, y0 + height * 0.3, placardWidth, height * 0.4, height * 0.05);
    context.fill();
    context.strokeStyle = palette.caution;
    context.lineWidth = Math.max(1, height * 0.03);
    context.stroke();
    text(
      context,
      'AUTOPILOT INOP — 1982 RULES',
      x0 + panelWidth / 2,
      y0 + height * 0.5,
      height * 0.2,
      palette.caution,
    );
  }
}
