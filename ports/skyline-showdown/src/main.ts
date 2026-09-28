import '@shared/fonts/tilt-neon.css';
import './styles.css';

import { createAudio } from '@shared/audio';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { createLoop } from '@shared/loop';
import { mountUnlockToasts, openArcadePass } from '@shared/pass';
import { randomSeed } from '@shared/rng';
import { createStore } from '@shared/storage';
import manifest from '../pass.manifest';
import { THEME } from './audio/sounds';
import type { PlayerIndex } from './engine/gorillas';
import { Controls } from './game/controls';
import { PassReporter, reportWardrobeChange, type CosmeticId } from './game/pass-reporter';
import { Session, type MatchSummary } from './game/session';
import { quickMatchSetup, tourSetup, type MatchSetup } from './game/setup';
import { TitleShow } from './game/title-show';
import { Stage } from './render/stage';
import { sanitiseSettings, type Settings } from './settings';
import { ThemePreference } from './theme';
import { MAX_STARS, nextStage, recordStage, stageUnlocked, totalStars } from './tour/progress';
import { RIVALS } from './tour/rivals';
import { loadTour, TOUR_KEY, type TourSave } from './tour/save';
import { STAGES, type Stage as TourStage } from './tour/stages';
import { buildBadgesScreen } from './ui/badges-screen';
import { Hud } from './ui/hud';
import { MenuNavigator } from './ui/menu-nav';
import { buildPauseMenu, buildRotateHint, buildVictoryScreen } from './ui/overlays';
import { buildPreferencesScreen } from './ui/preferences-screen';
import { buildResultsScreen } from './ui/results-screen';
import { buildSettingsScreen } from './ui/settings-screen';
import { buildStageCard } from './ui/stage-card';
import { buildTitleScreen } from './ui/title-screen';
import { buildTourMap } from './ui/tour-map';
import { buildWardrobeScreen } from './ui/wardrobe-screen';
import { DEFAULT_OUTFITS, WARDROBE, type Outfit } from './wardrobe/items';
import { isItemUnlocked, wearableOutfit, type UnlockContext } from './wardrobe/unlocks';

type Screen = 'title' | 'tour' | 'quick' | 'settings' | 'wardrobe' | 'badges' | 'match';
type Mode = { kind: 'quick' } | { kind: 'tour'; stage: TourStage };

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');

const store = createStore('skyline-showdown');
let settings = sanitiseSettings(store.get<unknown>('settings', null));
let tour: TourSave = loadTour(store.get<unknown>(TOUR_KEY, null));
const themePreference = new ThemePreference(store);
let sceneIsNight = false;
// A seed in the address (?seed=1990) replays the same cities, handy for sharing a duel.
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed') ?? '', 10);
const nextSeed = () => (Number.isFinite(seedParam) ? seedParam : randomSeed());

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = matchMedia('(pointer: coarse)');
const reducedMotion = () => reducedMotionQuery.matches;

const audio = createAudio();
const arcade = openArcadePass();
const pass = arcade.forGame(manifest);
const toasts = mountUnlockToasts(pass, { accent: '#ff7a3d', audio });
const passItems = new Set<string>(manifest.cosmetics.map((cosmetic) => cosmetic.id));
const isPassItem = (id: string): id is CosmeticId => passItems.has(id);

const stage = new Stage(root);
stage.onSceneChange = (scene) => {
  sceneIsNight = scene.night;
  applyPageTheme();
};
stage.camera.reducedMotion = reducedMotion();
reducedMotionQuery.addEventListener('change', () => (stage.camera.reducedMotion = reducedMotion()));
stage.setCrt(settings.crt);

const controls = new Controls(stage.surface);
let session: Session | null = null;
let mode: Mode = { kind: 'quick' };
let title: TitleShow | null = null;
let screen: Screen = 'title';
/** Wardrobe items open when the match began, to tell the player what it unlocked. */
let unlockedAtStart = new Set<string>();

const hallHref = hallUrl();
const howToPlayHref = `${hallHref}#/games/skyline-showdown/how-to-play`;

function unlockContext(): UnlockContext {
  return {
    stars: totalStars(tour),
    rivalsBeaten: tour.rivalsBeaten,
    passUnlocked: (id) => isPassItem(id) && pass.isUnlocked(id),
  };
}

/** What each player can wear right now: anything since locked again falls back to the default. */
function outfits(): [Outfit, Outfit] {
  const context = unlockContext();
  return [
    wearableOutfit(tour.outfits[0], DEFAULT_OUTFITS[0], context),
    wearableOutfit(tour.outfits[1], DEFAULT_OUTFITS[1], context),
  ];
}

function unlockedItems(): Set<string> {
  const context = unlockContext();
  return new Set(WARDROBE.filter((item) => isItemUnlocked(item, context)).map((item) => item.id));
}

function saveTour(next: TourSave) {
  tour = next;
  store.set(TOUR_KEY, tour);
  titleScreen.showProgress(totalStars(tour), MAX_STARS);
}

