import type { Context } from '../cockpit/canvas-kit';
import {
  drawEngineGauge,
  drawFlapIndicator,
  drawGearPanel,
  GAUGES,
} from '../cockpit/engine-instruments';
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
  type AdiData,
  type HsiData,
} from '../cockpit/flight-instruments';
import { PALETTES, type Palette } from '../cockpit/palette';
import { h } from '../ui/dom';

/**
 * Every instrument at the values that test it — the ADI banked 30° each
 * way and pitched up and down, the altimeter at 10,000 ft, the IVSI at
 * the ends of its scale, the radio altimeter at decision height and off —
 * by day and by night: `?lab=instruments`. The art-direction runs
 * photograph this page.
 */
interface Card {
  title: string;
  draw(context: Context, size: number, palette: Palette): void;
}

const level: AdiData = {
  pitch: 0,
  bank: 0,
  director: null,
  glideslopeDots: null,
  localizerDots: null,
  speedError: 0,
  slip: 0,
  radioAltitudeFt: null,
};
const hsi: HsiData = {
  heading: 76,
  headingBug: 88,
  course: 76,
  deviationDots: 0,
  toFrom: 'to',
  glideslopeDots: null,
  dmeNm: 12.4,
  track: 74,
};

const CARDS: Card[] = [
  { title: 'ADI · level', draw: (c, s, p) => drawAdi(c, s / 2, s / 2, s * 0.36, level, p) },
  {
    title: 'ADI · 30° left, 10° up, FD',
    draw: (c, s, p) =>
      drawAdi(
        c,
        s / 2,
        s / 2,
        s * 0.36,
        { ...level, bank: -30, pitch: 10, director: { pitch: 12, bank: -20 } },
        p,
      ),
  },
  {
    title: 'ADI · 30° right, 5° down',
    draw: (c, s, p) => drawAdi(c, s / 2, s / 2, s * 0.36, { ...level, bank: 30, pitch: -5 }, p),
  },
  {
    title: 'ADI · ILS, 1 dot low, 120 ft',
    draw: (c, s, p) =>
      drawAdi(
        c,
        s / 2,
        s / 2,
        s * 0.36,
        {
          ...level,
          pitch: 2.5,
          glideslopeDots: -1,
          localizerDots: 0.5,
          radioAltitudeFt: 120,
          speedError: 6,
          director: { pitch: 3, bank: 2 },
        },
        p,
      ),
  },
  {
    title: 'HSI · on course to the station',
    draw: (c, s, p) => drawHsi(c, s / 2, s / 2, s * 0.38, hsi, p),
  },
  {
    title: 'HSI · 2 dots right, ILS',
    draw: (c, s, p) =>
      drawHsi(
        c,
        s / 2,
        s / 2,
        s * 0.38,
        {
          ...hsi,
          heading: 30,
          course: 44,
          deviationDots: 2,
          glideslopeDots: 0.5,
          toFrom: 'off',
          dmeNm: null,
        },
        p,
      ),
  },
  {
    title: 'HSI · NAV flag',
    draw: (c, s, p) => drawHsi(c, s / 2, s / 2, s * 0.38, { ...hsi, deviationDots: null }, p),
  },
  {
    title: 'Airspeed · 160 kt, bugs',
    draw: (c, s, p) =>
      drawAirspeed(
        c,
        s / 2,
        s / 2,
        s * 0.38,
        { ias: 160, mach: 0.25, vmo: 365, bug: 145, referenceBugs: [148, 155, 165] },
        p,
      ),
  },
  {
    title: 'Airspeed · M .84 at FL350',
    draw: (c, s, p) =>
      drawAirspeed(
        c,
        s / 2,
        s / 2,
        s * 0.38,
        { ias: 282, mach: 0.84, vmo: 300, bug: 280, referenceBugs: [] },
        p,
      ),
  },
  {
    title: 'Altimeter · 10,000 ft',
    draw: (c, s, p) =>
      drawAltimeter(c, s / 2, s / 2, s * 0.38, { altitudeFt: 10_000, settingInHg: 29.92 }, p),
  },
  {
    title: 'Altimeter · 2,350 ft, 30.12',
    draw: (c, s, p) =>
      drawAltimeter(c, s / 2, s / 2, s * 0.38, { altitudeFt: 2350, settingInHg: 30.12 }, p),
  },
  {
    title: 'IVSI · −700 fpm',
    draw: (c, s, p) => drawVerticalSpeed(c, s / 2, s / 2, s * 0.38, -700, p),
  },
  {
    title: 'IVSI · +2,500 fpm',
    draw: (c, s, p) => drawVerticalSpeed(c, s / 2, s / 2, s * 0.38, 2500, p),
  },
  {
    title: 'RMI · two stations',
    draw: (c, s, p) => drawRmi(c, s / 2, s / 2, s * 0.36, { heading: 76, bearings: [40, 130] }, p),
  },
  {
    title: 'Radio altimeter · 200 ft (DH)',
    draw: (c, s, p) => drawRadioAltimeter(c, s / 2, s / 2, s * 0.38, 190, 200, p),
  },
  {
    title: 'Radio altimeter · off scale',
    draw: (c, s, p) => drawRadioAltimeter(c, s / 2, s / 2, s * 0.38, null, 200, p),
  },
  {
    title: 'Clock · 08:00:15',
    draw: (c, s, p) => drawClock(c, s / 2, s / 2, s * 0.38, 8 * 3600 + 15, p),
  },
  {
    title: 'Markers · outer lit',
    draw: (c, s, p) => drawMarkers(c, s * 0.3, s / 2, s * 0.16, 'outer', true, p),
  },
  {
    title: 'N1 · takeoff thrust',
    draw: (c, s, p) => drawEngineGauge(c, s / 2, s / 2, s * 0.38, GAUGES.n1, 98.5, p),
  },
  {
    title: 'EPR · reference bug',
    draw: (c, s, p) => drawEngineGauge(c, s / 2, s / 2, s * 0.38, GAUGES.epr, 1.47, p, 1.52),
  },
  {
    title: 'EGT · idle',
    draw: (c, s, p) => drawEngineGauge(c, s / 2, s / 2, s * 0.38, GAUGES.egt, 420, p),
  },
  {
    title: 'Gear · in transit',
    draw: (c, s, p) =>
      drawGearPanel(c, s * 0.25, s * 0.1, s * 0.5, s * 0.8, { leverDown: true, position: 0.5 }, p),
  },
  {
    title: 'Gear · down and locked',
    draw: (c, s, p) =>
      drawGearPanel(c, s * 0.25, s * 0.1, s * 0.5, s * 0.8, { leverDown: true, position: 1 }, p),
  },
  {
    title: 'Flaps · 25 going to 30',
    draw: (c, s, p) => drawFlapIndicator(c, s / 2, s / 2, s * 0.38, 26, 30, p),
  },
];

export function startInstrumentLab(root: HTMLElement) {
  const size = 260;
  const grid = h('div', { class: 'instrument-lab' });
  for (const lighting of ['day', 'night'] as const) {
    grid.append(h('h2', { class: 'lab-heading' }, lighting === 'day' ? 'Day' : 'Night'));
    for (const card of CARDS) {
      const canvas = h('canvas', {
        width: size * 2,
        height: size * 2,
        style: `width:${size}px;height:${size}px`,
      });
      const context = canvas.getContext('2d');
      if (context) {
        const palette = PALETTES[lighting];
        context.scale(2, 2);
        context.fillStyle = palette.panel;
        context.fillRect(0, 0, size, size);
        card.draw(context, size, palette);
      }
      grid.append(h('figure', { class: 'lab-card' }, canvas, h('figcaption', {}, card.title)));
    }
  }
  root.replaceChildren(grid);
  document.body.setAttribute('data-ready', 'instruments');
}
