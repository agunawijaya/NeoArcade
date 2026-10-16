import type { Region } from '../actions';
import { annunciator, counter, knob, roundRect, text, type Context } from '../canvas-kit';
import { drawGearPanel, drawMasterLights } from '../engine-instruments';
import { drawAltimeter, drawAirspeed, drawAdi, drawClock } from '../flight-instruments';
import type { MainLayout } from '../main-panel';
import type { Palette } from '../palette';
import { drawLowerEicas, drawUpperEicas } from './eicas';
import { DisplayStamp, type DisplayColours } from './glass-kit';
import type { GlassModel, LowerPage, NdMode } from './glass-model';
import { drawNd } from './nd';
import { drawPfd } from './pfd';

/**
 * The glass deck's view ahead: the mode control panel on the glareshield
 * with an EFIS control panel either side, and below it the six screens of
 * the later jumbo — each pilot's PFD and ND, the upper EICAS in the middle
 * with the lower EICAS beneath it — the gear lever and the display select
 * panel beside them, and the standby instruments under the captain's ND.
 * Two crew, no engineer. Laid out in the same panel units as the classic
 * deck, with a compact arrangement for phones.
 */
const SCREEN = 47;
/** Panel units across: both pilots' pairs of screens, the EICAS and the gear. */
export const GLASS_WIDTH = 266;

const LOWER_PAGES: [LowerPage, string][] = [
  ['eng', 'ENG'],
  ['fuel', 'FUEL'],
  ['gear', 'GEAR'],
  ['fctl', 'FCTL'],
];

export function drawGlassMainView(
  context: Context,
  model: GlassModel,
  layout: MainLayout,
  palette: Palette,
  colours: DisplayColours,
  regions: Region[],
  blink: boolean,
) {
  const { width, height, panelTop } = layout;
  const shade = context.createLinearGradient(0, panelTop, 0, height);
  shade.addColorStop(0, palette.panelShade);
  shade.addColorStop(0.08, palette.panel);
  shade.addColorStop(1, palette.panelShade);
  context.fillStyle = shade;
  context.fillRect(0, panelTop, width, height - panelTop);
  drawGlareshield(context, model, layout, palette, regions, blink);
  if (layout.compact) {
    drawCompact(context, model, layout, palette, colours, regions, blink);
    return;
  }
  const unit = Math.min((height - panelTop) / 100, width / GLASS_WIDTH);
  const left = (width - GLASS_WIDTH * unit) / 2;
  const u = (value: number) => value * unit;
  const at = (x: number, y: number): [number, number] => [left + u(x), panelTop + u(y)];
  const display = (x: number, y: number, draw: (x: number, y: number, size: number) => void) => {
    const [px, py] = at(x, y);
    bezelFor(context, px, py, u(SCREEN), palette);
    draw(px + u(1.6), py + u(1.6), u(SCREEN - 3.2));
  };
  const stamps = stampsFor(context);
  const twice = (
    stamp: DisplayStamp,
    columns: [number, number],
    draw: (context: Context, x: number, y: number, size: number) => void,
  ) => {
    const painted = stamp.paint(context, u(SCREEN - 3.2), (into, size) => draw(into, 0, 0, size));
    for (const column of columns)
      display(column, 2, (x, y, size) =>
        painted ? stamp.stamp(context, x, y) : draw(context, x, y, size),
      );
  };

  // Three panels, as in the aircraft: the captain's, the centre and the first officer's.
  plate(context, ...at(0.5, 0.5), u(98.5), u(99), palette);
  plate(context, ...at(99.5, 0.5), u(67), u(99), palette);
  plate(context, ...at(167.5, 0.5), u(98), u(99), palette);

  // The captain's pair, outboard to inboard; the first officer's mirrors it.
  twice(stamps.pfd, [2, 217.5], (into, x, y, size) =>
    drawPfd(into, x, y, size, model.pfd, colours, blink),
  );
  twice(stamps.nd, [51, 168.5], (into, x, y, size) => drawNd(into, x, y, size, model.nd, colours));
  display(100.5, 2, (x, y, size) =>
    drawUpperEicas(context, x, y, size, model.eicas, colours, blink),
  );
  display(100.5, 51, (x, y, size) =>
    drawLowerEicas(context, x, y, size, model.eicas, model.displays.lowerPage, colours),
  );

  // The standby instruments under the captain's ND: attitude, speed, altitude.
  const flight = model.flight;
  drawAdi(context, ...at(59.5, 61), u(6.2), standbyAdi(model), palette);
  drawAirspeed(
    context,
    ...at(74.5, 61),
    u(6.2),
    {
      ias: flight.readout.iasKt,
      mach: flight.readout.mach,
      vmo: model.pfd.maxSpeed,
      bug: model.pfd.selectedSpeed,
      referenceBugs: [],
    },
    palette,
  );
  drawAltimeter(
    context,
    ...at(89.5, 61),
    u(6.2),
    { altitudeFt: model.pfd.altitude, settingInHg: model.pfd.baroInHg },
    palette,
  );
  drawClock(context, ...at(12, 61), u(6.2), model.clockSeconds, palette);
  drawClock(context, ...at(254, 61), u(6.2), model.clockSeconds, palette);

  // The gear lever right of the EICAS, with its lights, and the display select panel under it.
  const [gx, gy] = at(149, 4);
  drawGearPanel(
    context,
    gx,
    gy,
    u(17),
    u(42),
    { leverDown: flight.panel.gearDown, position: flight.readout.gear },
    palette,
  );
  regions.push({
    x: gx,
    y: gy + u(14),
    width: u(17),
    height: u(28),
    label: 'Landing gear lever',
    click: { kind: 'gear' },
  });
  drawDisplaySelect(
    context,
    ...at(149, 53),
    u(17),
    u(30),
    model.displays.lowerPage,
    palette,
    regions,
  );
}

