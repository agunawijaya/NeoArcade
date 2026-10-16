import type { Soundscape } from '../audio/soundscape';
import type { CockpitView } from '../cockpit/actions';
import { loadTerrainSource } from '../data/unpack';
import { applyCommand } from '../engine/crew';
import { createFlight, stepFlight, type Flight, type FlightSetup } from '../engine/flight';
import { scoreLanding } from '../engine/landing-score';
import { createLessonPilot, lessonPilotInput } from '../engine/lesson-pilot';
import { startLesson, stepLesson, currentTask } from '../engine/lesson-monitor';
import { createPracticePlayer, stepPracticePlayer } from '../engine/practice-player';
import { FlightRecorder } from '../engine/recording';
import { createTerrain, type Terrain } from '../engine/terrain';
import { createTestPilot, testPilotInput } from '../engine/test-pilot';
import { ReplayDirector, type ReplayShotCamera } from '../game/replay-director';
import { FlightSession } from '../game/session';
import { lessonById } from '../lessons';
import type { Settings } from '../settings';
import { EnRouteChart } from '../ui/chart';
import { ReplayBar } from '../ui/replay-screens';
import { lessonDebrief } from '../ui/school-screen';
import { reportScreen } from '../ui/screens';

/**
 * A moment of a flight, set up for a photograph: `?lab=scene&scene=…`.
 * The scripted test pilot flies the aircraft there — the takeoff roll,
 * the breakout at minimums, a night approach, the touchdown, the glass
 * deck on the ILS — and the flight is handed to the game paused, in the
 * view the scene wants. A lesson is flown by its instructor to the moment
 * worth showing; a replay is recorded, then framed from one of its
 * cameras. The art-direction runs and the media screenshots use these.
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
  /** Set up something the picture needs once the flight is there: a CDU page, an accepted speed. */
  prepare?: (flight: Flight) => void;
}

const base: FlightSetup = { mode: 'approach', level: 'pilot', destination: 'jfk', seed: 312 };
const height = (flight: Flight) => flight.readout.altitudeFt - flight.world.ils.runway.elevationFt;
/** On the glideslope and `margin` feet out of the bottom of the destination's cloud. */
const underCeiling = (flight: Flight, margin: number) =>
  flight.afds.pitchMode === 'glideslope' &&
  height(flight) < (flight.world.weather.destination.ceilingFt ?? 2000) - margin;
const onSlopeBelow = (feet: number) => (flight: Flight) =>
  flight.afds.pitchMode === 'glideslope' && height(flight) < feet;
const acceptVref = (flight: Flight) =>
  applyCommand(flight, { kind: 'fms', edit: { op: 'acceptVref' } });

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
  approach: { setup: { ...base, sky: 'clear' }, until: onSlopeBelow(1500), view: 'main' },
  breakout: {
    setup: { ...base, destination: 'bos', sky: 'minimums' },
    until: (flight) => underCeiling(flight, 40),
    view: 'main',
  },
  night: {
    setup: { ...base, sky: 'clear', timeOfDay: 'night' },
    until: onSlopeBelow(900),
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
    until: onSlopeBelow(1400),
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
    until: onSlopeBelow(1800),
    view: 'main',
  },
  '1982': {
    setup: { ...base, mode: 'flight', level: 'rules1982' },
    until: (flight) => flight.liftoffAt !== null && flight.readout.heightFt > 900,
    view: 'main',
  },
  glass: {
    setup: { ...base, deck: 'glass', sky: 'clear' },
    until: onSlopeBelow(1500),
    view: 'main',
    prepare: acceptVref,
  },
  'glass-night': {
    setup: { ...base, deck: 'glass', destination: 'bos', sky: 'clear', timeOfDay: 'night' },
    until: onSlopeBelow(1100),
    view: 'main',
    prepare: acceptVref,
  },
  'glass-climb': {
    setup: { ...base, mode: 'flight', deck: 'glass', destination: 'buf' },
    until: (flight) => flight.readout.altitudeFt > 14_000,
    view: 'main',
  },
  'glass-pedestal': {
    setup: { ...base, mode: 'flight', deck: 'glass', destination: 'buf' },
    until: (flight) => flight.readout.altitudeFt > 9000 && !flight.atc.pending,
    view: 'pedestal',
  },
};

const REPLAY_SHOTS: Record<string, { camera: ReplayShotCamera; secondsFromTouchdown: number }> = {
  'replay-chase': { camera: 'chase', secondsFromTouchdown: -28 },
  'replay-tower': { camera: 'tower', secondsFromTouchdown: -9 },
  'replay-runway': { camera: 'runway', secondsFromTouchdown: -0.6 },
  'replay-cockpit': { camera: 'cockpit', secondsFromTouchdown: -6 },
};

/** Pictures show the jumbo as everyone first sees it: no cosmetics unless asked for (&cap=1). */
function pictureSettings(settings: Settings, params: URLSearchParams): Settings {
  return {
    ...settings,
    atcVoice: false,
    glareshieldCap: params.get('cap') === '1',
    livery: 'brightwater',
  };
}

const noHooks = {
  ended: () => {},
  pause: () => {},
  chart: () => {},
  checklist: () => {},
  event: () => {},
};

