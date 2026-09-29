import '@shared/fonts/tilt-neon.css';
import './styles.css';
import './styles/modes.css';

import { createAudio } from '@shared/audio';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { createLoop } from '@shared/loop';
import { mountUnlockToasts, openArcadePass } from '@shared/pass';
import { randomSeed } from '@shared/rng';
import { createStore } from '@shared/storage';
import manifest from '../pass.manifest';
import { THEME } from './audio/sounds';
import { rebuildChallenge } from './challenge/challenge';
import { decodeChallenge, encodeChallenge, type Challenge } from './challenge/link';
import { DailyBook } from './daily/book';
import {
  dailyFor,
  outcomeOf,
  resumeDaily,
  shareLine,
  startDaily,
  type DailyResult,
  type DailySkyline,
} from './daily/daily';
import type { PlayerIndex } from './engine/gorillas';
import { ChallengePlay, whereText } from './game/challenge-play';
import { Controls } from './game/controls';
import {
  PassReporter,
  reportDaily,
  reportWardrobeChange,
  type CosmeticId,
} from './game/pass-reporter';
import type { PlayContext } from './game/play-context';
import { Session, type MatchSummary } from './game/session';
import { dailySetup, quickMatchSetup, tourSetup, type MatchSetup } from './game/setup';
import type { ShotSession } from './game/shot-session';
import { TitleShow } from './game/title-show';
import { TrickPlay } from './game/trick-play';
import { Stage } from './render/stage';
import { sanitiseSettings, type Settings } from './settings';
import { ThemePreference } from './theme';
import { MAX_STARS, nextStage, recordStage, stageUnlocked, totalStars } from './tour/progress';
import { RIVALS } from './tour/rivals';
import { loadTour, TOUR_KEY, type TourSave } from './tour/save';
import { STAGES, type Stage as TourStage } from './tour/stages';
import {
  loadTricks,
  MAX_TRICK_STARS,
  totalTrickStars,
  TRICKS_KEY,
  type TrickSave,
} from './tricks/progress';
import type { Puzzle } from './tricks/puzzle';
import { buildBadgesScreen } from './ui/badges-screen';
import {
  buildChallengeIntro,
  buildChallengeMaker,
  buildChallengeProblem,
  buildChallengeResult,
} from './ui/challenge-screens';
import { buildDailyResults } from './ui/daily-results';
import { buildDailyScreen } from './ui/daily-screen';
import { Hud } from './ui/hud';
import { MenuNavigator } from './ui/menu-nav';
import { buildPauseMenu, buildRotateHint, buildVictoryScreen } from './ui/overlays';
import { buildPreferencesScreen } from './ui/preferences-screen';
import { buildPuzzleCard } from './ui/puzzle-card';
import { buildResultsScreen } from './ui/results-screen';
import { buildSettingsScreen } from './ui/settings-screen';
import { buildStageCard } from './ui/stage-card';
import { buildTitleScreen } from './ui/title-screen';
import { buildTourMap } from './ui/tour-map';
import { buildTrickMap } from './ui/trick-map';
import { buildSolveCard, buildTrickPanel } from './ui/trick-panel';
import { buildWardrobeScreen } from './ui/wardrobe-screen';
import { DEFAULT_OUTFITS, WARDROBE, type Outfit } from './wardrobe/items';
import { isItemUnlocked, wearableOutfit, type UnlockContext } from './wardrobe/unlocks';

type Screen =
  'title' | 'tour' | 'daily' | 'tricks' | 'quick' | 'settings' | 'wardrobe' | 'badges' | 'match';
type Mode =
  | { kind: 'quick' }
  | { kind: 'tour'; stage: TourStage }
  | { kind: 'daily'; skyline: DailySkyline; scored: boolean }
  | { kind: 'trick'; puzzle: Puzzle }
  | { kind: 'challenge' };

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');

const store = createStore('skyline-showdown');
let settings = sanitiseSettings(store.get<unknown>('settings', null));
let tour: TourSave = loadTour(store.get<unknown>(TOUR_KEY, null));
let tricks: TrickSave = loadTricks(store.get<unknown>(TRICKS_KEY, null));
const dailyBook = new DailyBook(store);
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
/** Whatever is being played: a match (Quick Match, tour, daily) or single throws (Trick Shot, challenges). */
let session: Session | null = null;
let shots: ShotSession | null = null;
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

