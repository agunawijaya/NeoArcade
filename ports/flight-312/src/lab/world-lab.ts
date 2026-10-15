import { loadTerrainSource } from '../data/unpack';
import { createFlight, type Level } from '../engine/flight';
import { destinationById, type DestinationId } from '../engine/navdata';
import { ilsFor } from '../engine/radios';
import { runwayPoint } from '../engine/runways';
import { createTerrain } from '../engine/terrain';
import type { DestinationSky } from '../engine/weather';
import { WorldView, type AircraftPose, type ViewPoint } from '../world/world-view';

/**
 * The world behind a debug camera: `?lab=world&scene=…` puts the jumbo (or a
 * free eye) at a set place and hour, so the terrain, airports, lights and
 * weather can be looked at, and photographed by the art-direction runs,
 * without flying there.
 *
 *   scene    runway | final | breakout | cruise | ridges | chase | night-final
 *   dest     jfk | bos | ssm | psb | buf | phl
 *   clock    local time, hh:mm
 *   sky      clear | low | minimums | fog
 */
interface LabScene {
  pose: (dest: DestinationId) => AircraftPose;
  view: ViewPoint;
  clock: string;
  sky: DestinationSky;
}

const FEET_PER_NM = 6076.115;

function onFinal(dest: DestinationId, miles: number, heightFt: number): AircraftPose {
  const strip = ilsFor(destinationById(dest), 'real').runway;
  return {
    position: runwayPoint(strip, -miles * FEET_PER_NM, 0),
    altitudeFt: strip.elevationFt + heightFt,
    headingTrue: strip.headingTrue,
    pitchDeg: 2.5,
    bankDeg: 0,
    gear: 1,
  };
}

const cockpit: ViewPoint = { kind: 'cockpit', headYawDeg: 0, headPitchDeg: 0 };

const SCENES: Record<string, LabScene> = {
  runway: {
    pose: () => {
      const strip = ilsFor(destinationById('phl'), 'real').runway;
      return {
        position: strip.start,
        altitudeFt: strip.elevationFt,
        headingTrue: strip.headingTrue,
        pitchDeg: 0,
        bankDeg: 0,
        gear: 1,
      };
    },
    view: cockpit,
    clock: '08:00',
    sky: 'low',
  },
  final: { pose: (dest) => onFinal(dest, 3, 950), view: cockpit, clock: '10:30', sky: 'clear' },
  breakout: {
    pose: (dest) => onFinal(dest, 1.1, 340),
    view: cockpit,
    clock: '09:10',
    sky: 'minimums',
  },
  'night-final': {
    pose: (dest) => onFinal(dest, 2.5, 800),
    view: cockpit,
    clock: '20:40',
    sky: 'clear',
  },
  cruise: {
    pose: () => ({
      position: { lat: 40.9, lon: -76.4 },
      altitudeFt: 35_000,
      headingTrue: 300,
      pitchDeg: 2.4,
      bankDeg: 0,
      gear: 0,
    }),
    view: cockpit,
    clock: '08:40',
    sky: 'clear',
  },
  ridges: {
    pose: () => ({
      position: { lat: 40.6, lon: -77.6 },
      altitudeFt: 6500,
      headingTrue: 40,
      pitchDeg: 1,
      bankDeg: 12,
      gear: 0,
    }),
    view: cockpit,
    clock: '08:20',
    sky: 'clear',
  },
  overhead: {
    pose: (dest) => onFinal(dest, 2, 600),
    view: {
      kind: 'free',
      position: { lat: 39.855, lon: -75.3 },
      altitudeFt: 1200,
      headingDeg: 76,
      pitchDeg: -30,
    },
    clock: '12:00',
    sky: 'clear',
  },
  chase: {
    pose: (dest) => onFinal(dest, 1.5, 480),
    view: { kind: 'chase', distanceM: 95, heightM: 18, orbitDeg: 25 },
    clock: '11:00',
    sky: 'clear',
  },
};

export async function startWorldLab(root: HTMLElement) {
  const params = new URLSearchParams(location.search);
  const scene = SCENES[params.get('scene') ?? 'final'] ?? (SCENES.final as LabScene);
  const dest = (params.get('dest') ?? 'jfk') as DestinationId;
  const sky = (params.get('sky') as DestinationSky | null) ?? scene.sky;
  const [hours = '10', minutes = '0'] = (params.get('clock') ?? scene.clock).split(':');
  const clock = Number(hours) * 3600 + Number(minutes) * 60;

  const canvas = document.createElement('canvas');
  canvas.className = 'world-lab';
  root.replaceChildren(canvas);
  const terrain = createTerrain(await loadTerrainSource());
  const level = (params.get('level') ?? 'pilot') as Level;
  const flight = createFlight(
    { mode: 'approach', level, destination: dest, seed: 312, sky, timeOfDay: 'morning' },
    terrain,
  );
  // A clear sky in the lab clears Philadelphia's minimum ceiling too, to see the airport.
  if (sky === 'clear') flight.world.weather.departure.ceilingFt = null;
  const view = new WorldView(canvas, flight.world, terrain);
  (window as unknown as { labView: WorldView }).labView = view;
  const pose = scene.pose(dest);
  const miles = params.get('miles');
  if (miles) Object.assign(pose, onFinal(dest, Number(miles), Number(params.get('height') ?? 300)));
  if (params.get('pitch')) pose.pitchDeg = Number(params.get('pitch'));
  const resize = () => {
    view.setSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2), {
      horizontalFov: 70,
      boresight: 0.5,
    });
  };
  resize();
  addEventListener('resize', resize);
  let time = 0;
  const frame = () => {
    time += 1 / 60;
    view.render({ pose, view: scene.view, clock, time });
    requestAnimationFrame(frame);
  };
  frame();
  // For the screenshot runs: the first frames are drawn.
  setTimeout(() => document.body.setAttribute('data-ready', 'world'), 1500);
}
