import type { RegionId } from '../../src/data/regions';
import type { ConditionId } from '../../src/engine/conditions';
import type { Season } from '../../src/engine/living-weather';
import { DioramaView } from '../../src/render/diorama-view';
import { CabView } from '../../src/render/cab-view';
import { MAP_PALETTES, paintMap, wholeCountry } from '../../src/render/map-painter';
import { RIG_PAINTS, rigModel, type RigPaintId } from '../../src/render/vehicles/rig/model';
import type { DriveScene } from '../../src/render/scene';
import { PoliceStop, type StopStep } from '../../src/game/police-stop';
import { paintHearing, paintJail } from '../../src/render/stop-art';

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');
const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:100vw;height:100vh;display:block';
root.append(canvas);
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('no 2d');
const params = new URLSearchParams(location.search);
const ratio = window.devicePixelRatio || 1;
canvas.width = innerWidth * ratio;
canvas.height = innerHeight * ratio;
ctx.scale(ratio, ratio);
const view = new DioramaView();
const dark = Number(params.get('sun') ?? 35) < -4;

/**
 * A police stop posed at one of its steps: ?stop=officer&at=5 plays a stop
 * (?kind=jailed for a fourth offence, ?mode=short) up to five seconds into
 * the officer's step.
 */
function posedStop(): PoliceStop | null {
  const step = params.get('stop') as StopStep | null;
  if (!step) return null;
  const jailed = params.get('kind') === 'jailed';
  const event = jailed
    ? { type: 'jailed' as const, offence: 4, waitHours: 4, hr: 30, mile: 900 }
    : {
        type: 'pulled-over' as const,
        offence: 2,
        waitHours: 2,
        baseCents: 1500,
        perMphCents: 400,
        overBy: 16,
        cents: 7900,
        byRadar: false,
        hr: 30,
        mile: 900,
      };
  const stop = new PoliceStop(
    {
      event,
      speed: 71,
      limit: 55,
      reading: null,
      hour: dark ? 21 : 15,
      night: dark,
      town: 'Salina',
      clock: 'MON 9 PM',
      flavour: 7,
      cruise: 71,
    },
    params.get('mode') === 'short' ? 'short' : 'full',
    true,
  );
  const at = Number(params.get('at') ?? 1);
  let inStep = 0;
  for (let frame = 0; frame < 4000 && !stop.done; frame++) {
    if (stop.step === step && inStep >= at) break;
    if (stop.waiting && stop.step !== step) stop.proceed();
    stop.update(1 / 30);
    inStep = stop.step === step ? inStep + 1 / 30 : 0;
  }
  return stop;
}

const stop = posedStop();

const region = (params.get('region') ?? 'mojave') as RegionId;
const scene: DriveScene = {
  time: Number(params.get('t') ?? 3),
  scroll: Number(params.get('scroll') ?? 5000),
  speed: stop ? stop.rigSpeed() : 55,
  region,
  previousRegion: region,
  regionBlend: 1,
  season: (params.get('season') ?? 'summer') as Season,
  snow: params.get('snow') === '1',
  condition: (params.get('condition') ?? 'clear') as ConditionId,
  sunAltitude: Number(params.get('sun') ?? 35),
  sunArc: Number(params.get('arc') ?? 0.4),
  fatigue: Number(params.get('fatigue') ?? 0),
  rig: rigModel({
    paint: RIG_PAINTS[(params.get('paint') ?? 'classic') as RigPaintId],
    cargo: (params.get('cargo') ?? 'oranges') as 'oranges',
    dirt: Number(params.get('dirt') ?? 0),
  }),
  landmarks: params.get('landmark')
    ? [
        {
          id: 'x',
          kind: params.get('landmark') as never,
          u: 5000 + 300,
          label: 'Flagstaff',
          detail: '12',
        },
      ]
    : [],
  city: Number(params.get('city') ?? 0),
  patrol: stop?.pose() ?? null,
  braking: false,
  stopped: stop ? stop.rigSpeed() < 0.5 : false,
  reducedMotion: params.get('motion') !== '1',
  dash: {
    fuel: 150,
    tank: 200,
    odometer: 948211,
    clock: 'MON 9 AM',
    minutes: 540,
    cbChannel: 19,
    cbLine: '',
    cbSpeaker: '',
    units: 'mi',
    setSpeed: 55,
    limit: 55,
    detector: 'off',
  },
};
const vignette = params.get('vignette');
if (vignette) {
  // ?vignette=hearing|jail&hour=21&progress=0.5: the end of a stop, full screen.
  const frame = {
    progress: Number(params.get('progress') ?? 0.5),
    hour: Number(params.get('hour') ?? 15),
    waitHours: Number(params.get('wait') ?? 2),
    time: scene.time,
    reducedMotion: scene.reducedMotion,
  };
  if (vignette === 'jail') paintJail(ctx, innerWidth, innerHeight, frame);
  else paintHearing(ctx, innerWidth, innerHeight, frame);
} else if (params.get('view') === 'cab') {
  const atlas = document.createElement('canvas');
  atlas.width = 340;
  atlas.height = 240;
  const atlasCtx = atlas.getContext('2d');
  if (atlasCtx) {
    paintMap(atlasCtx, {
      width: 340,
      height: 240,
      pixelRatio: 1,
      camera: { ...wholeCountry(340, 240), scale: wholeCountry(340, 240).scale * 3 },
      palette: MAP_PALETTES.atlas,
      layers: { zoneBands: false },
      time: 0,
      reducedMotion: params.get('motion') !== '1',
    });
  }
  new CabView().draw(ctx, innerWidth, innerHeight, scene, atlas);
} else {
  view.draw(ctx, innerWidth, innerHeight, scene);
}
