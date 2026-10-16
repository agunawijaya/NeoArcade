import { CARGO_IDS, type CargoId } from '../../src/engine/cargo';
import type { ConditionId } from '../../src/engine/conditions';
import type { EventArt } from '../../src/game/event-copy';
import { paintEventArt } from '../../src/render/event-art';
import { framedCamera, type Camera } from '../../src/render/vehicles/camera';
import type { Vec3 } from '../../src/render/vehicles/geometry';
import { environmentFor, type Environment } from '../../src/render/vehicles/light';
import {
  RIG_LIGHTS_OFF,
  RIG_PAINTS,
  type RigModel,
  type RigPaintId,
} from '../../src/render/vehicles/rig/model';
import { drawRig } from '../../src/render/vehicles/rig/rig';
import {
  CIVILIAN_PAINTS,
  PATROL,
  SEDAN_LIGHTS_OFF,
  type SedanModel,
} from '../../src/render/vehicles/sedan/model';
import { drawSedan } from '../../src/render/vehicles/sedan/sedan';

/**
 * The vehicle lab: every vehicle from every angle the game uses, in every
 * light, clean or dirty, in each paint and with each part a career buys.
 * Not linked from the game; for screenshots and review.
 *
 *   /ports/long-haul/dev/vehicles/?vehicle=rig&paint=classic&cargo=oranges
 *   …&tanks=long&sleeper=sleeper-cab&reefer=reliable&dirt=0.8&lamps=1
 *   …&light=night&view=front  (narrow the grid)   …&cards=1  (event cards)
 *
 * The rig and the patrol in the diorama and the cab are on the art bench:
 * /ports/long-haul/dev/art/?patrol=stopped&sun=-20 (or view=cab, patrol=approach).
 */
const params = new URLSearchParams(location.search);
const pick = <T extends string>(name: string, options: readonly T[], fallback: T): T =>
  options.includes(params.get(name) as T) ? (params.get(name) as T) : fallback;

const vehicle = pick('vehicle', ['rig', 'cruiser', 'sedan'] as const, 'rig');
const rig: RigModel = {
  paint: RIG_PAINTS[pick('paint', Object.keys(RIG_PAINTS) as RigPaintId[], 'classic')],
  cargo: pick<CargoId>('cargo', CARGO_IDS, 'oranges'),
  tanks: pick('tanks', ['stock', 'long'] as const, 'stock'),
  sleeper: pick('sleeper', ['bunk', 'sleeper-cab'] as const, 'bunk'),
  reefer: pick('reefer', ['classic', 'reliable'] as const, 'classic'),
  detector: params.get('detector') === '1',
  dirt: Number(params.get('dirt') ?? 0),
};
const sedan: SedanModel =
  vehicle === 'cruiser'
    ? { ...PATROL, dirt: Number(params.get('dirt') ?? PATROL.dirt) }
    : {
        kind: 'civilian',
        paint:
          CIVILIAN_PAINTS[Number(params.get('car') ?? 0) % CIVILIAN_PAINTS.length] ?? '#6b2a2a',
        dirt: Number(params.get('dirt') ?? 0.1),
      };
const lampsOn = params.get('lamps');

const LIGHTS: readonly { name: string; altitude: number; arc: number; condition: ConditionId }[] = [
  { name: 'dawn', altitude: 2, arc: 0.12, condition: 'clear' },
  { name: 'noon', altitude: 55, arc: 0.5, condition: 'clear' },
  { name: 'dusk', altitude: 3, arc: 0.88, condition: 'clear' },
  { name: 'night', altitude: -20, arc: 0.5, condition: 'clear' },
  { name: 'rain', altitude: 30, arc: 0.5, condition: 'rain' },
  { name: 'snow', altitude: 20, arc: 0.4, condition: 'light-snow' },
];

const bounds: { min: Vec3; max: Vec3 } =
  vehicle === 'rig'
    ? { min: [0, 0, -4.8], max: [65.6, 13.6, 4.8] }
    : { min: [-0.3, 0, -3.6], max: [18, 7.2, 3.6] };
