import './styles.css';

import { createAudio } from '@shared/audio';
import { createDailyLog, dayKey } from '@shared/daily';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { reportPlay, takeResumeRequest } from '@shared/last-played';
import { createLoop } from '@shared/loop';
import { connectPass, mountUnlockToasts } from '@shared/pass';
import { randomSeed } from '@shared/rng';
import { createStore } from '@shared/storage';
import manifest from '../pass.manifest';
import { TITLE_THEME } from './audio/music';
import { playEvents } from './audio/sounds';
import { Soundscape } from './audio/soundscape';
import { botControls, createBotMemory, type BotMemory } from './engine/bot';
import { TICKS_PER_SECOND } from './engine/constants';
import type { Side } from './engine/map';
import type { Controls } from './engine/world';
import { SEA_CHAPTERS, SEA_TOTAL_STARS, type SeaChapter } from './game/at-sea';
import { CHAPTERS, TOTAL_STARS, type ChapterCard } from './game/campaign';
import { combine, GameKeys, PilotInput } from './game/controls';
import { DAILY, dailyResultOf, isDailyResult, shareText, type DailyResult } from './game/daily';
import { planDemo, planMode, type ModeId, type ModePlan, type ModeRequest } from './game/modes';
import { PassReporter } from './game/pass-report';
import { chapterStars, describeOutcome } from './game/results';
import { Session, type RoundRecord, type SessionOutcome } from './game/session';
import { parseSortieCode, sortieCode, type SortieOptions } from './game/sortie';
import { TouchControls } from './game/touch';
import {
  isChapterOpen,
  loadProgress,
  recordChapter,
  saveProgress,
  starsOf,
  totalStars,
} from './progress';
import { STANDARD_PAINT_JOB, type PaintJob } from './render/liveries';
import { Stage } from './render/stage';
import type { CameraView } from './render/view';
import {
  keysFor,
  spareKeysFor,
  LightPreference,
  sanitiseSettings,
  type KeySetId,
  type Settings,
} from './settings';
import { THEMES } from './themes';
import { buildCampaignScreen } from './ui/campaign-screen';
import { buildDailyScreen } from './ui/daily-screen';
import { buildDogfightScreen } from './ui/dogfight-screen';
import { h } from './ui/dom';
import { buildHangarScreen } from './ui/hangar-screen';
import { MenuNavigator } from './ui/menu-nav';
import { buildPauseMenu, buildResults } from './ui/overlays';
import { buildSettingsScreen } from './ui/settings-screen';
import { buildSortieScreen } from './ui/sortie-screen';
import { buildTitleScreen } from './ui/title-screen';
import { buildTwoPlayerScreen } from './ui/two-player-screen';

type Screen = 'title' | ModeId | 'hangar' | 'settings' | 'play';

/** The game's colour in the Hall and on its badges. */
const ACCENT = '#d24f33';
const GAME = 'mind-the-ox';

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');

const store = createStore(GAME);
let settings = sanitiseSettings(store.get<unknown>('settings', null));
const light = new LightPreference(store);
const progress = loadProgress(store);
const dailyLog = createDailyLog<DailyResult>(store, 'daily');
let paintJob = loadPaintJob();
const pass = connectPass(manifest);
const reporter = new PassReporter(pass);
const audio = createAudio();
const soundscape = new Soundscape(() => audio.mix);
const toasts = mountUnlockToasts(pass, { accent: ACCENT, audio });