const hud = new Hud({
  pause: () => openPause(),
  mute: () => session?.toggleMute(),
  powerUp: (player) => session?.togglePowerUp(player),
  keypad: (key) => session?.keypad(key),
  skip: () => session?.skipReplay(),
});

const titleScreen = buildTitleScreen(
  {
    tour: () => showScreen('tour'),
    quickMatch: () => showScreen('quick'),
    wardrobe: () => showScreen('wardrobe'),
    badges: () => showScreen('badges'),
    settings: () => showScreen('settings'),
    toggleTheme: () => themePreference.choose(themePreference.theme === 'light' ? 'dark' : 'light'),
  },
  { howToPlay: howToPlayHref, hall: hallHref },
);
titleScreen.showTheme(themePreference.theme);
titleScreen.showProgress(totalStars(tour), MAX_STARS);

const tourMap = buildTourMap({
  open: (tourStage) => stageCard.open(tourStage, tour.stages[tourStage.id], settings.aimAssist),
  back: () => showScreen('title'),
});
const stageCard = buildStageCard({
  play: (tourStage) => startStage(tourStage),
  close: () => {
    stageCard.close();
    tourMap.focusNext();
  },
});
const quickScreen = buildSettingsScreen(settings, audio, themePreference, {
  start(chosen) {
    changeSettings(chosen);
    startQuickMatch();
  },
  back: () => showScreen('title'),
});
const preferences = buildPreferencesScreen(audio, themePreference, {
  change: (next) => changeSettings(next),
  back: () => showScreen('title'),
});
const wardrobe = buildWardrobeScreen({
  change(player: PlayerIndex, outfit: Outfit) {
    const next = structuredClone(tour);
    next.outfits[player] = outfit;
    saveTour(next);
    reportWardrobeChange(pass);
    wardrobe.refresh(wardrobeState());
    // The gorilla on the title rooftop wears player 1's outfit.
    if (player === 0) {
      title = new TitleShow(stage, settings.weather, themePreference.theme, outfits()[0]);
    }
  },
  back: () => showScreen('title'),
});
const badges = buildBadgesScreen(arcade, manifest, { pass: `${hallHref}#/pass` }, () =>
  showScreen('title'),
);
const pauseMenu = buildPauseMenu(
  {
    resume: () => resume(),
    restart: () => (mode.kind === 'tour' ? startStage(mode.stage) : startQuickMatch()),
    leave: () => showScreen(mode.kind === 'tour' ? 'tour' : 'quick'),
  },
  howToPlayHref,
  hallHref,
);
const victory = buildVictoryScreen(
  { rematch: () => startQuickMatch(), settings: () => showScreen('quick') },
  hallHref,
);
const results = buildResultsScreen({
  next(tourStage) {
    showScreen('tour');
    stageCard.open(tourStage, tour.stages[tourStage.id], settings.aimAssist);
  },
  retry: (tourStage) => startStage(tourStage),
  map: () => showScreen('tour'),
});

root.append(
  hud.element,
  titleScreen.element,
  tourMap.element,
  quickScreen.element,
  preferences.element,
  wardrobe.element,
  badges.element,
  stageCard.element,
  pauseMenu.element,
  victory.element,
  results.element,
  buildRotateHint(),
);

mountHallButton({
  corner: 'bottom-left',
  // Leaving mid-match loses the score, so ask first.
  beforeLeave: () => {
    if (!session || !victory.element.hidden || !results.element.hidden) return true;
    openPause('Leave the match? The score will not be kept.');
    return false;
  },
});

const SCREENS: Record<Exclude<Screen, 'match'>, HTMLElement> = {
  title: titleScreen.element,
  tour: tourMap.element,
  quick: quickScreen.element,
  settings: preferences.element,
  wardrobe: wardrobe.element,
  badges: badges.element,
};

const menus = new MenuNavigator(
  () =>
    [
      pauseMenu.element,
      results.element,
      victory.element,
      stageCard.element,
      ...Object.values(SCREENS),
    ].find((element) => !element.hidden) ?? null,
  () => {
    if (!pauseMenu.element.hidden) resume();
    else if (!stageCard.element.hidden) {
      stageCard.close();
      tourMap.focusNext();
    } else if (!results.element.hidden) showScreen('tour');
    else if (screen !== 'title' && screen !== 'match') showScreen('title');
  },
);

function wardrobeState() {
  return {
    outfits: outfits(),
    unlocks: unlockContext(),
    badgeName: (id: string) => manifest.badges.find((badge) => badge.id === id)?.name ?? id,
    rivalName: (id: string) => RIVALS[id as keyof typeof RIVALS]?.name ?? id,
  };
}

function changeSettings(next: Settings) {
  settings = sanitiseSettings(next);
  store.set('settings', settings);
  stage.setCrt(settings.crt);
}