const tractor: { min: Vec3; max: Vec3 } = { min: [44, 0, -4.8], max: [65.6, 13.6, 4.8] };

/** Every angle the game draws a vehicle from, and a few close-ups. */
const VIEWS = [
  { name: 'side (diorama)', azimuth: 80, elevation: 6, ...bounds },
  { name: 'front three-quarter (cards, garage)', azimuth: 32, elevation: 10, ...bounds },
  { name: 'rear three-quarter (ahead, overtaking)', azimuth: 150, elevation: 10, ...bounds },
  { name: 'front (mirrors)', azimuth: 8, elevation: 6, ...bounds },
  { name: 'rear (traffic ahead)', azimuth: 176, elevation: 5, ...bounds },
  { name: 'from above (beside the cab)', azimuth: 95, elevation: 34, ...bounds },
  ...(vehicle === 'rig'
    ? [
        { name: 'tractor close-up', azimuth: 80, elevation: 6, ...tractor },
        { name: 'tractor front close-up', azimuth: 32, elevation: 10, ...tractor },
      ]
    : []),
];

const root = document.querySelector<HTMLElement>('#lab');
if (!root) throw new Error('The lab page is missing its #lab element.');
const grid = document.createElement('div');
grid.className = 'lab__grid';
root.append(grid);

function cell(
  caption: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(2, 2);
  draw(ctx);
  const figure = document.createElement('figure');
  figure.className = 'lab__cell';
  const label = document.createElement('figcaption');
  label.textContent = caption;
  figure.append(canvas, label);
  grid.append(figure);
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  env: Environment,
  night: boolean,
) {
  const lit = lampsOn === null ? night : lampsOn === '1';
  if (vehicle === 'rig') {
    const lights = { ...RIG_LIGHTS_OFF, head: lit, markers: lit };
    drawRig(ctx, rig, { lights, turn: 0.4, steer: 0, sway: 0 }, camera, env);
    return;
  }
  const bar = vehicle === 'cruiser' && params.get('bar') !== '0';
  drawSedan(ctx, camera, {
    model: sedan,
    state: {
      lights: { ...SEDAN_LIGHTS_OFF, head: lit, markers: lit, bar },
      turn: 0.4,
      steer: 0,
      sway: 0,
    },
    env,
    time: 0,
    reducedMotion: false,
  });
}

if (params.get('cards')) {
  const cards: readonly EventArt[] = ['police', 'radar', 'scale', 'crash', 'blowout', 'reefer'];
  for (const art of cards)
    cell(`card · ${art}`, 480, 270, (ctx) =>
      paintEventArt(ctx, art, 480, 270, { time: 0, rig, reducedMotion: false }),
    );
} else {
  const lights = LIGHTS.filter((each) => !params.get('light') || params.get('light') === each.name);
  const views = VIEWS.filter((each) => each.name.startsWith(params.get('view') ?? ''));
  for (const light of lights)
    for (const view of views)
      cell(`${light.name} · ${view.name}`, 850, 450, (ctx) => {
        const env = environmentFor({
          sunAltitude: light.altitude,
          condition: light.condition,
          sun: [light.arc * 2 - 1, Math.sin((Math.max(-4, light.altitude) * Math.PI) / 180), -0.5],
          ground: light.condition === 'rain' ? '#2e3136' : '#4a4d52',
          horizon: '#6b7a5a',
        });
        const sky = ctx.createLinearGradient(0, 0, 0, 450);
        sky.addColorStop(0, `rgb(${env.skyTop.join(',')})`);
        sky.addColorStop(0.72, `rgb(${env.skyHorizon.join(',')})`);
        sky.addColorStop(0.72, `rgb(${env.ground.join(',')})`);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 850, 450);
        const camera = framedCamera({
          ...view,
          left: 0,
          top: 0,
          width: 850,
          height: 450,
          margin: 24,
        });
        drawVehicle(ctx, camera, env, light.altitude < -6);
      });
}
