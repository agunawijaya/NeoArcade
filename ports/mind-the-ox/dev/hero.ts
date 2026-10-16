import { TICKS_PER_SECOND } from '../src/engine/constants';
import type { Match } from '../src/engine/match';
import { Visuals } from '../src/game/visuals';
import { paintHud } from '../src/render/hud';
import { liveryFor } from '../src/render/liveries';
import {
  goldenHour,
  paletteFor,
  type Lighting,
  type Livery,
  type Palette,
} from '../src/render/palette';
import { SideView } from '../src/render/side-view';
import type { ViewRenderer, Viewport } from '../src/render/view';
import { isThemeId, THEMES } from '../src/themes';
import { buildScene, type SceneId } from './scenes';

/**
 * Renders one staged moment as a still: ?scene=dogfight|bombing|sun|fog|night|convoy,
 * &view=side|diorama, &light=day|night, &theme=great-war|cyan-magenta|airshow.
 * Playwright waits for body[data-ready] and takes the picture.
 */
const params = new URLSearchParams(location.search);
const sceneId = (params.get('scene') ?? 'dogfight') as SceneId;
const lighting = (params.get('light') ?? 'day') as Lighting;
const viewId = params.get('view') ?? 'side';
const themeParam = params.get('theme');
const theme = isThemeId(themeParam) ? themeParam : 'great-war';

const stage = document.querySelector<HTMLElement>('#stage');
if (!stage) throw new Error('No stage.');

const visuals = new Visuals();
const splatsFor = new Set<number>();
let time = 0;

const scene = buildScene(sceneId, (match: Match) => {
  if (splatsFor.size === 0) splatsFor.add(match.world.planes[0]?.id ?? -1);
  time += 1 / TICKS_PER_SECOND;
  visuals.absorb(match.world.events, match.world, time, {
    splatsFor,
    downed: THEMES[theme].downed,
    festive: theme === 'airshow',
    cheerful: theme === 'cyan-magenta',
  });
  // Let the particles live through the scripted flight, a tick at a time.
  visuals.advance(match.world, time);
});

const palette = sceneLight();

/**
 * The scene's light: at dawn the light setting picks sunrise or the
 * twilight before it; at dusk, sunset or the night after.
 */
function sceneLight(): Palette {
  if (scene.night) return paletteFor(theme, 'night');
  if (scene.hour === 'dawn')
    return goldenHour(paletteFor(theme, 'night'), lighting === 'day' ? 0.85 : 0.4);
  if (scene.hour === 'dusk' && lighting === 'day') return goldenHour(paletteFor(theme, 'day'), 0.9);
  return paletteFor(theme, lighting);
}
const liveries = new Map<number, Livery>(
  scene.match.world.planes.map((plane) => [
    plane.id,
    liveryFor(palette, plane.side, plane.side === 0 ? 'player' : 'normal'),
  ]),
);

async function viewFor(id: string): Promise<ViewRenderer> {
  if (id === 'diorama') {
    const { DioramaView } = await import('../src/render/diorama-view');
    return new DioramaView();
  }
  return new SideView();
}

const view = await viewFor(viewId);
stage.append(view.element);
const compact = innerHeight < 500 || innerWidth < 700;
const viewport: Viewport = {
  width: innerWidth,
  height: innerHeight,
  insetTop: compact ? 48 : 64,
  insetBottom: compact ? 40 : 58,
};
const pixelRatio = Math.min(2, devicePixelRatio || 1);
view.resize(viewport, pixelRatio);
const field = view.fieldOfView(viewport, 0);
const frame = visuals.frame({
  world: scene.match.world,
  palette,
  theme,
  time,
  focus: scene.focus,
  view: 0,
  halfWidth: (field.right - field.left) / 2,
  sun: scene.sun,
  theEnd: null,
  reducedMotion: false,
  liveries,
  cameraX: scene.cameraX ?? scene.focus.x,
});
const hud = document.createElement('canvas');
hud.width = Math.round(viewport.width * pixelRatio);
hud.height = Math.round(viewport.height * pixelRatio);
stage.append(hud);
const hudContext = hud.getContext('2d');
const paint = () => {
  view.render(frame, viewport);
  if (!hudContext) return;
  hudContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  hudContext.clearRect(0, 0, viewport.width, viewport.height);
  paintHud(hudContext, viewport, {
    world: scene.match.world,
    plane: scene.focus,
    score: scene.match.banked[0] + scene.match.world.score[0] + scene.scoreShown,
    round: scene.match.round,
    roundLabel: scene.label,
    secretWeapons: false,
    window: view.fieldOfView(viewport, frame.cameraX),
    palette: frame.palette,
    time,
    objective: scene.objective ?? null,
    friendlySide: 0,
  });
};
paint();
requestAnimationFrame(() => {
  paint();
  document.body.dataset.ready = 'true';
});