const stamps = new WeakMap<Context, { pfd: DisplayStamp; nd: DisplayStamp }>();

function stampsFor(context: Context) {
  let pair = stamps.get(context);
  if (!pair) {
    pair = { pfd: new DisplayStamp(), nd: new DisplayStamp() };
    stamps.set(context, pair);
  }
  return pair;
}

/** A panel's face plate, so the screens sit in panels rather than float on one sheet. */
function plate(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: Palette,
) {
  context.strokeStyle = palette.panelEdge;
  context.lineWidth = Math.max(1, width * 0.004);
  roundRect(context, x, y, width, height, width * 0.012);
  context.stroke();
}

function bezelFor(context: Context, x: number, y: number, size: number, palette: Palette) {
  context.fillStyle = '#16181b';
  roundRect(context, x - size * 0.012, y - size * 0.012, size * 1.024, size * 1.024, size * 0.03);
  context.fill();
  context.strokeStyle = palette.panelEdge;
  context.lineWidth = Math.max(1, size * 0.006);
  context.stroke();
}

/** The standby horizon: the attitude only, no director. */
function standbyAdi(model: GlassModel) {
  const r = model.flight.readout;
  return {
    pitch: r.pitchDeg,
    bank: r.bankDeg,
    director: null,
    glideslopeDots: null,
    localizerDots: null,
    speedError: 0,
    slip: r.slipDeg,
    radioAltitudeFt: null,
  };
}

/** The display select panel: the lower EICAS's pages. */
function drawDisplaySelect(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  page: LowerPage,
  palette: Palette,
  regions: Region[],
) {
  context.fillStyle = palette.panelShade;
  roundRect(context, x, y, width, height, width * 0.06);
  context.fill();
  text(context, 'EICAS', x + width / 2, y + height * 0.08, height * 0.07, palette.marking);
  const rowHeight = height * 0.2;
  LOWER_PAGES.forEach(([id, name], index) => {
    const by = y + height * 0.16 + index * rowHeight;
    annunciator(
      context,
      x + width * 0.12,
      by,
      width * 0.76,
      rowHeight * 0.82,
      name,
      id === page,
      '#f5f1e3',
    );
    regions.push({
      x: x + width * 0.12,
      y: by,
      width: width * 0.76,
      height: rowHeight * 0.82,
      label: `Lower EICAS ${name}`,
      click: { kind: 'display', change: { lowerPage: id } },
    });
  });
}

