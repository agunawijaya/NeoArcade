import '@shared/fonts/tilt-neon.css';
import './styles.css';

import { createAudio } from '@shared/audio';
import { createDailyLog, dayKey } from '@shared/daily';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { createLoop } from '@shared/loop';
import { connectPass, mountUnlockToasts } from '@shared/pass';
import { randomSeed } from '@shared/rng';
import { createHighScores, createStore } from '@shared/storage';
import manifest from '../pass.manifest';
import { songFor } from './audio/music';
import { ROUTES, TOTAL_STARS, type RouteId } from './engine/routes';
import { DAILY, dailyResultOf, type DailyResult } from './game/daily';
import { Controls } from './game/controls';
import { Demo } from './game/demo';
import { PassReporter } from './game/pass-report';
import { describeOutcome } from './game/results';
import { Session, type ModeRequest, type SessionOutcome } from './game/session';
import { loadLoadout, lookOf, saveLoadout, type Loadout } from './garage';
import { paletteFor } from './render/palette';
import { Stage } from './render/stage';
import { createViews } from './render/views';
import { loadProgress, saveProgress, totalStars } from './progress';
import { DIFFICULTY_NAMES, sanitiseSettings, type ModeId, type Settings } from './settings';
import { ThemePreference } from './theme';
import { buildDailyScreen } from './ui/daily-screen';
import { buildGarageScreen } from './ui/garage-screen';
import { Hud } from './ui/hud';
import { MenuNavigator } from './ui/menu-nav';
import { buildPauseMenu, buildResults } from './ui/overlays';
import { buildSettingsScreen } from './ui/settings-screen';
import { buildTitleScreen } from './ui/title-screen';
import { buildTripScreen } from './ui/trip-screen';

type Screen = 'title' | 'settings' | 'trip' | 'daily' | 'garage' | 'play';

/** The game's colour in the Hall and on its badges. */
const ACCENT = '#ffb238';

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');

const store = createStore('donkey-dash');
let settings = sanitiseSettings(store.get<unknown>('settings', null));
const themePreference = new ThemePreference(store);
const progress = loadProgress(store);
const dailyLog = createDailyLog<DailyResult>(store, 'daily');
const pass = connectPass(manifest);
const reporter = new PassReporter(pass);
const owns = (id: string) =>
  manifest.cosmetics.some((cosmetic) => cosmetic.id === id) &&
  pass.isUnlocked(id as (typeof manifest.cosmetics)[number]['id']);
let loadout: Loadout = loadLoadout(store, owns);
const endlessBest = (difficulty: Settings['difficulty']) =>
  createHighScores(store, `endless-${difficulty}`, { size: 5 });