// A seed in the address (?seed=81) flies the same battlefield, for sharing a game or testing one;
// ?pilot=bot hands the first plane to the scripted pilot, for the playtests.
const params = new URLSearchParams(location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const scriptedPilot = params.get('pilot') === 'bot';
// ?sortie=<code> opens a shared Custom Sortie, ready to fly.
const sharedSortie = parseSortieCode(params.get('sortie') ?? '');
let botMemory: BotMemory = createBotMemory();
const nextSeed = () => (Number.isFinite(seedParam) ? seedParam : randomSeed());
const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = matchMedia('(pointer: coarse)');

const stage = new Stage(root);
const touch = new TouchControls();
const gameKeys = new GameKeys();
const caption = h('p', { class: 'caption', hidden: true, 'aria-live': 'polite' });
const pauseButton = h(
  'button',
  { class: 'pause-button', type: 'button', 'aria-label': 'Pause', hidden: true },
  'II',
);
root.append(caption, touch.element, pauseButton);
pauseButton.addEventListener('click', () => openPause());

let screen: Screen = 'title';
let session: Session | null = null;
let demo: Session | null = null;
let pilots: PilotInput[] = [];
let paused = false;
let lastRequest: ModeRequest | null = null;

const hallHref = hallUrl();
const howToPlayHref = `${hallHref}#/games/${GAME}/how-to-play`;

const title = buildTitleScreen(
  {
    open: (mode) => openMode(mode),
    hangar: () => showScreen('hangar'),
    settings: () => showScreen('settings'),
    theme(theme) {
      saveSettings({ ...settings, theme });
      startDemo();
      refreshStatuses();
    },
    toggleLight: () => light.choose(light.lighting === 'day' ? 'night' : 'day'),
    secret: () => findHangar(),
  },
  howToPlayHref,
);
const campaign = buildCampaignScreen(
  {
    id: 'campaign',
    title: 'Campaign',
    unit: 'Chapter',
    chapters: CHAPTERS,
    blurb: 'chapter by chapter, faster every time, as in 1984',
    firstStar: 'Win the round',
  },
  {
    progress,
    theme: () => settings.theme,
    play: (chapter) => startGame({ kind: 'campaign', chapter: chapter.id }),
    back: () => showScreen('title'),
  },
);
const atSea = buildCampaignScreen(
  {
    id: 'at-sea',
    title: 'At Sea',
    unit: 'Mission',
    chapters: SEA_CHAPTERS,
    blurb: 'off a carrier, from deck trials to a carrier duel',
    firstStar: 'Complete the mission',
    advice: (chapter, theme) =>
      (chapter as SeaChapter).loadout === 'torpedo'
        ? `Suggested: a ${theme.torpedo}. Swap on deck with the loadout key.`
        : null,
  },
  {
    progress,
    theme: () => settings.theme,
    play: (chapter) => startGame({ kind: 'at-sea', chapter: chapter.id }),
    back: () => showScreen('title'),
  },
);
const sortie = buildSortieScreen({
  options: () => settings.sortie,
  change: (next) => saveSettings({ ...settings, sortie: next }),
  play: () => startGame({ kind: 'sortie', options: settings.sortie }),
  link: (options) => sortieLink(options),
  back: () => showScreen('title'),
});
const dogfight = buildDogfightScreen({
  settings: () => settings,
  progress,
  theme: () => settings.theme,
  change: (choice) => saveSettings({ ...settings, dogfight: choice }),
  play: () => startGame({ kind: 'dogfight', ...settings.dogfight }),
  back: () => showScreen('title'),
});
const twoPlayer = buildTwoPlayerScreen({
  settings: () => settings,
  change: (style) => saveSettings({ ...settings, twoPlayer: style }),
  play: () => startGame({ kind: 'two-player', style: settings.twoPlayer }),
  back: () => showScreen('title'),
});
const daily = buildDailyScreen({
  log: dailyLog,
  play: (practice) => startGame({ kind: 'daily', day: DAILY.on(new Date()), practice }),
  back: () => showScreen('title'),
});
const hangar = buildHangarScreen({
  job: () => paintJob,
  change(job) {
    paintJob = job;
    store.set('paintJob', job);
  },
  owns: (id) => owns(id),
  unlockHint: (id) => unlockHint(id),
  theme: () => settings.theme,
  lighting: () => light.lighting,
  hangarFound: () => progress.hangarFound,
  secretWeapons: () => settings.secretWeapons,
  setSecretWeapons: (on) => saveSettings({ ...settings, secretWeapons: on }),
  back: () => showScreen('title'),
});
const settingsScreen = buildSettingsScreen({
  settings: () => settings,
  save(next) {
    const themeChanged = next.theme !== settings.theme;
    const cameraChanged = next.camera !== settings.camera;
    saveSettings(next);
    if (themeChanged && !session) startDemo();
    if (cameraChanged)
      void stage.configure(session ? (session.plan.humans.length as 1 | 2) : 1, next.camera);
  },
  light,
  audio,
  back: () => (session ? openPause() : showScreen('title')),
});
const pauseMenu = buildPauseMenu(
  {
    resume: () => resume(),
    restart: () => lastRequest && startGame(lastRequest),
    menu: () => showScreen('title'),
    camera: (view) => useCamera(view),
    settings: () => {
      pauseMenu.close();
      settingsScreen.refresh();
      settingsScreen.element.hidden = false;
      settingsScreen.focusFirst();
    },
  },
  howToPlayHref,
  hallHref,
);
const results = buildResults();
const screens = {
  title,
  campaign,
  'at-sea': atSea,
  sortie,
  dogfight,
  'two-player': twoPlayer,
  daily,
  hangar,
  settings: settingsScreen,
} as const;

root.append(
  ...Object.values(screens).map((built) => built.element),
  pauseMenu.element,
  results.element,
);

mountHallButton({
  corner: 'top-right',
  // Leaving mid-game loses it, so pause and ask first.
  beforeLeave: () => {
    if (!session || session.phase === 'over' || paused) return true;
    openPause('Leave the battle? This game will not be kept.');
    return false;
  },
});

const menus = new MenuNavigator(
  () =>
    [
      pauseMenu.element,
      results.element,
      ...Object.values(screens).map((built) => built.element),
    ].find((element) => !element.hidden) ?? null,
  () => {
    if (toasts.visible) {
      toasts.dismiss();
      return;
    }
    if (!pauseMenu.element.hidden) resume();
    else if (session && !settingsScreen.element.hidden) {
      settingsScreen.element.hidden = true;
      openPause();
    } else if (screen !== 'title' && screen !== 'play') showScreen('title');
  },
);

function saveSettings(next: Settings) {
  settings = next;
  store.set('settings', settings);
  title.showTheme(settings.theme, light.lighting);
}

function loadPaintJob(): PaintJob {
  const stored = store.get<Partial<PaintJob>>('paintJob', {});
  return { ...STANDARD_PAINT_JOB, ...stored };
}

function owns(id: string): boolean {
  return (
    manifest.cosmetics.some((cosmetic) => cosmetic.id === id) &&
    pass.isUnlocked(id as (typeof manifest.cosmetics)[number]['id'])
  );
}

function unlockHint(id: string): string {
  const cosmetic = manifest.cosmetics.find((candidate) => candidate.id === id);
  if (!cosmetic) return '';
  if ('level' in cosmetic.unlock) return `Reach Arcade level ${cosmetic.unlock.level}`;
  const badgeId = cosmetic.unlock.badge;
  const badge = manifest.badges.find((candidate) => candidate.id === badgeId);
  return badge?.tier === 'secret' ? 'Earn a secret badge' : `Earn “${badge?.name ?? badgeId}”`;
}

/** 1984's hidden switch, found: the Secret Hangar opens for good. */
function findHangar() {
  if (!progress.hangarFound) {
    progress.hangarFound = true;
    saveProgress(store, progress);
    reporter.hangarFound();
    toasts.flush();
  }
  showScreen('hangar');
}

function openMode(mode: ModeId) {
  if (mode === 'classic') startGame({ kind: 'classic' });
  else showScreen(mode);
}

function showScreen(next: keyof typeof screens) {
  endSession();
  screen = next;
  document.body.dataset.screen = next;
  for (const [id, built] of Object.entries(screens)) built.element.hidden = id !== next;
  pauseMenu.close();
  results.hide();
  caption.hidden = true;
  if (next === 'campaign') campaign.refresh();
  if (next === 'at-sea') atSea.refresh();
  if (next === 'sortie') sortie.refresh();
  if (next === 'dogfight') dogfight.refresh();
  if (next === 'two-player') twoPlayer.refresh();
  if (next === 'daily') daily.refresh(new Date());
  if (next === 'hangar') hangar.refresh();
  if (next === 'settings') settingsScreen.refresh();
  if (next === 'title') refreshStatuses();
  screens[next].focusFirst();
  if (!demo) startDemo();
  toasts.flush();
}

/** The battle behind the menus: computer pilots at it, the camera riding with one of them. */
function startDemo() {
  demo = new Session({
    plan: planDemo(Number.isFinite(seedParam) ? seedParam : 1917),
    theme: settings.theme,
    paintJob,
    reducedMotion: reducedMotionQuery.matches,
    cga: false,
  });
  void stage.configure(1, settings.camera);
  stage.setFilter(false);
}

async function startGame(request: ModeRequest) {
  endSession();
  if (request.kind === 'campaign' || request.kind === 'at-sea') {
    const chapters = request.kind === 'campaign' ? CHAPTERS : SEA_CHAPTERS;
    const index = chapters.findIndex((chapter) => chapter.id === request.chapter);
    if (!isChapterOpen(progress, index, chapters)) return;
  }
  lastRequest = request;
  const plan = planMode(request, {
    seed: nextSeed(),
    flight: request.kind === 'classic' ? 'classic' : settings.flight,
    autoRoll: settings.autoRoll,
    secretWeapons: progress.hangarFound && settings.secretWeapons && request.kind !== 'daily',
    landingAssist: settings.landingAssist,
    loadout: settings.loadout,
  });
  screen = 'play';
  document.body.dataset.screen = 'play';
  document.body.dataset.mode = request.kind;
  for (const built of Object.values(screens)) built.element.hidden = true;
  pauseMenu.close();
  results.hide();
  toasts.hold();
  demo = null;
  reporter.earned = 0;

  const cga = request.kind === 'classic' && settings.cga;
  const game = new Session({
    plan,
    theme: plan.theme ?? settings.theme,
    paintJob,
    reducedMotion: reducedMotionQuery.matches,
    cga,
  });
  game.onEvents = (events, world) => {
    const listener = game.humanPlane(0);
    playEvents(
      audio,
      events,
      world,
      new Set(plan.humans.map((_, player) => game.humanPlane(player)?.id ?? -1)),
      listener?.x ?? world.map.width / 2,
      game.theme,
    );
  };
  game.onRoundEnd = (record) => roundEnded(game, record);
  game.onOver = (outcome) => finish(outcome);
  session = game;
  paused = false;
  botMemory = createBotMemory();
  await stage.configure(plan.humans.length as 1 | 2, settings.camera);
  stage.setFilter(cga);
  buildPilots(plan);
  reportPlay({
    game: GAME,
    mode: request.kind,
    item:
      request.kind === 'campaign' || request.kind === 'at-sea'
        ? request.chapter
        : request.kind === 'sortie'
          ? sortieCode(request.options)
          : undefined,
    label: plan.label,
  });
  audio.stopMusic();
  showTouch();
  pauseButton.hidden = false;
  stage.focus();
}

/** Keys and pads for each person: alone, every pad and the chosen layout; two, one half and one pad each. */
function buildPilots(plan: ModePlan) {
  for (const pilot of pilots) pilot.dispose();
  const sets: KeySetId[] = plan.humans.length === 1 ? ['solo'] : ['left', 'right'];
  pilots = sets.map(
    (set, player) =>
      new PilotInput(
        keysFor(settings, set),
        plan.humans.length === 1 ? 'any' : (player as 0 | 1),
        spareKeysFor(settings, set),
      ),
  );
}

function showTouch() {
  const wanted = settings.touch === 'on' || (settings.touch === 'auto' && coarsePointer.matches);
  const solo = session?.plan.humans.length === 1;
  touch.setVisible(Boolean(session) && wanted && solo && !paused);
  touch.setSecretWeapons(Boolean(session?.world.rules.secretWeapons));
}

function roundEnded(game: Session, record: RoundRecord) {
  const players = game.plan.humans.map((_, player) => {
    const plane = game.humanPlane(player);
    return {
      side: (plane?.side ?? 0) as Side,
      pilot: plane ? record.tally.pilot(plane.id) : undefined,
    };
  });
  reporter.roundEnded(record, game.plan, players);
  toasts.flush();
}

function finish(outcome: SessionOutcome) {
  const request = outcome.plan.request;
  let stars: [boolean, boolean, boolean] | undefined;
  let newStars = 0;
  let share: string | undefined;
  let note: string | undefined;
  let dailyCounted = false;
  let dailyStreak = 0;
  const round = outcome.rounds[outcome.rounds.length - 1];
  const won = round?.winner === 0;

  if ((request.kind === 'campaign' || request.kind === 'at-sea') && outcome.plan.chapter) {
    stars = chapterStars(outcome.plan.chapter, round);
    newStars = recordChapter(progress, outcome.plan.chapter.id, stars, outcome.scores[0]);
  }
  if (request.kind === 'sortie') {
    share = `Mind the Ox · Custom Sortie ${sortieCode(request.options)} ${sortieLink(request.options)}`;
    note = won ? 'Share the link and see if a friend can do it too. ' : '';
  }
  if (request.kind === 'classic' && outcome.scores[0] > progress.classicBest) {
    note = progress.classicBest > 0 ? 'A new best. ' : '';
    progress.classicBest = outcome.scores[0];
  }
  if (request.kind === 'dogfight' && won) {
    progress.dogfightWins[request.level] = (progress.dogfightWins[request.level] ?? 0) + 1;
  }
  if (request.kind === 'daily') {
    const result = dailyResultOf(outcome);
    if (!request.practice) dailyCounted = dailyLog.record(request.day.key, result);
    const kept = dailyLog.get(request.day.key);
    dailyStreak = dailyLog.streak(dayKey(new Date())).current;
    share = shareText(request.day, kept && isDailyResult(kept) ? kept : result);
    note = request.practice
      ? 'Practice: the first sortie of the day is the one that counts. '
      : dailyCounted
        ? `${dailyStreak}-day streak. `
        : '';
  }
  saveProgress(store, progress);
  reporter.matchOver(outcome, {
    newStars,
    totalStars: totalStars(progress),
    chaptersWon: CHAPTERS.filter((chapter) => starsOf(progress, chapter.id)[0]).length,
    seaStars: totalStars(progress, SEA_CHAPTERS),
    seaMissionsWon: SEA_CHAPTERS.filter((chapter) => starsOf(progress, chapter.id)[0]).length,
    dailyCounted,
    dailyStreak,
    classicBest: progress.classicBest,
  });

  const chapters: readonly ChapterCard[] = request.kind === 'at-sea' ? SEA_CHAPTERS : CHAPTERS;
  const chapterIndex = outcome.plan.chapter ? chapters.indexOf(outcome.plan.chapter) : -1;
  const nextChapter: ChapterCard | undefined = chapters[chapterIndex + 1];
  const content = describeOutcome(
    outcome,
    {
      theme: outcome.plan.theme ?? settings.theme,
      stars,
      newStars,
      share,
      note,
      xp: reporter.earned,
    },
    {
      again: () =>
        request.kind === 'daily'
          ? startGame({ ...request, practice: true })
          : lastRequest && startGame(lastRequest),
      menu: () => showScreen('title'),
      next:
        (request.kind === 'campaign' || request.kind === 'at-sea') && won && nextChapter
          ? () => startGame({ kind: request.kind, chapter: nextChapter.id })
          : undefined,
      modeScreen:
        request.kind === 'campaign' ||
        request.kind === 'at-sea' ||
        request.kind === 'sortie' ||
        request.kind === 'dogfight' ||
        request.kind === 'daily'
          ? () => showScreen(request.kind)
          : undefined,
    },
  );
  results.show(content);
  document.body.dataset.phase = 'results';
  document.body.dataset.score = String(outcome.scores[0]);
  document.body.dataset.won = String(won);
  touch.setVisible(false);
  pauseButton.hidden = true;
  audio.playMusic(TITLE_THEME);
  toasts.flush();
}

function endSession() {
  session = null;
  paused = false;
  delete document.body.dataset.phase;
  delete document.body.dataset.round;
  delete document.body.dataset.score;
  delete document.body.dataset.won;
  for (const pilot of pilots) pilot.dispose();
  pilots = [];
  touch.setVisible(false);
  pauseButton.hidden = true;
  delete document.body.dataset.mode;
}

function openPause(message: string | null = null) {
  if (!session || session.phase === 'over' || !results.element.hidden) return;
  paused = true;
  // The flying keys would swallow Space and the arrows; the pause card needs them.
  for (const pilot of pilots) pilot.dispose();
  pilots = [];
  touch.setVisible(false);
  pauseMenu.open(settings.camera, message);
}

function resume() {
  if (!session) return;
  pauseMenu.close();
  settingsScreen.element.hidden = true;
  paused = false;
  buildPilots(session.plan);
  showTouch();
  stage.focus();
}

function useCamera(camera: CameraView) {
  saveSettings({ ...settings, camera });
  pauseMenu.showCamera(camera);
  void stage.configure((session?.plan.humans.length ?? 1) as 1 | 2, camera);
}

function refreshStatuses() {
  const stars = totalStars(progress);
  const nextChapter = CHAPTERS.find(
    (chapter, index) => isChapterOpen(progress, index) && !starsOf(progress, chapter.id)[0],
  );
  title.setStatus(
    'campaign',
    `★ ${stars} / ${TOTAL_STARS}${nextChapter ? ` · next: ${nextChapter.title[settings.theme]}` : ' · all won'}`,
  );
  const seaStars = totalStars(progress, SEA_CHAPTERS);
  const nextMission = SEA_CHAPTERS.find(
    (chapter, index) =>
      isChapterOpen(progress, index, SEA_CHAPTERS) && !starsOf(progress, chapter.id)[0],
  );
  title.setStatus(
    'at-sea',
    `★ ${seaStars} / ${SEA_TOTAL_STARS}${nextMission ? ` · next: ${nextMission.title[settings.theme]}` : ' · all complete'}`,
    seaStars === 0 ? 'New' : undefined,
  );
  title.setStatus('sortie', `Code ${sortieCode(settings.sortie)}`, undefined);
  const rival = THEMES[settings.theme].rivals[settings.dogfight.level];
  title.setStatus('dogfight', `1 vs ${settings.dogfight.opponents} · ${rival.name}`);
  title.setStatus(
    'classic',
    progress.classicBest > 0
      ? `Best ${progress.classicBest.toLocaleString('en')}`
      : 'Until the last plane, round after round',
  );
  const today = DAILY.on(new Date());
  const done = dailyLog.get(today.key);
  const streak = dailyLog.streak(today.key).current;
  title.setStatus(
    'daily',
    done
      ? `#${today.number} done · ${done.score.toLocaleString('en')}${streak > 1 ? ` · ${streak}-day streak` : ''}`
      : `#${today.number}${streak > 0 ? ` · ${streak}-day streak` : ''}`,
    done ? undefined : 'New today',
  );
  title.setStatus(
    'two-player',
    settings.twoPlayer === 'coop' ? 'Co-op, split screen' : 'Versus, split screen',
  );
  title.showTheme(settings.theme, light.lighting);
}

function applyLight() {
  document.documentElement.dataset.theme = light.lighting === 'day' ? 'light' : 'dark';
  title.showTheme(settings.theme, light.lighting);
}

/** Captions over the picture: the chapter or round as it starts, the flight into the sun, THE END. */
function updateCaption(game: Session) {
  const copy = THEMES[settings.theme];
  const { match } = game;
  let text: string | null = null;
  let kind = match.phase;
  if (match.phase === 'sun') text = copy.intoTheSun;
  else if (match.phase === 'the-end') text = copy.theEnd;
  else if (match.phase === 'playing' && match.phaseTicks < TICKS_PER_SECOND * 2.5) {
    const chapter = game.plan.chapter;
    if (chapter) text = chapter.title[settings.theme];
    else if (game.plan.sortie) text = game.plan.sortie.title;
    else if (match.round > 0) text = `Round ${match.round + 1}`;
    kind = 'playing';
  }
  caption.hidden = text === null;
  if (text !== null && caption.textContent !== text) caption.textContent = text;
  caption.dataset.phase = kind;
}

light.onChange(applyLight);
applyLight();
window.addEventListener('pointerdown', () => soundscape.unlock(), { once: true });
window.addEventListener('keydown', () => soundscape.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session && !paused) openPause();
});
coarsePointer.addEventListener('change', () => showTouch());