export async function startSceneLab(root: HTMLElement, settings: Settings, sound: Soundscape) {
  const params = new URLSearchParams(location.search);
  const name = params.get('scene') ?? 'approach';
  const terrain = createTerrain(await loadTerrainSource());
  const picture = pictureSettings(settings, params);
  if (name in REPLAY_SHOTS) await replayScene(root, terrain, picture, sound, name);
  else if (name === 'lesson' || name === 'debrief')
    lessonScene(root, terrain, picture, sound, name);
  else flightScene(root, terrain, picture, sound, name, params);
  setTimeout(() => (document.body.dataset.ready = 'scene'), 1500);
}

function flightScene(
  root: HTMLElement,
  terrain: Terrain,
  settings: Settings,
  sound: Soundscape,
  name: string,
  params: URLSearchParams,
) {
  const scene = SCENES[name] ?? (SCENES.approach as Scene);
  const destination = params.get('dest');
  const setup = {
    ...scene.setup,
    ...(destination ? { destination: destination as FlightSetup['destination'] } : {}),
  };
  const flight = createFlight(setup, terrain);
  const pilot = createTestPilot(flight);
  const limit = scene.limit ?? 3 * 3600;
  while (!scene.until(flight) && !flight.outcome && flight.time < limit)
    stepFlight(flight, testPilotInput(pilot));
  scene.prepare?.(flight);
  const session = new FlightSession(root, flight, terrain, settings, noHooks, sound, true);
  session.setView(scene.view);
  session.setPaused(true);
  session.start();
  if (scene.chart) {
    const chart = new EnRouteChart(flight, () => chart.element.remove());
    root.append(chart.element);
    requestAnimationFrame(() => chart.draw());
  }
  if (scene.report && flight.outcome) {
    const score = scoreLanding(flight);
    root.append(
      reportScreen(
        flight.outcome,
        { replay: () => {}, again: () => {}, brief: () => {}, title: () => {}, share: () => {} },
        { score: score.landed ? score : null, rival: null },
      ),
    );
  }
}

/** A lesson as the instructor flies it: mid-way down the glideslope, the card and the coaching on screen. */
function lessonScene(
  root: HTMLElement,
  terrain: Terrain,
  settings: Settings,
  sound: Soundscape,
  name: 'lesson' | 'debrief',
) {
  const lesson = lessonById(name === 'lesson' ? 'glideslope' : 'flare-touchdown');
  if (!lesson) return;
  const flight = createFlight({ ...lesson.setup, deck: 'classic' }, terrain);
  const run = startLesson(lesson, flight);
  const pilot = createLessonPilot(flight, run);
  let said = '';
  const over = () => run.status === 'passed' || run.status === 'failed';
  // The lesson's picture is just out of the bottom of the cloud, with the runway ahead.
  const until = () => name === 'lesson' && underCeiling(flight, 60);
  while (!over() && !until() && flight.time < 900) {
    for (const event of stepLesson(run, flight, stepFlight(flight, lessonPilotInput(pilot))))
      if (event.kind === 'say') said = event.text;
  }
  const session = new FlightSession(root, flight, terrain, settings, noHooks, sound, true);
  session.setPaused(true);
  session.start();
  if (name === 'lesson') {
    session.instructor(said);
    session.lessonPanel({
      title: `Lesson ${lesson.number} · ${lesson.title}`,
      task: currentTask(run)?.goal ?? '',
      done: run.task,
      total: lesson.tasks.length,
      note: null,
    });
    return;
  }
  root.append(
    lessonDebrief(lesson, run, false, {
      again: () => {},
      demo: () => {},
      next: () => {},
      replay: () => {},
      school: () => {},
    }),
  );
}

/** An approach flown and recorded, then framed from one camera of its replay. */
async function replayScene(
  root: HTMLElement,
  terrain: Terrain,
  settings: Settings,
  sound: Soundscape,
  name: string,
) {
  const shot =
    REPLAY_SHOTS[name] ??
    (REPLAY_SHOTS['replay-chase'] as { camera: ReplayShotCamera; secondsFromTouchdown: number });
  const flight = createFlight(
    {
      mode: 'approach',
      level: 'pilot',
      destination: 'bos',
      seed: 77,
      sky: 'low',
      timeOfDay: 'morning',
    },
    terrain,
  );
  const recorder = new FlightRecorder(flight);
  const player = createPracticePlayer(recorder);
  while (!flight.outcome && flight.time < 1500) stepPracticePlayer(player);
  const director = await ReplayDirector.prepare(
    {
      recording: recorder.recording(),
      world: flight.world,
      terrain,
      snapshots: recorder.snapshots,
      focusStep: Math.round((flight.touchdown?.at ?? flight.time) * 60),
    },
    true,
  );
  director.camera = shot.camera;
  director.seek(shot.secondsFromTouchdown);
  director.paused = true;
  const session = new FlightSession(root, flight, terrain, settings, noHooks, sound, true);
  session.start();
  const bar = new ReplayBar(director, { save: () => {}, share: () => {}, back: () => {} });
  session.playReplay(director, (shot) => bar.update(shot));
  root.append(bar.element);
}