function saveTricks(next: TrickSave) {
  tricks = next;
  store.set(TRICKS_KEY, tricks);
  titleScreen.showTrickStars(totalTrickStars(tricks), MAX_TRICK_STARS);
}

const hud = new Hud({
  pause: () => openPause(),
  mute: () => (session ?? shots)?.toggleMute(),
  powerUp: (player) => session?.togglePowerUp(player),
  keypad: (key) => (session ?? shots)?.keypad(key),
  skip: () => session?.skipReplay(),
  challenge: () => offerChallenge(session?.challenge() ?? null),
});

const context: PlayContext = {
  stage,
  hud,
  audio,
  controls,
  pass,
  toasts,
  reducedMotion,
  touch: () => coarsePointer.matches,
  theme: () => themePreference.theme,
  settings: () => settings,
  outfits,
  pause: () => openPause(),
};

const titleScreen = buildTitleScreen(
  {
    tour: () => showScreen('tour'),
    daily: () => showScreen('daily'),
    tricks: () => showScreen('tricks'),
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
titleScreen.showTrickStars(totalTrickStars(tricks), MAX_TRICK_STARS);

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
const dailyScreen = buildDailyScreen({
  play: () => startDailyAttempt(true),
  practice: () => startDailyAttempt(false),
  results: () => showDailyResults(dailyFor(new Date()), true),
  back: () => showScreen('title'),
});
const dailyResults = buildDailyResults({
  practice: () => startDailyAttempt(false),
  daily: () => showScreen('daily'),
  challenge: () => offerChallenge(session?.challenge() ?? null),
});
const trickMap = buildTrickMap({
  open: (puzzle) => puzzleCard.open(puzzle, tricks.puzzles[puzzle.id], themePreference.theme),
  back: () => showScreen('title'),
});
const puzzleCard = buildPuzzleCard({
  play: (puzzle) => startPuzzle(puzzle),
  close: () => {
    puzzleCard.close();
    trickMap.focusNext();
  },
});
const trickPanel = buildTrickPanel();
const solveCard = buildSolveCard({
  next: () => {
    const following = trickPlay.next();
    if (following) startPuzzle(following);
  },
  retry: () => trickPlay.retry(),
  challenge: () => offerChallenge(trickPlay.challenge()),
  packs: () => showScreen('tricks'),
});
const trickPlay = new TrickPlay(
  context,
  trickPanel,
  solveCard,
  { saved: saveTricks, packs: () => showScreen('tricks'), challenge: offerChallenge },
  () => tricks,
);
const challengeMaker = buildChallengeMaker({ close: () => closeChallengeMaker() });
const challengeIntro = buildChallengeIntro({
  play: () => startChallenge(),
  decline: () => {
    challengeIntro.hide();
    forgetChallengeLink();
    showScreen('title');
  },
});
const challengeResult = buildChallengeResult({
  reply: () => offerChallenge(challengePlay.reply()),
  retry: () => challengePlay.retry(),
  menu: () => {
    forgetChallengeLink();
    showScreen('title');
  },
});
const challengeProblem = buildChallengeProblem({
  menu: () => {
    challengeProblem.hide();
    forgetChallengeLink();
    showScreen('title');
  },
});
const challengePlay = new ChallengePlay(context, challengeResult);
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
    restart: () => restart(),
    leave: () => leave(),
  },
  howToPlayHref,
  hallHref,
);
const victory = buildVictoryScreen(
  {
    rematch: () => startQuickMatch(),
    settings: () => showScreen('quick'),
    challenge: () => offerChallenge(session?.challenge() ?? null),
  },
  hallHref,
);
const results = buildResultsScreen({
  next(tourStage) {
    showScreen('tour');
    stageCard.open(tourStage, tour.stages[tourStage.id], settings.aimAssist);
  },
  retry: (tourStage) => startStage(tourStage),
  map: () => showScreen('tour'),
  challenge: () => offerChallenge(session?.challenge() ?? null),
});