/** A phone held sideways: the captain's PFD and ND large, the upper EICAS beside them. */
function drawCompact(
  context: Context,
  model: GlassModel,
  layout: MainLayout,
  palette: Palette,
  colours: DisplayColours,
  regions: Region[],
  blink: boolean,
) {
  const { width, height, panelTop } = layout;
  const size = Math.min(height - panelTop - 8, width / 3.3);
  const gap = (width - size * 3) / 4;
  const y = panelTop + (height - panelTop - size) / 2;
  const slot = (index: number) => gap + index * (size + gap);
  bezelFor(context, slot(0), y, size, palette);
  drawPfd(context, slot(0) + 2, y + 2, size - 4, model.pfd, colours, blink);
  bezelFor(context, slot(1), y, size, palette);
  drawNd(context, slot(1) + 2, y + 2, size - 4, model.nd, colours);
  bezelFor(context, slot(2), y, size, palette);
  drawUpperEicas(context, slot(2) + 2, y + 2, size - 4, model.eicas, colours, blink);
  regions.push({
    x: slot(1),
    y,
    width: size,
    height: size,
    label: 'Navigation display range',
    click: { kind: 'display', change: { ndRange: 1 } },
  });
}

/**
 * The glareshield: the mode control panel in the middle — speed, LNAV,
 * level change, heading, vertical speed, altitude, LOC and APP, the
 * autopilot and autothrottle — and an EFIS control panel at each side for
 * the navigation display's range and mode, the minimums and the altimeter.
 */
function drawGlareshield(
  context: Context,
  model: GlassModel,
  layout: MainLayout,
  palette: Palette,
  regions: Region[],
  blink: boolean,
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

  const height = (glareBottom - glareTop) * 0.7;
  const y0 = glareTop + (glareBottom - glareTop) * 0.12;
  const mcpWidth = layout.compact ? width * 0.94 : Math.min(width * 0.6, height * 15);
  const efisWidth = Math.min(width * 0.11, height * 3.2);
  const x0 = (width - mcpWidth) / 2;
  drawMcp(context, model, x0, y0, mcpWidth, height, palette, regions);
  if (!layout.compact) {
    const efisLeft = x0 - efisWidth - height * 0.25;
    drawEfisPanel(context, model, efisLeft, y0, efisWidth, height, palette, regions);
    drawEfisPanel(
      context,
      model,
      x0 + mcpWidth + height * 0.25,
      y0,
      efisWidth,
      height,
      palette,
      regions,
    );
    // The master lights sit outboard of the captain's EFIS panel; the pair is 3.4 lights wide.
    const lights = Math.min(height * 0.42, width * 0.02, (efisLeft - height * 0.3 - 4) / 3.4);
    drawMasterLights(
      context,
      efisLeft - height * 0.3 - lights * 3.4,
      y0 + height * 0.25,
      lights,
      model.masterWarning,
      model.masterCaution,
      blink,
      palette,
    );
  }
}