createLoop({
  stepSeconds: 1 / TICKS_PER_SECOND,
  update() {
    menus.update();
    if (session && !paused) {
      const asked: (Controls | undefined)[] = [];
      session.plan.humans.forEach((seat, player) => {
        const plane = session?.humanPlane(player);
        if (scriptedPilot && player === 0 && session && plane) {
          asked[seat] = botControls(session.world, plane, botMemory);
          return;
        }
        const fromKeys = pilots[player]?.controls();
        if (!fromKeys) return;
        const controls = combine(fromKeys, player === 0 ? touch.controls() : null);
        const swap = Boolean(pilots[player]?.takeSwap()) || (player === 0 && touch.takeSwap());
        if (swap && plane) controls.loadout = plane.loadout === 'bombs' ? 'torpedo' : 'bombs';
        asked[seat] = controls;
      });
      session.step(asked);
    } else if (!session && demo && !reducedMotionQuery.matches) demo.step([]);
  },
  render() {
    gameKeys.poll();
    for (const pilot of pilots) pilot.poll();
    const game = session ?? demo;
    if (session && gameKeys.pausePressed()) {
      if (paused) resume();
      else openPause();
    }
    if (session && !paused && gameKeys.cameraPressed())
      useCamera(settings.camera === 'side' ? 'diorama' : 'side');
    if (!game) return;
    game.advance(performance.now() / 1000);
    if (stage.paneCount > 0) stage.render(game, light.lighting, game === session);
    soundscape.update(session ? session.world : null, session?.humanPlane(0) ?? null, paused);
    if (session) {
      updateCaption(session);
      showLoadoutButton(session);
      // What the tests and the stylesheet sync to; once the results are up, they stay the phase.
      document.body.dataset.phase = results.element.hidden ? session.phase : 'results';
      document.body.dataset.round = String(session.match.round);
    }
  },
}).start();