// A seed in the address (?seed=81) replays the same roads, for sharing a run or testing one.
const params = new URLSearchParams(location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const nextSeed = () => (Number.isFinite(seedParam) ? seedParam : randomSeed());

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => reducedMotionQuery.matches;

const stage = new Stage(root);
stage.setFilter(settings.filter);
// The HUD places its pop-ups clear of the car, which each camera puts somewhere else.
const showCamera = () => {
  document.body.dataset.camera = settings.camera;
};
showCamera();
const views = createViews();
const audio = createAudio();
const toasts = mountUnlockToasts(pass, { accent: ACCENT, audio });
const controls = new Controls(stage.surface);
const demo = new Demo(Number.isFinite(seedParam) ? seedParam : 1981, reducedMotion);
let session: Session | null = null;
let lastRequest: ModeRequest | null = null;
let screen: Screen = 'title';
/** Whether the current Classic Duel has been in CGA from its first donkey. */
let cgaThroughout = false;

const hallHref = hallUrl();
const howToPlayHref = `${hallHref}#/games/donkey-dash/how-to-play`;

const hud = new Hud({ pause: () => openPause(), mute: () => session?.toggleMute() });
const title = buildTitleScreen(
  {
    play: (mode) => chooseMode(mode),
    garage: () => showScreen('garage'),
    settings: () => showScreen('settings'),
    toggleTheme: () => themePreference.choose(themePreference.theme === 'light' ? 'dark' : 'light'),
  },
  howToPlayHref,
);
const settingsScreen = buildSettingsScreen(settings, audio, themePreference, {
  save(next) {
    settings = next;
    store.set('settings', settings);
    stage.setFilter(settings.filter);
    showCamera();
    refreshStatuses();
  },
  back: () => showScreen('title'),
  play: (mode) => chooseMode(mode),
});
const tripScreen = buildTripScreen({
  progress,
  play: (route, leg) => startSession({ kind: 'trip', route, leg }),
  back: () => showScreen('title'),
});
const dailyScreen = buildDailyScreen({
  log: dailyLog,
  play: (practice) => startSession({ kind: 'daily', day: DAILY.on(new Date()), practice }),
  back: () => showScreen('title'),
});
const garageScreen = buildGarageScreen({
  owns: (id) => owns(id),
  unlockHint: (id) => unlockHint(id),
  loadout: () => loadout,
  change(next) {
    loadout = next;
    saveLoadout(store, loadout);
  },
  audio,
  theme: () => themePreference.theme,
  back: () => showScreen('title'),
});
const pauseMenu = buildPauseMenu(
  {
    resume: () => resume(),
    restart: () => lastRequest && startSession(lastRequest),
    menu: () => showScreen('title'),
    camera(view) {
      settings = { ...settings, camera: view };
      store.set('settings', settings);
      showCamera();
      settingsScreen.refresh(settings);
    },
  },
  howToPlayHref,
  hallHref,
);
const results = buildResults();

root.append(
  hud.element,
  title.element,
  settingsScreen.element,
  tripScreen.element,
  dailyScreen.element,
  garageScreen.element,
  pauseMenu.element,
  results.element,
);

mountHallButton({
  corner: 'bottom-left',
  // Leaving mid-run loses it, so ask first.
  beforeLeave: () => {
    if (!session || !results.element.hidden) return true;
    openPause('Leave the road? This run will not be kept.');
    return false;
  },
});

const menus = new MenuNavigator(
  () =>
    [
      pauseMenu.element,
      results.element,
      settingsScreen.element,
      tripScreen.element,
      dailyScreen.element,
      garageScreen.element,
      title.element,
    ].find((element) => !element.hidden) ?? null,
  () => {
    if (!pauseMenu.element.hidden) resume();
    else if (screen !== 'title' && screen !== 'play') showScreen('title');
  },
);

function chooseMode(mode: ModeId) {
  settings = { ...settings, mode };
  store.set('settings', settings);
  if (mode === 'trip') showScreen('trip');
  else if (mode === 'daily') showScreen('daily');
  else startSession({ kind: mode });
}

function showScreen(next: Screen) {
  endSession();
  screen = next;
  document.body.dataset.screen = next;
  title.element.hidden = next !== 'title';
  settingsScreen.element.hidden = next !== 'settings';
  tripScreen.element.hidden = next !== 'trip';
  dailyScreen.element.hidden = next !== 'daily';
  garageScreen.element.hidden = next !== 'garage';
  pauseMenu.close();
  results.hide();
  controls.disable();
  if (next === 'settings') settingsScreen.refresh(settings);
  if (next === 'trip') tripScreen.refresh();
  if (next === 'daily') dailyScreen.refresh(new Date());
  if (next === 'garage') garageScreen.refresh();
  if (next === 'title') refreshStatuses();
  audio.playMusic(songFor('title'));
  const panel = [title, settingsScreen, tripScreen, dailyScreen, garageScreen].find(
    (candidate) => !candidate.element.hidden,
  );
  if (next === 'title') title.focusFirst();
  else panel?.element.querySelector<HTMLElement>('button')?.focus();
  toasts.flush();
}

function startSession(request: ModeRequest) {
  endSession();
  lastRequest = request;
  screen = 'play';
  document.body.dataset.screen = 'play';
  document.body.dataset.mode = request.kind;
  for (const element of [
    title.element,
    settingsScreen.element,
    tripScreen.element,
    dailyScreen.element,
    garageScreen.element,
  ]) {
    element.hidden = true;
  }
  pauseMenu.close();
  results.hide();
  toasts.hold();
  controls.enable();
  cgaThroughout = settings.filter === 'cga';
  session = new Session({
    request,
    settings,
    seed: nextSeed(),
    stage,
    view: () => views[settings.camera],
    hud,
    audio,
    controls,
    look: lookOf(loadout),
    theme: () => themePreference.theme,
    reducedMotion,
    reporter,
    names: ['Player 1', 'Player 2'],
    onPause: () => openPause(),
    onPoint(side) {
      if (request.kind !== 'classic') return;
      progress.donkeyStreak = side === 'donkey' ? progress.donkeyStreak + 1 : 0;
      saveProgress(store, progress);
      if (side === 'driver') reporter.driverPoint();
    },
    onOver: (outcome) => finish(outcome),
  });
  stage.surface.focus();
}

function finish(outcome: SessionOutcome) {
  controls.disable();
  document.body.dataset.phase = 'results';
  const content = describeOutcome(outcome, {
    progress,
    pass: reporter,
    daily: dailyLog,
    endlessBest: endlessBest(settings.difficulty),
    difficulty: settings.difficulty,
    cgaThroughout: cgaThroughout && settings.filter === 'cga',
    today: dayKey(new Date()),
    resultOf: dailyResultOf,
    retry: () => lastRequest && startSession(lastRequest),
    menu: () => showScreen('title'),
    next: (route: RouteId, leg: number) => startSession({ kind: 'trip', route, leg }),
    trip: () => showScreen('trip'),
  });
  saveProgress(store, progress);
  results.show(content);
  toasts.flush();
}

function endSession() {
  if (session) reporter.commit();
  session?.dispose();
  session = null;
  delete document.body.dataset.mode;
  delete document.body.dataset.phase;
  delete document.body.dataset.step;
  delete document.body.dataset.lane;
  delete document.body.dataset.moment;
}

function openPause(message: string | null = null) {
  if (!session || !results.element.hidden) return;
  session.pause();
  controls.disable();
  pauseMenu.open(settings.camera, message);
}

function resume() {
  if (!session) return;
  pauseMenu.close();
  session.resume();
  controls.enable();
  stage.surface.focus();
}

function unlockHint(id: string): string {
  const cosmetic = manifest.cosmetics.find((candidate) => candidate.id === id);
  if (!cosmetic) return '';
  if ('level' in cosmetic.unlock) return `Reach Arcade level ${cosmetic.unlock.level}`;
  const badgeId = cosmetic.unlock.badge;
  const badge = manifest.badges.find((candidate) => candidate.id === badgeId);
  return badge?.tier === 'secret' ? 'Earn a secret badge' : `Earn “${badge?.name ?? badgeId}”`;
}

function refreshStatuses() {
  const stars = totalStars(progress);
  const nextRoute = Object.values(ROUTES).find((route) => route.unlockStars > stars);
  title.setStatus('trip', {
    status: `★ ${stars} / ${TOTAL_STARS}${nextRoute ? ` · ${nextRoute.name} at ${nextRoute.unlockStars}` : ''}`,
  });
  const best = endlessBest(settings.difficulty).list()[0];
  const difficulty = DIFFICULTY_NAMES[settings.difficulty];
  title.setStatus('endless', {
    status: best
      ? `${difficulty} · best ${best.score.toLocaleString('en')}`
      : `${difficulty} · no best yet`,
  });
  const today = DAILY.on(new Date());
  const done = dailyLog.get(today.key);
  const streak = dailyLog.streak(today.key).current;
  title.setStatus('daily', {
    status: done
      ? `#${today.number} done · ${done.metres.toLocaleString('en')} m${streak > 1 ? ` · ${streak}-day streak` : ''}`
      : `Road #${today.number}${streak > 0 ? ` · ${streak}-day streak` : ''}`,
    flag: done ? undefined : 'New today',
  });
  title.setStatus('classic', {
    status: `First to ${settings.points} · ${settings.hazards.classic ? 'with hazards' : 'as in 1981'}`,
  });
  title.setStatus('versus', { status: `Two players · first to ${settings.points}` });
}

function applyTheme() {
  document.documentElement.dataset.theme = themePreference.theme;
  title.showTheme(themePreference.theme);
}

themePreference.onChange(applyTheme);
applyTheme();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && session && !session.paused) openPause();
});
window.addEventListener('pagehide', () => reporter.commit());

createLoop({
  update() {
    menus.update();
    controls.update();
    if (session) {
      const wasPaused = session.paused;
      session.update();
      if (wasPaused && !pauseMenu.element.hidden && controls.input.wasPressed('pause')) resume();
    } else if (!reducedMotion()) {
      demo.update();
    }
  },
  render(alpha, frameSeconds) {
    if (session) session.render(alpha, frameSeconds);
    else {
      const palette = paletteFor('home', themePreference.theme);
      demo.render(stage, views[settings.camera], palette, lookOf(loadout), alpha, frameSeconds);
    }
  },
}).start();

showScreen('title');
title.intro(reducedMotion());