function drawMcp(
  context: Context,
  model: GlassModel,
  x0: number,
  y0: number,
  panelWidth: number,
  height: number,
  palette: Palette,
  regions: Region[],
) {
  const afds = model.flight.afds;
  const flight = model.flight;
  context.fillStyle = palette.panel;
  roundRect(context, x0, y0, panelWidth, height, height * 0.08);
  context.fill();
  const cell = panelWidth / 18.4;
  const lit = '#f5f1e3';
  const window = (
    column: number,
    span: number,
    label: string,
    value: string,
    knobId: Region['knob'],
  ) => {
    const cx = x0 + cell * column;
    text(
      context,
      label,
      cx + (cell * span) / 2,
      y0 + height * 0.15,
      height * 0.14,
      palette.marking,
    );
    counter(
      context,
      cx + cell * 0.1,
      y0 + height * 0.26,
      cell * span - cell * 0.2,
      height * 0.3,
      value,
      '#ffd88a',
    );
    knob(context, cx + (cell * span) / 2, y0 + height * 0.77, height * 0.16, 0);
    regions.push({ x: cx, y: y0, width: cell * span, height, label, knob: knobId });
  };
  const button = (
    column: number,
    label: string,
    on: boolean,
    press: Region['click'],
    inop = false,
  ) => {
    const cx = x0 + cell * column;
    annunciator(
      context,
      cx + cell * 0.1,
      y0 + height * 0.28,
      cell * 0.8,
      height * 0.44,
      label,
      on,
      lit,
      inop ? '#2b2c2e' : '#3a3b3d',
    );
    if (press && !inop) regions.push({ x: cx, y: y0, width: cell, height, label, click: press });
  };
  const speed = Math.round(afds.speedKt);
  button(0.1, 'F/D', afds.flightDirector, { kind: 'button', button: 'flightDirector' });
  window(1, 1.6, 'IAS', String(speed).padStart(3, '0'), 'speed');
  button(2.6, 'SPD', afds.autothrottle && afds.thrustMode === 'speed', {
    kind: 'button',
    button: 'speedHold',
  });
  button(3.6, 'A/T', afds.autothrottle, { kind: 'button', button: 'autothrottle' });
  button(4.6, 'LNAV', afds.rollMode === 'route' || afds.armedRoute, {
    kind: 'button',
    button: 'lnav',
  });
  button(5.6, 'VNAV', false, undefined, true);
  button(6.6, 'FLCH', afds.levelChange, { kind: 'button', button: 'levelChange' });
  window(
    7.6,
    1.6,
    'HDG',
    String(Math.round(flight.panel.headingBug) % 360 || 360).padStart(3, '0'),
    'heading',
  );
  button(9.2, 'HDG', afds.rollMode === 'heading', { kind: 'button', button: 'heading' });
  window(
    10.2,
    1.4,
    'V/S',
    `${afds.verticalSpeed >= 0 ? '+' : '−'}${String(Math.abs(Math.round(afds.verticalSpeed))).padStart(4, '0')}`,
    'verticalSpeed',
  );
  button(11.6, 'V/S', afds.pitchMode === 'verticalSpeed', {
    kind: 'button',
    button: 'verticalSpeed',
  });
  window(12.6, 1.6, 'ALT', String(Math.round(afds.altitude)).padStart(5, '0'), 'altitude');
  button(14.2, 'HOLD', afds.pitchMode === 'altitudeHold' || afds.pitchMode === 'altitudeCapture', {
    kind: 'button',
    button: 'altitudeHold',
  });
  button(
    15.2,
    'LOC',
    afds.rollMode === 'localizer' || (afds.armedNavigation && !afds.armedGlideslope),
    { kind: 'button', button: 'navigation' },
  );
  button(16.2, 'APP', afds.pitchMode === 'glideslope' || afds.armedGlideslope, {
    kind: 'button',
    button: 'approach',
  });
  button(17.2, 'CMD', afds.autopilot, { kind: 'button', button: 'autopilot' });
}

const NEXT_MODE: Record<NdMode, NdMode> = { app: 'vor', vor: 'map', map: 'app' };

/** One pilot's EFIS control panel: the ND's range and mode, the minimums and the altimeter. */
function drawEfisPanel(
  context: Context,
  model: GlassModel,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: Palette,
  regions: Region[],
) {
  const displays = model.displays;
  context.fillStyle = palette.panel;
  roundRect(context, x, y, width, height, height * 0.08);
  context.fill();
  const quarter = width / 4;
  const control = (index: number, title: string, value: string) => {
    const cx = x + quarter * index + quarter / 2;
    text(context, title, cx, y + height * 0.15, height * 0.13, palette.marking);
    counter(
      context,
      cx - quarter * 0.42,
      y + height * 0.27,
      quarter * 0.84,
      height * 0.26,
      value,
      '#ffd88a',
    );
    knob(context, cx, y + height * 0.76, height * 0.16, 0);
    return { x: x + quarter * index, y, width: quarter, height };
  };
  const mins = control(0, 'MINS', `${displays.minimums}`);
  regions.push({
    ...mins,
    label: 'Minimums',
    click: {
      kind: 'display',
      change: { minimums: displays.minimums >= 1000 ? 0 : displays.minimums + 50 },
    },
  });
  const mode = control(1, 'MODE', displays.ndMode.toUpperCase());
  regions.push({
    ...mode,
    label: 'ND mode',
    click: { kind: 'display', change: { ndMode: NEXT_MODE[displays.ndMode] } },
  });
  const range = control(2, 'RANGE', `${displays.ndRange}`);
  // The range knob's top half widens the map, its bottom half narrows it.
  regions.push({
    ...range,
    height: height / 2,
    label: 'ND range up',
    click: { kind: 'display', change: { ndRange: 1 } },
  });
  regions.push({
    ...range,
    y: y + height / 2,
    height: height / 2,
    label: 'ND range down',
    click: { kind: 'display', change: { ndRange: -1 } },
  });
  const baro = control(3, 'BARO', model.pfd.baroInHg.toFixed(2));
  regions.push({ ...baro, label: 'Altimeter setting', knob: 'altimeter' });
}