function showScreen(next: Exclude<Screen, 'match'>) {
  endMatch();
  screen = next;
  document.body.dataset.screen = next;
  for (const [name, element] of Object.entries(SCREENS)) element.hidden = name !== next;
  stageCard.close();
  pauseMenu.close();
  victory.hide();
  results.hide();
  title ??= new TitleShow(stage, settings.weather, themePreference.theme, outfits()[0]);
  stage.setCrt(settings.crt);
  audio.playMusic(THEME);
  controls.disable();
  toasts.flush();

  if (next === 'tour') tourMap.refresh(tour);
  if (next === 'quick') quickScreen.refresh(settings, tour.rivalsBeaten);
  if (next === 'settings') preferences.refresh(settings);
  if (next === 'wardrobe') wardrobe.refresh(wardrobeState());
  if (next === 'badges') badges.show();
  if (next === 'tour') tourMap.focusNext();
  else SCREENS[next].querySelector<HTMLElement>('button, a[href]')?.focus();
}

function startQuickMatch() {
  const setup = quickMatchSetup(settings, nextSeed(), outfits(), tour.rivalsBeaten);
  startSession(setup, { kind: 'quick' });
}

function startStage(tourStage: TourStage) {
  if (!stageUnlocked(tour, tourStage)) return;
  const setup = tourSetup(tourStage, settings, nextSeed(), outfits()[0]);
  startSession(setup, { kind: 'tour', stage: tourStage });
}

function startSession(setup: MatchSetup, next: Mode) {
  endMatch();
  mode = next;
  title = null;
  screen = 'match';
  document.body.dataset.screen = 'match';
  for (const element of Object.values(SCREENS)) element.hidden = true;
  stageCard.close();
  pauseMenu.close();
  victory.hide();
  results.hide();
  stage.setCrt(settings.crt);
  controls.enable();
  unlockedAtStart = unlockedItems();
  const reporter = setup.players[0].cpu ? null : new PassReporter(pass, 0);
  const rivalsBefore = [...tour.rivalsBeaten];
  session = new Session({
    setup,
    stage,
    hud,
    audio,
    controls,
    reducedMotion,
    touch: () => coarsePointer.matches,
    theme: () => themePreference.theme,
    onPause: () => openPause(),
    onThrow: (report) => reporter?.throwMade(report),
    onTurnStart: () => toasts.hold(),
    onPoint: () => toasts.flush(),
    onMatchOver: (summary) => {
      controls.disable();
      const opponent = setup.players[1];
      const xp =
        reporter?.matchOver({
          won: summary.winner === 0,
          mode: next.kind,
          cpu: opponent.cpu
            ? { level: opponent.cpu.level, rival: opponent.rival?.id ?? null }
            : null,
          rivalsBeaten: rivalsBefore,
        }) ?? 0;
      if (next.kind === 'tour') finishStage(next.stage, summary, xp, reporter);
      else showVictory(summary, setup);
      toasts.flush();
    },
  });
}

function finishStage(
  tourStage: TourStage,
  summary: MatchSummary,
  matchXp: number,
  reporter: PassReporter | null,
) {
  const recorded = recordStage(tour, tourStage, {
    won: summary.winner === 0,
    throws: summary.throws[0],
    timesHit: summary.scores[1],
    aimAssist: summary.assisted,
  });
  saveTour(recorded.save);
  const stageXp = reporter?.stageRecorded(tourStage, recorded) ?? 0;
  const now = unlockedItems();
  const upcoming = nextStage(tour);
  results.show({
    stage: tourStage,
    recorded,
    throws: summary.throws[0],
    timesHit: summary.scores[1],
    xp: matchXp + stageXp,
    unlocked: WARDROBE.filter((item) => now.has(item.id) && !unlockedAtStart.has(item.id)),
    next: upcoming && STAGES.indexOf(upcoming) > STAGES.indexOf(tourStage) ? upcoming : null,
  });
}

function showVictory(summary: MatchSummary, setup: MatchSetup) {
  const rival = setup.players[1].rival;
  const line = rival
    ? {
        text: summary.winner === 1 ? rival.lines.victory : rival.lines.defeat,
        speaker: rival.name,
      }
    : null;
  victory.show(summary, line);
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
  if (!session) title = new TitleShow(stage, settings.weather, themePreference.theme, outfits()[0]);
  applyPageTheme();
  titleScreen.showTheme(themePreference.theme);
  if (screen === 'wardrobe') wardrobe.refresh(wardrobeState());
});

function endMatch() {
  session?.dispose();
  session = null;
}

function openPause(message: string | null = null) {
  if (!session || !victory.element.hidden || !results.element.hidden) return;
  session.paused = true;
  controls.disable();
  pauseMenu.open(
    mode.kind === 'tour'
      ? { restart: 'Restart stage', leave: 'Back to the map' }
      : { restart: 'Restart match', leave: 'Match settings' },
    message,
  );
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
      results.animate(step, reducedMotion());
      return;
    }
    const still = reducedMotion();
    if (screen === 'tour') {
      tourMap.animate(step, still);
      stageCard.animate(step, still);
    } else {
      title?.update(step, still);
    }
    if (screen === 'wardrobe') wardrobe.animate(step, still);
  },
  render() {
    // The map covers the whole page, so the city behind it can rest.
    if (screen !== 'tour') stage.render();
  },
}).start();

showScreen('title');