root.append(
  hud.element,
  trickPanel.element,
  titleScreen.element,
  tourMap.element,
  dailyScreen.element,
  trickMap.element,
  quickScreen.element,
  preferences.element,
  wardrobe.element,
  badges.element,
  stageCard.element,
  puzzleCard.element,
  pauseMenu.element,
  victory.element,
  results.element,
  dailyResults.element,
  solveCard.element,
  challengeIntro.element,
  challengeResult.element,
  challengeProblem.element,
  challengeMaker.element,
  buildRotateHint(),
);

/** Overlays that end a match or an attempt: while one is up, leaving loses nothing. */
const ENDINGS = [victory, results, dailyResults, solveCard, challengeResult];

mountHallButton({
  corner: 'bottom-left',
  // Leaving mid-match loses the score, so ask first.
  beforeLeave: () => {
    if (!session || ENDINGS.some((ending) => !ending.element.hidden)) return true;
    openPause('Leave the match? The score will not be kept.');
    return false;
  },
});

const SCREENS: Record<Exclude<Screen, 'match'>, HTMLElement> = {
  title: titleScreen.element,
  tour: tourMap.element,
  daily: dailyScreen.element,
  tricks: trickMap.element,
  quick: quickScreen.element,
  settings: preferences.element,
  wardrobe: wardrobe.element,
  badges: badges.element,
};

