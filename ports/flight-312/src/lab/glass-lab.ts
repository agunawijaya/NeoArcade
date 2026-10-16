import { loadTerrainSource } from '../data/unpack';
import { applyCommand } from '../engine/crew';
import { createFlight, stepFlight, type Flight, type FlightSetup } from '../engine/flight';
import { createTerrain } from '../engine/terrain';
import { createTestPilot, testPilotInput } from '../engine/test-pilot';
import { Cdu } from '../cockpit/glass/cdu';
import { drawLowerEicas, drawUpperEicas } from '../cockpit/glass/eicas';
import { displayColours } from '../cockpit/glass/glass-kit';
import {
  defaultDisplays,
  glassModel,
  type GlassDisplays,
  type LowerPage,
  type NdMode,
} from '../cockpit/glass/glass-model';
import { drawNd } from '../cockpit/glass/nd';
import { drawPfd } from '../cockpit/glass/pfd';
import { PALETTES, type Lighting } from '../cockpit/palette';
import type { CduKey, Region } from '../cockpit/actions';
import { h } from '../ui/dom';

/**
 * `?lab=glass`: each of the glass deck's displays at a moment of a real
 * flight, flown there by the test pilot — the takeoff roll, the climb on
 * LNAV, the cruise, the ILS, the last hundred feet — and each CDU page.
 * `scene=`, `show=pfd,nd,upper,lower,cdu`, `size=` and `light=night`
 * choose what is drawn; the art-direction runs photograph it.
 */
interface Scene {
  setup: FlightSetup;
  until: (flight: Flight) => boolean;
  prepare?: (flight: Flight) => void;
}

const base: FlightSetup = {
  mode: 'flight',
  level: 'pilot',
  destination: 'bos',
  seed: 312,
  deck: 'glass',
};
const height = (flight: Flight) => flight.readout.altitudeFt - flight.world.ils.runway.elevationFt;

const SCENES: Record<string, Scene> = {
  takeoff: {
    setup: base,
    prepare: (flight) => applyCommand(flight, { kind: 'fms', edit: { op: 'acceptTakeoffSpeeds' } }),
    until: (flight) => flight.readout.iasKt > 95,
  },
  climb: { setup: base, until: (flight) => flight.readout.altitudeFt > 6500 },
  cruise: {
    setup: { ...base, destination: 'ssm' },
    until: (flight) => flight.readout.altitudeFt > 34_500 && flight.time > 1500,
  },
  approach: {
    setup: { ...base, mode: 'approach', destination: 'jfk', sky: 'low' },
    prepare: (flight) => applyCommand(flight, { kind: 'fms', edit: { op: 'acceptVref' } }),
    until: (flight) => flight.afds.pitchMode === 'glideslope' && height(flight) < 1400,
  },
  final: {
    setup: { ...base, mode: 'approach', destination: 'jfk', sky: 'minimums' },
    prepare: (flight) => applyCommand(flight, { kind: 'fms', edit: { op: 'acceptVref' } }),
    until: (flight) => height(flight) < 180,
  },
  pending: {
    setup: base,
    until: (flight) => flight.readout.altitudeFt > 9000,
    prepare: (flight) =>
      applyCommand(flight, { kind: 'fms', edit: { op: 'insert', index: 1, station: 4 } }),
  },
};

const CDU_PAGES: CduKey[] = [
  { page: 'RTE' },
  { page: 'LEGS' },
  { page: 'DEP ARR' },
  { page: 'INIT REF' },
  { page: 'PROG' },
  { page: 'NAV RAD' },
];

export async function startGlassLab(root: HTMLElement) {
  const params = new URLSearchParams(location.search);
  const scene = SCENES[params.get('scene') ?? 'approach'] ?? (SCENES.approach as Scene);
  const show = (params.get('show') ?? 'pfd,nd,upper,lower,cdu').split(',');
  const size = Number(params.get('size') ?? 420);
  const lighting = (params.get('light') ?? 'day') as Lighting;
  const terrain = createTerrain(await loadTerrainSource());
  const flight = createFlight(scene.setup, terrain);
  scene.prepare?.(flight);
  const pilot = createTestPilot(flight);
  while (!scene.until(flight) && !flight.outcome && flight.time < 3 * 3600)
    stepFlight(flight, testPilotInput(pilot));
  scene.prepare?.(flight);

  const colours = displayColours(lighting);
  const grid = h('div', { class: 'instrument-lab glass-lab' });
  root.append(grid);
  const card = (
    title: string,
    width: number,
    heightPx: number,
    draw: (context: CanvasRenderingContext2D) => void,
  ) => {
    const canvas = h('canvas', {
      width: width * devicePixelRatio,
      height: heightPx * devicePixelRatio,
    });
    canvas.style.width = `${width}px`;
    canvas.style.height = `${heightPx}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(devicePixelRatio, devicePixelRatio);
    context.fillStyle = PALETTES[lighting].panel;
    context.fillRect(0, 0, width, heightPx);
    draw(context);
    grid.append(h('figure', { class: 'lab-card' }, canvas, h('figcaption', {}, title)));
  };
  const model = (over: Partial<GlassDisplays> = {}) =>
    glassModel(flight, { ...defaultDisplays(), ...over });
  const pad = size * 0.04;
  if (show.includes('pfd'))
    card('PFD', size, size, (context) =>
      drawPfd(context, pad, pad, size - 2 * pad, model().pfd, colours, true),
    );
  if (show.includes('nd')) {
    const modes: [NdMode, GlassDisplays['ndRange']][] = [
      ['map', 40],
      ['map', 160],
      ['vor', 40],
      ['app', 20],
    ];
    for (const [mode, range] of modes)
      card(`ND ${mode.toUpperCase()} ${range}`, size, size, (context) =>
        drawNd(
          context,
          pad,
          pad,
          size - 2 * pad,
          model({ ndMode: mode, ndRange: range }).nd,
          colours,
        ),
      );
  }
  if (show.includes('upper'))
    card('Upper EICAS', size, size, (context) =>
      drawUpperEicas(context, pad, pad, size - 2 * pad, model().eicas, colours, true),
    );
  if (show.includes('lower'))
    for (const page of ['eng', 'fuel', 'gear', 'fctl'] as LowerPage[])
      card(`Lower EICAS ${page.toUpperCase()}`, size, size, (context) =>
        drawLowerEicas(context, pad, pad, size - 2 * pad, model().eicas, page, colours),
      );
  if (show.includes('cdu'))
    for (const page of CDU_PAGES) {
      const cdu = new Cdu();
      cdu.press(page, flight);
      const regions: Region[] = [];
      card(`CDU ${'page' in page ? page.page : ''}`, size * 0.78, size * 1.25, (context) =>
        cdu.draw(
          context,
          pad,
          pad,
          size * 0.78 - 2 * pad,
          size * 1.25 - 2 * pad,
          flight,
          colours,
          PALETTES[lighting],
          regions,
        ),
      );
    }
  document.body.dataset.ready = 'glass';
}
