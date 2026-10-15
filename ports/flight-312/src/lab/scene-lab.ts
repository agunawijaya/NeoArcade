import type { Soundscape } from '../audio/soundscape';
import type { CockpitView } from '../cockpit/actions';
import { loadTerrainSource } from '../data/unpack';
import { createFlight, stepFlight, type Flight, type FlightSetup } from '../engine/flight';
import { createTerrain } from '../engine/terrain';
import { createTestPilot, testPilotInput } from '../engine/test-pilot';
import { FlightSession } from '../game/session';
import type { Settings } from '../settings';
import { EnRouteChart } from '../ui/chart';
import { reportScreen } from '../ui/screens';

/**
 * A moment of a flight, set up for a photograph: `?lab=scene&scene=…`.
 * The scripted test pilot flies the aircraft there — the takeoff roll,
 * the breakout at minimums, a night approach, the touchdown — and the
 * flight is handed to the game paused, in the view the scene wants. The
 * art-direction runs and the media screenshots use these.
 */
interface Scene {
  setup: FlightSetup;
  /** Fly on until this is true. */
  until: (flight: Flight) => boolean;
  view: CockpitView;
  chart?: boolean;
  report?: boolean;
  /** Seconds of the flight at most, so a scene that never comes still ends. */
  limit?: number;
}

const base: FlightSetup = { mode: 'approach', level: 'pilot', destination: 'jfk', seed: 312 };
const height = (flight: Flight) => flight.readout.altitudeFt - flight.world.ils.runway.elevationFt;
/** On the glideslope and `margin` feet out of the bottom of the destination's cloud. */
const underCeiling = (flight: Flight, margin: number) =>
  flight.afds.pitchMode === 'glideslope' &&
  height(flight) < (flight.world.weather.destination.ceilingFt ?? 2000) - margin;

const SCENES: Record<string, Scene> = {
  takeoff: {
    setup: { ...base, mode: 'flight', level: 'arcade' },
    until: (flight) => flight.atc.cleared.takeoff && flight.time > 66,
    view: 'main',
  },
  roll: {
    setup: { ...base, mode: 'flight', level: 'arcade' },
    until: (flight) => flight.readout.iasKt > 110,
    view: 'main',
  },
  climb: {
    setup: { ...base, mode: 'flight', level: 'pilot', destination: 'bos' },
    until: (flight) => flight.liftoffAt !== null && flight.readout.heightFt > 2500,
    view: 'main',
  },
  cruise: {
    setup: { ...base, mode: 'flight', level: 'pilot', destination: 'ssm' },
    until: (flight) => flight.readout.altitudeFt > 34_000 && flight.time > 1500,
    view: 'main',
  },
  approach: {
    setup: { ...base, sky: 'clear' },
    until: (flight) => flight.afds.pitchMode === 'glideslope' && height(flight) < 1500,
    view: 'main',
  },
  breakout: {
    setup: { ...base, destination: 'bos', sky: 'minimums' },
    until: (flight) => underCeiling(flight, 40),
    view: 'main',
  },
  night: {
    setup: { ...base, sky: 'clear', timeOfDay: 'night' },
    until: (flight) => flight.afds.pitchMode === 'glideslope' && height(flight) < 900,
    view: 'main',
  },
  dusk: {
    setup: { ...base, destination: 'buf', sky: 'low', timeOfDay: 'dusk' },
    until: (flight) => underCeiling(flight, 200),
    view: 'main',
  },
  touchdown: {
    setup: { ...base, destination: 'phl', sky: 'clear' },
    until: (flight) => flight.approach.active && height(flight) < 25,
    view: 'main',
  },
  outside: {
    setup: { ...base, destination: 'psb', sky: 'clear' },
    until: (flight) => flight.afds.pitchMode === 'glideslope' && height(flight) < 1400,
    view: 'outside',
  },
  pedestal: {
    setup: { ...base, sky: 'low' },
    until: (flight) => flight.time > 40,
    view: 'pedestal',
  },
  overhead: {
    setup: { ...base, sky: 'low' },
    until: (flight) => flight.time > 40,
    view: 'overhead',
  },
  engineer: {
    setup: { ...base, mode: 'flight', destination: 'bos' },
    until: (flight) => flight.time > 900,
    view: 'engineer',
  },
  chart: {
    setup: { ...base, mode: 'flight', destination: 'buf' },
    until: (flight) => flight.time > 1500,
    view: 'main',
    chart: true,
  },
  report: {
    setup: { ...base, destination: 'bos', sky: 'minimums' },
    until: (flight) => flight.outcome !== null,
    view: 'main',
    report: true,
    limit: 1500,
  },
  glidepath: {
    setup: { ...base, level: 'arcade', destination: 'bos', sky: 'clear' },
    until: (flight) => flight.afds.pitchMode === 'glideslope' && height(flight) < 1800,
    view: 'main',
  },
  '1982': {
    setup: { ...base, mode: 'flight', level: 'rules1982' },
    until: (flight) => flight.liftoffAt !== null && flight.readout.heightFt > 900,
    view: 'main',
  },
};

export async function startSceneLab(root: HTMLElement, settings: Settings, sound: Soundscape) {
  const params = new URLSearchParams(location.search);
  const scene = SCENES[params.get('scene') ?? 'approach'] ?? (SCENES.approach as Scene);
  const destination = params.get('dest');
  const setup = {
    ...scene.setup,
    ...(destination ? { destination: destination as FlightSetup['destination'] } : {}),
  };
  const terrain = createTerrain(await loadTerrainSource());
  const flight = createFlight(setup, terrain);
  const pilot = createTestPilot(flight);
  const limit = scene.limit ?? 3 * 3600;
  while (!scene.until(flight) && !flight.outcome && flight.time < limit)
    stepFlight(flight, testPilotInput(pilot));
  const session = new FlightSession(
    root,
    flight,
    terrain,
    // Pictures show the jumbo as everyone first sees it: no cosmetics unless asked for (&cap=1).
    {
      ...settings,
      atcVoice: false,
      glareshieldCap: params.get('cap') === '1',
      livery: 'brightwater',
    },
    { ended: () => {}, pause: () => {}, chart: () => {}, checklist: () => {}, event: () => {} },
    sound,
    true,
  );
  session.setView(scene.view);
  session.setPaused(true);
  session.start();
  if (scene.chart) {
    const chart = new EnRouteChart(flight, () => chart.element.remove());
    root.append(chart.element);
    requestAnimationFrame(() => chart.draw());
  }
  if (scene.report && flight.outcome) {
    root.append(
      reportScreen(flight.outcome, {
        replay: () => {},
        again: () => {},
        brief: () => {},
        title: () => {},
      }),
    );
  }
  setTimeout(() => (document.body.dataset.ready = 'scene'), 1500);
}