const menus = new MenuNavigator(
  () =>
    [
      challengeMaker.element,
      pauseMenu.element,
      challengeProblem.element,
      challengeIntro.element,
      results.element,
      victory.element,
      dailyResults.element,
      solveCard.element,
      challengeResult.element,
      stageCard.element,
      puzzleCard.element,
      ...Object.values(SCREENS),
    ].find((element) => !element.hidden) ?? null,
  () => {
    if (toasts.visible) toasts.dismiss();
    else if (!challengeMaker.element.hidden) closeChallengeMaker();
    else if (!challengeIntro.element.hidden) {
      challengeIntro.hide();
      forgetChallengeLink();
    } else if (!pauseMenu.element.hidden) resume();
    else if (!stageCard.element.hidden) {
      stageCard.close();
      tourMap.focusNext();
    } else if (!puzzleCard.element.hidden) {
      puzzleCard.close();
      trickMap.focusNext();
    } else if (!results.element.hidden) showScreen('tour');
    else if (!dailyResults.element.hidden) showScreen('daily');
    else if (!solveCard.element.hidden) showScreen('tricks');
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

function hideOverlays() {
  stageCard.close();
  puzzleCard.close();
  pauseMenu.close();
  victory.hide();
  results.hide();
  dailyResults.hide();
  challengeIntro.hide();
  challengeResult.hide();
  challengeProblem.hide();
  challengeMaker.close();
}

function showScreen(next: Exclude<Screen, 'match'>) {
  endPlay();
  screen = next;
  document.body.dataset.screen = next;
  for (const [name, element] of Object.entries(SCREENS)) element.hidden = name !== next;
  hideOverlays();
  title ??= new TitleShow(stage, settings.weather, themePreference.theme, outfits()[0]);
  stage.setCrt(settings.crt);
  audio.playMusic(THEME);
  controls.disable();
  toasts.flush();
  refreshDailyNote();

  if (next === 'tour') tourMap.refresh(tour);
  if (next === 'tricks') trickMap.refresh(tricks);
  if (next === 'daily') dailyScreen.refresh(dailyView());
  if (next === 'quick') quickScreen.refresh(settings, tour.rivalsBeaten);
  if (next === 'settings') preferences.refresh(settings);
  if (next === 'wardrobe') wardrobe.refresh(wardrobeState());
  if (next === 'badges') badges.show();
  if (next === 'tour') tourMap.focusNext();
  else if (next === 'tricks') trickMap.focusNext();
  else SCREENS[next].querySelector<HTMLElement>('.button--primary, button, a[href]')?.focus();
}

/** Leaves the menus for the playfield. */
function enterPlay(next: Mode) {
  endPlay();
  mode = next;
  title = null;
  screen = 'match';
  document.body.dataset.screen = 'match';
  document.body.dataset.mode = next.kind;
  for (const element of Object.values(SCREENS)) element.hidden = true;
  hideOverlays();
  stage.setCrt(settings.crt);
  controls.enable();
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

/** Today's scored attempt (picked up where it was left), or a practice run. */
function startDailyAttempt(scored: boolean) {
  const skyline = dailyFor(new Date());
  if (scored && dailyBook.resultOf(skyline.day.key)) return;
  const aims = scored ? dailyBook.unfinished(skyline) : [];
  const start = resumeDaily(
    skyline,
    aims.map(([angle, velocity]) => ({ angle, velocity })),
  ).state;
  const setup = dailySetup(skyline, start, scored, settings, outfits());
  startSession(setup, { kind: 'daily', skyline, scored });
}

function startSession(setup: MatchSetup, next: Mode) {
  enterPlay(next);
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
    onThrow: (report) => {
      reporter?.throwMade(report);
      if (next.kind === 'daily' && next.scored) {
        const { input } = report.result.shot;
        dailyBook.throwMade(next.skyline, [input.angle, input.velocity]);
      }
    },
    onTurnStart: () => toasts.hold(),
    onPoint: () => toasts.flush(),
    onMatchOver: (summary) => {
      controls.disable();
      if (next.kind === 'daily') {
        finishDaily(next.skyline, next.scored);
        toasts.flush();
        return;
      }
      const opponent = setup.players[1];
      const xp =
        reporter?.matchOver({
          won: summary.winner === 0,
          mode: next.kind === 'tour' ? 'tour' : 'quick',
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

function startPuzzle(puzzle: Puzzle) {
  enterPlay({ kind: 'trick', puzzle });
  shots = trickPlay.start(puzzle);
}

/** The challenge from the address, waiting for the player to watch it. */
let pendingChallenge: Challenge | null = null;

function openChallengeLink() {
  if (!location.hash.startsWith('#c=')) return;
  const decoded = decodeChallenge(location.hash.slice('#c='.length));
  const rebuilt = typeof decoded === 'string' ? decoded : rebuildChallenge(decoded);
  if (typeof rebuilt === 'string') {
    challengeProblem.show(rebuilt === 'missing' ? 'damaged' : rebuilt);
    return;
  }
  pendingChallenge = rebuilt.challenge;
  challengeIntro.show(rebuilt.challenge.nickname, whereText(rebuilt));
}

function startChallenge() {
  if (!pendingChallenge) return;
  const rebuilt = rebuildChallenge(pendingChallenge);
  if (typeof rebuilt === 'string') return;
  enterPlay({ kind: 'challenge' });
  shots = challengePlay.start(rebuilt);
}

function forgetChallengeLink() {
  pendingChallenge = null;
  if (location.hash.startsWith('#c=')) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
}

/** Opens the maker for a challenge built from a hit; the play underneath waits. */
function offerChallenge(challenge: Challenge | null) {
  if (!challenge) return;
  const rebuilt = rebuildChallenge(challenge);
  if (typeof rebuilt === 'string') return;
  const play = session ?? shots;
  if (play) play.paused = true;
  controls.disable();
  const address = `${location.origin}${location.pathname}`;
  challengeMaker.open({
    summary: `${whereText(rebuilt)}. They get one throw from the same spot to match your shot.`,
    message: (nickname) => {
      const link = `${address}#c=${encodeChallenge({ ...challenge, nickname })}`;
      const who = nickname ? `${nickname} challenges you` : 'I challenge you';
      return `${who} to a shot in Skyline Showdown. Can you match it?\n${link}`;
    },
  });
}

function closeChallengeMaker() {
  challengeMaker.close();
  const play = session ?? shots;
  if (!play) return;
  play.paused = false;
  const ended = ENDINGS.some((ending) => !ending.element.hidden);
  if (!ended) {
    controls.enable();
    stage.surface.focus();
  }
}

function finishDaily(skyline: DailySkyline, scored: boolean) {
  const state = session?.state ?? startDaily(skyline);
  const outcome = outcomeOf(state) ?? 'outOfThrows';
  const aims = scored
    ? dailyBook.unfinished(skyline)
    : (session?.roundAims() ?? []).map(({ angle, velocity }): [number, number] => [
        angle,
        velocity,
      ]);
  const result: DailyResult = { outcome, throws: state.round.throws, aims };
  let xp = 0;
  if (scored && dailyBook.finish(skyline, result)) {
    xp = reportDaily(pass, skyline.day.number, result, dailyBook.streak(skyline.day.key));
  }
  showDailyResults(skyline, scored, result, xp);
}

function showDailyResults(
  skyline: DailySkyline,
  scored: boolean,
  result = dailyBook.resultOf(skyline.day.key),
  xp = 0,
) {
  if (!result) return;
  dailyResults.show({
    skyline,
    result,
    scored,
    shareLine: scored ? shareLine(skyline, startDaily(skyline).round.wind, result) : null,
    streak: scored ? dailyBook.streak(skyline.day.key) : null,
    xp,
    challengeable: !scored && session?.challenge() != null,
    now: new Date(),
    theme: themePreference.theme,
  });
}

function dailyView() {
  const now = new Date();
  const skyline = dailyFor(now);
  return {
    skyline,
    result: dailyBook.resultOf(skyline.day.key),
    inProgress: dailyBook.unfinished(skyline).length,
    streak: dailyBook.streak(skyline.day.key),
    entries: dailyBook.entries(),
    now,
    theme: themePreference.theme,
  };
}

/** The gentle reminder on the title screen while today's daily is still open. */
function refreshDailyNote() {
  const skyline = dailyFor(new Date());
  const result = dailyBook.resultOf(skyline.day.key);
  const streak = dailyBook.streak(skyline.day.key);
  if (result) {
    const score = result.outcome === 'hit' ? `${result.throws}/10` : 'X/10';
    titleScreen.showDaily(`✓ ${score}${streak.current > 1 ? ` · 🔥${streak.current}` : ''}`, false);
  } else {
    titleScreen.showDaily(`#${skyline.day.number} is open`, true);
  }
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
    challengeable: session?.challenge() != null,
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
  victory.show(summary, line, session?.challenge() != null);
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
  if (!session && !shots) {
    title = new TitleShow(stage, settings.weather, themePreference.theme, outfits()[0]);
  }
  applyPageTheme();
  titleScreen.showTheme(themePreference.theme);
  if (screen === 'wardrobe') wardrobe.refresh(wardrobeState());
  if (screen === 'daily') dailyScreen.refresh(dailyView());
});

function endPlay() {
  session?.dispose();
  session = null;
  trickPlay.stop();
  challengePlay.stop();
  shots = null;
}

function openPause(message: string | null = null) {
  const play = session ?? shots;
  if (!play || ENDINGS.some((ending) => !ending.element.hidden)) return;
  if (!challengeMaker.element.hidden) return;
  play.paused = true;
  controls.disable();
  pauseMenu.open(pauseLabels(), message);
}

function pauseLabels() {
  switch (mode.kind) {
    case 'tour':
      return { restart: 'Restart stage', leave: 'Back to the map' };
    case 'daily':
      // The scored attempt is kept throw by throw; it can be left, never restarted.
      return { restart: mode.scored ? null : 'Restart practice', leave: 'Back to the daily' };
    case 'trick':
      return { restart: 'Retry the puzzle', leave: 'Back to the packs' };
    case 'challenge':
      return { restart: 'Try again', leave: 'Main menu' };
    default:
      return { restart: 'Restart match', leave: 'Match settings' };
  }
}

function restart() {
  switch (mode.kind) {
    case 'tour':
      startStage(mode.stage);
      break;
    case 'daily':
      if (!mode.scored) startDailyAttempt(false);
      break;
    case 'trick':
      resume();
      trickPlay.retry();
      break;
    case 'challenge':
      resume();
      challengePlay.retry();
      break;
    default:
      startQuickMatch();
  }
}

function leave() {
  const destinations: Record<Mode['kind'], Exclude<Screen, 'match'>> = {
    quick: 'quick',
    tour: 'tour',
    daily: 'daily',
    trick: 'tricks',
    challenge: 'title',
  };
  if (mode.kind === 'challenge') forgetChallengeLink();
  showScreen(destinations[mode.kind]);
}

function resume() {
  const play = session ?? shots;
  if (!play) return;
  pauseMenu.close();
  play.paused = false;
  controls.enable();
  stage.surface.focus();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (session ?? shots) && !(session ?? shots)?.paused) openPause();
});

createLoop({
  update(step) {
    menus.update();
    const play = session ?? shots;
    if (play) {
      const wasPaused = play.paused;
      play.update(step);
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
openChallengeLink();
// A challenge link pasted into a tab that already has the game open.
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#c=')) return;
  showScreen('title');
  openChallengeLink();
});
