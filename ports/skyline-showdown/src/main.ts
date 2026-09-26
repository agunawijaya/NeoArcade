import '@shared/fonts/tilt-neon.css';
import './styles.css';

import { createAudio } from '@shared/audio';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { createLoop } from '@shared/loop';
import { randomSeed } from '@shared/rng';
import { createStore } from '@shared/storage';
import { THEME } from './audio/sounds';
import { Controls } from './game/controls';
import { Session } from './game/session';
import { TitleShow } from './game/title-show';
import { Stage } from './render/stage';
import { sanitiseSettings, type Settings } from './settings';
import { Hud } from './ui/hud';
import { MenuNavigator } from './ui/menu-nav';
import { buildPauseMenu, buildRotateHint, buildVictoryScreen } from './ui/overlays';
import { buildSettingsScreen } from './ui/settings-screen';
import { ThemePreference } from './theme';
import { buildTitleScreen } from './ui/title-screen';

type Screen = 'title' | 'settings' | 'match';

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');

const store = createStore('skyline-showdown');
let settings = sanitiseSettings(store.get<unknown>('settings', null));
const themePreference = new ThemePreference(store);
let sceneIsNight = false;
// A seed in the address (?seed=1990) replays the same cities, handy for sharing a duel.
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed') ?? '', 10);
const nextSeed = () => (Number.isFinite(seedParam) ? seedParam : randomSeed());

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = matchMedia('(pointer: coarse)');
const reducedMotion = () => reducedMotionQuery.matches;

const stage = new Stage(root);
stage.onSceneChange = (scene) => {
  sceneIsNight = scene.night;
  applyPageTheme();
};
stage.camera.reducedMotion = reducedMotion();
reducedMotionQuery.addEventListener('change', () => (stage.camera.reducedMotion = reducedMotion()));
stage.setCrt(settings.crt);

const audio = createAudio();
const controls = new Controls(stage.surface);
let session: Session | null = null;
let title: TitleShow | null = new TitleShow(stage, settings.weather, themePreference.theme);
let screen: Screen = 'title';

const hallHref = hallUrl();
const howToPlayHref = `${hallHref}#/games/skyline-showdown/how-to-play`;

const hud = new Hud({
  pause: () => openPause(),
  mute: () => session?.toggleMute(),
  powerUp: (player) => session?.togglePowerUp(player),
  keypad: (key) => session?.keypad(key),
  skip: () => session?.skipReplay(),
});

const titleScreen = buildTitleScreen(
  {
    play: () => startMatch(settings),
    settings: () => showScreen('settings'),
    toggleTheme: () => themePreference.choose(themePreference.theme === 'light' ? 'dark' : 'light'),
  },
  howToPlayHref,
);
titleScreen.showTheme(themePreference.theme);
const settingsScreen = buildSettingsScreen(settings, audio, themePreference, {
  start(chosen) {
    settings = sanitiseSettings(chosen);
    store.set('settings', settings);
    startMatch(settings);
  },
  back: () => showScreen('title'),
});
const pauseMenu = buildPauseMenu(
  {
    resume: () => resume(),
    restart: () => startMatch(settings),
    settings: () => showScreen('settings'),
  },
  howToPlayHref,
  hallHref,
);
const victory = buildVictoryScreen(
  { rematch: () => startMatch(settings), settings: () => showScreen('settings') },
  hallHref,
);

root.append(
  hud.element,
  titleScreen.element,
  settingsScreen.element,
  pauseMenu.element,
  victory.element,
  buildRotateHint(),
);

mountHallButton({
  corner: 'bottom-left',
  // Leaving mid-match loses the score, so ask first.
  beforeLeave: () => {
    if (!session || !victory.element.hidden) return true;
    openPause('Leave the match? The score will not be kept.');
    return false;
  },
});

const menus = new MenuNavigator(
  () =>
    [pauseMenu.element, victory.element, settingsScreen.element, titleScreen.element].find(
      (element) => !element.hidden,
    ) ?? null,
  () => {
    if (!pauseMenu.element.hidden) resume();
    else if (screen === 'settings') showScreen('title');
  },
);

function showScreen(next: Screen) {
  screen = next;
  document.body.dataset.screen = next;
  if (next !== 'match') endMatch();
  titleScreen.element.hidden = next !== 'title';
  settingsScreen.element.hidden = next !== 'settings';
  pauseMenu.close();
  victory.hide();
  if (next === 'settings') settingsScreen.refresh(settings);
  if (next !== 'match') {
    title ??= new TitleShow(stage, settings.weather, themePreference.theme);
    stage.setCrt(settings.crt);
    audio.playMusic(THEME);
    controls.disable();
    const first = (
      next === 'title' ? titleScreen.element : settingsScreen.element
    ).querySelector<HTMLElement>('button');
    first?.focus();
  }
}

function startMatch(chosen: Settings) {
  endMatch();
  title = null;
  screen = 'match';
  document.body.dataset.screen = 'match';
  titleScreen.element.hidden = true;
  settingsScreen.element.hidden = true;
  pauseMenu.close();
  victory.hide();
  stage.setCrt(chosen.crt);
  controls.enable();
  session = new Session({
    settings: chosen,
    seed: nextSeed(),
    stage,
    hud,
    audio,
    controls,
    reducedMotion,
    touch: () => coarsePointer.matches,
    theme: () => themePreference.theme,
    onPause: () => openPause(),
    onMatchOver: (summary) => {
      controls.disable();
      victory.show(summary);
    },
  });
}

/**
 * The page follows the chosen theme, except that a match at night stays
 * dark around its dark city.
 */
function applyPageTheme() {
  const theme = themePreference.theme === 'light' && !sceneIsNight ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
}

themePreference.onChange(() => {
  // Menus show the title city, which is repainted in the new light; a match
  // picks the theme up from its next round.
  if (!session) title = new TitleShow(stage, settings.weather, themePreference.theme);
  applyPageTheme();
  titleScreen.showTheme(themePreference.theme);
});

function endMatch() {
  session?.dispose();
  session = null;
}

function openPause(message: string | null = null) {
  if (!session || !victory.element.hidden) return;
  session.paused = true;
  controls.disable();
  pauseMenu.open(message);
}

function resume() {
  if (!session) return;
  pauseMenu.close();
  session.paused = false;
  controls.enable();
  stage.surface.focus();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && session && !session.paused) openPause();
});

createLoop({
  update(step) {
    menus.update();
    if (session) {
      const wasPaused = session.paused;
      session.update(step);
      if (wasPaused && !pauseMenu.element.hidden && controls.input.wasPressed('pause')) resume();
    } else {
      title?.update(step, reducedMotion());
    }
  },
  render() {
    stage.render();
  },
}).start();

showScreen('title');