/** The address that flies a sortie: this page, with its code. */
function sortieLink(options: SortieOptions): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('sortie', sortieCode(options));
  return url.toString();
}

/** On a carrier's deck, the touch screen's button for swapping bombs and a torpedo. */
function showLoadoutButton(game: Session) {
  const plane = game.humanPlane(0);
  const onDeck = plane?.state === 'parked' && plane.base.carrier !== undefined;
  touch.setLoadout(onDeck ? (plane.loadout === 'bombs' ? 'Torpedo' : 'Bombs') : null);
}

const resumeRequest = takeResumeRequest();
startDemo();
if (sharedSortie) {
  saveSettings({ ...settings, sortie: sharedSortie });
  showScreen('sortie');
} else if (resumeRequest?.mode === 'classic') void startGame({ kind: 'classic' });
else if (resumeRequest?.mode === 'campaign' || resumeRequest?.mode === 'at-sea') {
  const screenId = resumeRequest.mode;
  showScreen(screenId);
  const book = screenId === 'campaign' ? campaign : atSea;
  book.open(resumeRequest.item);
  book.focusFirst();
} else if (resumeRequest?.mode === 'sortie') {
  const options = parseSortieCode(resumeRequest.item ?? '');
  if (options) saveSettings({ ...settings, sortie: options });
  showScreen('sortie');
} else if (
  resumeRequest?.mode === 'dogfight' ||
  resumeRequest?.mode === 'daily' ||
  resumeRequest?.mode === 'two-player'
) {
  showScreen(resumeRequest.mode);
} else {
  showScreen('title');
  audio.playMusic(TITLE_THEME);
}
