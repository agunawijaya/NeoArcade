import type { RegionId } from '../../src/data/regions';
import type { ConditionId } from '../../src/engine/conditions';
import type { Season } from '../../src/engine/living-weather';
import { DioramaView } from '../../src/render/diorama-view';
import { CabView } from '../../src/render/cab-view';
import { MAP_PALETTES, paintMap, wholeCountry } from '../../src/render/map-painter';
import { RIG_PAINTS, type RigPaintId } from '../../src/render/rig';
import type { DriveScene } from '../../src/render/scene';

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
const region = (params.get('region') ?? 'mojave') as RegionId;
const scene: DriveScene = {
  time: Number(params.get('t') ?? 3),
  scroll: Number(params.get('scroll') ?? 5000),
  speed: 55,
  region,
  previousRegion: region,
  regionBlend: 1,
  season: (params.get('season') ?? 'summer') as Season,
  snow: params.get('snow') === '1',
  condition: (params.get('condition') ?? 'clear') as ConditionId,
  sunAltitude: Number(params.get('sun') ?? 35),
  sunArc: Number(params.get('arc') ?? 0.4),
  fatigue: Number(params.get('fatigue') ?? 0),
  cargo: (params.get('cargo') ?? 'oranges') as DriveScene['cargo'],
  paint: RIG_PAINTS[(params.get('paint') ?? 'classic') as RigPaintId],
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
  police: params.get('police') === '1',
  braking: false,
  stopped: false,
  reducedMotion: true,
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
if (params.get('view') === 'cab') {
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
      reducedMotion: true,
    });
  }
  new CabView().draw(ctx, innerWidth, innerHeight, scene, atlas);
} else {
  view.draw(ctx, innerWidth, innerHeight, scene);
}
