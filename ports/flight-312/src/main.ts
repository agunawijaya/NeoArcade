import './styles/base.css';
import './styles/screens.css';
import './styles/hud.css';
import './styles/school.css';

import { createAudio } from '@shared/audio';
import {
  createDailyLog,
  dailyChallenge,
  nextDailyAt,
  shareText,
  copyText,
  type DailyDay,
} from '@shared/daily';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { reportPlay, takeResumeRequest } from '@shared/last-played';
import { connectPass, mountUnlockToasts } from '@shared/pass';
import { createStore } from '@shared/storage';
import manifest from '../pass.manifest';
import { Soundscape } from './audio/soundscape';
import { loadTerrainSource } from './data/unpack';
import {
  DAILY_APPROACH_LAUNCH,
  dailyApproach,
  dailySetup,
  dailyShareText,
  type DailyApproach,
  type DailyApproachResult,
} from './engine/daily-approach';
import {
  createFlight,
  STEP_SECONDS,
  type Deck,
  type Flight,
  type FlightSetup,
  type Level,
  type Mode,
} from './engine/flight';
import { scoreLanding, starsText, type LandingScore } from './engine/landing-score';
import type { Lesson } from './engine/lesson';
import { createLessonPilot, lessonPilotInput } from './engine/lesson-pilot';
import { destinationById, DESTINATIONS, type DestinationId } from './engine/navdata';
import { replayRecording, type Recording } from './engine/recording';
import { createTerrain, type Terrain } from './engine/terrain';
import {
  reportDaily,
  reportEvent,
  reportLesson,
  reportOutcome,
  type CosmeticId,
} from './game/pass-report';
import { ReplayDirector } from './game/replay-director';
import {
  cleanNickname,
  LINK_LIMIT,
  linkedReplay,
  packReplay,
  replayUrl,
  unpackReplay,
  type PackedReplay,
  type ReplayMeta,
} from './game/replay-link';
import { deleteReplay, saveReplay, savedReplays } from './game/replay-store';
import { LessonController, recordLesson, schoolRecord, type LessonVerdict } from './game/school';
import { FlightSession } from './game/session';
import { startGlassLab } from './lab/glass-lab';
import { startInstrumentLab } from './lab/instrument-lab';
import { startSceneLab } from './lab/scene-lab';
import { startWorldLab } from './lab/world-lab';
import { LESSONS } from './lessons';
import { defaultSettings, sanitiseSettings, type MenuTheme, type Settings } from './settings';
import { EnRouteChart } from './ui/chart';
import { dailyScreen } from './ui/daily-screen';
import { h } from './ui/dom';
import { challengeScreen, ReplayBar, replaysScreen, shareBox } from './ui/replay-screens';
import { lessonDebrief, schoolScreen } from './ui/school-screen';
import {
  briefingScreen,
  checklistPanel,
  LEVELS,
  pauseMenu,
  reportScreen,
  settingsScreen,
  titleScreen,
  type TitleChoice,
  type UnlockedCosmetics,
} from './ui/screens';
import type { Livery } from './world/jumbo';

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');

const GAME = 'flight-312';
const ACCENT = '#f2b13c';
const MODE_NAMES: Record<Mode, string> = {
  flight: 'Flight 312',
  takeoff: 'Takeoff',
  approach: 'Approach',
};

/** What a flight is, around its setup: a practice, today's daily, a lesson, someone's challenge. */
interface FlightContext {
  meta: ReplayMeta;
  daily?: { day: DailyDay; daily: DailyApproach; practice: boolean };
  lesson?: { lesson: Lesson; demo: boolean };
  challenge?: { who: string; score: LandingScore };
}

const store = createStore(GAME);
let settings: Settings = sanitiseSettings(store.get<unknown>('settings', defaultSettings()));
const audio = createAudio();
const sound = new Soundscape(() => audio.mix);
const pass = connectPass(manifest);
const toasts = mountUnlockToasts(pass, { accent: ACCENT, audio });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAILY = dailyChallenge({ game: GAME, launch: DAILY_APPROACH_LAUNCH });
const dailyLog = createDailyLog<DailyApproachResult>(store);
let terrain: Terrain | null = null;
let session: FlightSession | null = null;
let lastSetup: Partial<FlightSetup> = store.get<Partial<FlightSetup>>('lastSetup', {});
let lastFlight: { setup: FlightSetup; context: FlightContext } | null = null;
let overlay: HTMLElement | null = null;
let overlayTimer: ReturnType<typeof setInterval> | undefined;

applyMenuTheme(settings.menuTheme);

const unlockSound = () => sound.unlock();
addEventListener('pointerdown', unlockSound);
addEventListener('keydown', unlockSound);

const screen = h('div', { class: 'screens' });

function show(element: HTMLElement) {
  screen.replaceChildren(element);
  screen.hidden = false;
  // For the screenshot runs: which screen is up.
  document.body.dataset.ready = element.classList[1] ?? 'screen';
  const focusable = element.querySelector<HTMLElement>('button, input, select, a');
  focusable?.focus();
}

function loading(text: string): HTMLElement {
  const line = h('p', {}, text);
  show(h('section', { class: 'screen loading', role: 'status' }, line));
  return line;
}

function closeOverlay() {
  clearInterval(overlayTimer);
  overlay?.remove();
  overlay = null;
}

function openOverlay(element: HTMLElement) {
  closeOverlay();
  overlay = element;
  root?.append(element);
  element.querySelector<HTMLElement>('button')?.focus();
}

async function terrainReady(): Promise<Terrain> {
  terrain ??= createTerrain(await loadTerrainSource());
  return terrain;
}

function saveSettings(next: Settings) {
  settings = next;
  store.set('settings', settings);
  applyMenuTheme(settings.menuTheme);
  session?.applySettings(withUnlockedCosmetics(settings));
}

const LIVERY_COSMETICS = {
  sunrise: 'livery-sunrise',
  silver: 'livery-silver',
  night: 'livery-night',
  academy: 'livery-academy',
} as const;

function unlockedCosmetics(): UnlockedCosmetics {
  const liveries: Livery[] = ['brightwater'];
  for (const [livery, cosmetic] of Object.entries(LIVERY_COSMETICS) as [Livery, CosmeticId][])
    if (pass.isUnlocked(cosmetic)) liveries.push(livery);
  return { liveries, cap: pass.isUnlocked('glareshield-cap') };
}

/** A cosmetic the player has picked counts once the Pass has unlocked it. */
function withUnlockedCosmetics(chosen: Settings): Settings {
  const unlocked = unlockedCosmetics();
  return {
    ...chosen,
    livery: unlocked.liveries.includes(chosen.livery) ? chosen.livery : 'brightwater',
    glareshieldCap: chosen.glareshieldCap && unlocked.cap,
  };
}

/** "Follow this device" leaves the choice to the stylesheet's prefers-color-scheme. */
function applyMenuTheme(theme: MenuTheme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function title() {
  endSession();
  show(
    titleScreen(
      choose,
      () => show(settingsScreen(settings, saveSettings, title, unlockedCosmetics())),
      replays,
      hallUrl(),
    ),
  );
}

function choose(choice: TitleChoice) {
  if (choice === 'school') school();
  else if (choice === 'daily') void daily();
  else brief(choice);
}

function brief(mode: Mode, destination?: DestinationId) {
  endSession();
  const remembered = { ...lastSetup, ...(destination ? { destination } : {}) };
  show(
    briefingScreen(
      mode,
      remembered,
      settings.flightDeck,
      (setup) => {
        lastSetup = setup;
        store.set('lastSetup', setup);
        void fly(setup, { meta: { kind: mode } });
      },
      title,
    ),
  );
}

/** The world is WebGL; without it there is nothing to fly in. */
function canDrawTheWorld(): boolean {
  const probe = document.createElement('canvas');
  return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
}

/** Ends the flight on screen, if any; unlocks it held back for its report show now. */
function endSession() {
  closeOverlay();
  session?.dispose();
  session = null;
  toasts.flush();
}

function noWorld() {
  show(
    h(
      'section',
      { class: 'screen loading', role: 'alert' },
      h(
        'p',
        {},
        'This browser cannot draw the 3D world: WebGL is switched off or not supported here, and Flight 312 needs it.',
      ),
      h('button', { type: 'button', class: 'menu-link', onclick: title }, 'Back to the title'),
    ),
  );
}

function playLabel(setup: FlightSetup, context: FlightContext): { mode: string; label: string } {
  const city = destinationById(setup.destination).city;
  if (context.lesson)
    return {
      mode: 'school',
      label: `Flight school · ${context.lesson.lesson.title}`,
    };
  if (context.daily)
    return { mode: 'daily', label: `Daily Approach #${context.daily.day.number} · ${city}` };
  return { mode: setup.mode, label: `${MODE_NAMES[setup.mode]} · ${city}` };
}

async function fly(setup: FlightSetup, context: FlightContext) {
  endSession();
  lastFlight = { setup, context };
  loading('Preparing the aircraft…');
  const ground = await terrainReady();
  if (!canDrawTheWorld()) {
    noWorld();
    return;
  }
  screen.hidden = true;
  const flight = createFlight(setup, ground);
  const demo = context.lesson?.demo ?? false;
  const play = playLabel(setup, context);
  reportPlay({
    game: GAME,
    mode: play.mode,
    item: context.lesson?.lesson.id ?? setup.destination,
    label: play.label,
  });
  toasts.hold();
  const lesson = context.lesson
    ? new LessonController(context.lesson.lesson, flight, demo, (verdict) =>
        debrief(verdict, context),
      )
    : null;
  const demoPilot = lesson && demo ? createLessonPilot(flight, lesson.run) : null;
  session = new FlightSession(
    root as HTMLElement,
    flight,
    ground,
    withUnlockedCosmetics(settings),
    {
      ended: (outcome) => {
        if (!demo) reportOutcome(pass, store, flight, outcome);
        if (lesson) {
          lesson.flightEnded(flight);
          return;
        }
        const score = setup.mode === 'approach' ? scoreLanding(flight) : null;
        if (context.daily && !context.daily.practice) recordDaily(flight, context.daily, score);
        if (score?.landed && !demo) reportScore(score);
        const report = () => showReport(flight, context, score);
        // Let the last moment register before the report covers it.
        setTimeout(() => {
          report();
          toasts.flush();
        }, 1600);
      },
      pause: () => pause(),
      chart: () => chart(),
      checklist: () => checklists(),
      event: (event) => {
        if (!demo) reportEvent(pass, event);
      },
      stepped: lesson ? (current, events) => lesson.stepped(current, events) : undefined,
    },
    sound,
    reducedMotion,
    demoPilot ? { pilot: () => lessonPilotInput(demoPilot) } : {},
  );
  lesson?.attach(session);
  session.start();
}

function reportScore(score: LandingScore) {
  if (score.stars === 3) pass.award(20, 'Three stars on an approach');
}

/** The report, with the landing's points and, for a challenge, how the other side did. */
function showReport(flight: Flight, context: FlightContext, score: LandingScore | null) {
  const outcome = flight.outcome;
  if (!outcome || !session) return;
  const shareable = Boolean(session.recording());
  openOverlay(
    reportScreen(
      outcome,
      {
        replay: () => void watchLive(flight, context, score),
        again: () => void (lastFlight && fly(lastFlight.setup, lastFlight.context)),
        brief: () =>
          context.daily ? void daily() : brief(flight.setup.mode, flight.setup.destination),
        title,
        share: shareable ? () => shareCurrent(context) : null,
      },
      {
        score: score?.landed ? score : null,
        rival: context.challenge && score ? context.challenge : null,
      },
    ),
  );
}

function recordDaily(
  flight: Flight,
  context: NonNullable<FlightContext['daily']>,
  score: LandingScore | null,
) {
  const landing = score ?? scoreLanding(flight);
  const result: DailyApproachResult = {
    landed: landing.landed,
    points: landing.points,
    stars: landing.stars,
    starsText: starsText(landing.stars),
    sinkFpm: flight.touchdown ? Math.round(flight.touchdown.sinkFpm) : null,
    field: context.daily.destination.toUpperCase(),
    level: flight.setup.level,
    deck: flight.deck,
  };
  if (dailyLog.record(context.day.key, result))
    reportDaily(pass, result, dailyLog.streak(context.day.key));
}

/** The step a replay is built around: where the wheels touched, or the end. */
function focusStepOf(flight: Flight): number {
  const at = flight.touchdown?.at ?? flight.time;
  return Math.round(at / STEP_SECONDS);
}

function titleFor(setup: FlightSetup, meta: ReplayMeta): string {
  const city = destinationById(setup.destination).city;
  if (meta.kind === 'daily' && meta.daily) return `Daily Approach #${meta.daily} · ${city}`;
  if (meta.kind === 'lesson') {
    const lesson = LESSONS.find((one) => one.id === meta.lesson);
    return `Lesson ${lesson?.number ?? ''} · ${lesson?.title ?? ''}`;
  }
  return `${MODE_NAMES[setup.mode]} · ${city}`;
}

function summaryFor(flight: Flight): string {
  const outcome = flight.outcome;
  const level = LEVELS.find((one) => one.id === flight.setup.level)?.name ?? '';
  const deck = flight.deck === 'glass' ? 'glass deck' : 'classic deck';
  if (!outcome) return `${level}, ${deck}`;
  const score = flight.setup.mode === 'approach' ? scoreLanding(flight) : null;
  const touchdown = flight.touchdown ? ` at ${Math.round(flight.touchdown.sinkFpm)} fpm` : '';
  const points = score?.landed ? ` · ${score.points} points ${starsText(score.stars)}` : '';
  return `${outcome.report.headline}${touchdown}${points} · ${level}, ${deck}`;
}

/** The replay of the flight just flown, from the session's own recording and snapshots. */
async function watchLive(flight: Flight, context: FlightContext, score: LandingScore | null) {
  const current = session;
  const recording = current?.recording();
  if (!current || !recording || !current.recorder) return;
  closeOverlay();
  const status = h('div', { class: 'replay-preparing', role: 'status' }, 'Preparing the replay…');
  openOverlay(status);
  const director = await ReplayDirector.prepare(
    {
      recording,
      world: flight.world,
      terrain: await terrainReady(),
      snapshots: current.recorder.snapshots,
      focusStep: focusStepOf(flight),
    },
    reducedMotion,
  );
  if (session !== current) return;
  let saved = false;
  const bar = new ReplayBar(director, {
    save: () => {
      if (saved) return;
      saved = true;
      void packReplay({ meta: context.meta, recording }).then((packed) =>
        saveReplay(store, {
          title: titleFor(flight.setup, context.meta),
          summary: summaryFor(flight),
          packed,
          focusStep: focusStepOf(flight),
        }),
      );
    },
    share: () => shareCurrent(context),
    back: () => {
      current.stopReplay();
      closeOverlay();
      if (context.lesson && lastLessonVerdict) debrief(lastLessonVerdict, context);
      else showReport(flight, context, score);
    },
  });
  current.playReplay(director, (shot) => bar.update(shot));
  openOverlay(bar.element);
}

function shareCurrent(context: FlightContext) {
  const recording = session?.recording();
  if (recording) shareRecording(recording, context.meta);
}

/** The challenge-link box, over whatever is showing. */
function shareRecording(recording: Recording, meta: ReplayMeta) {
  const box = shareBox(
    store.get<string>('nickname', ''),
    async (name) => {
      const nickname = cleanNickname(name);
      store.set('nickname', nickname ?? '');
      const packed = await packReplay({
        meta: { ...meta, ...(nickname ? { nickname } : {}) },
        recording,
      });
      const url = replayUrl(packed);
      return url.length > LINK_LIMIT ? null : url;
    },
    async (text) =>
      (await copyText(text)) === 'copied'
        ? 'Copied. Paste it to whoever you like.'
        : 'Select the link and copy it.',
    () => box.remove(),
  );
  root?.append(box);
  box.querySelector<HTMLElement>('input')?.focus();
}

let lastLessonVerdict: LessonVerdict | null = null;

function debrief(verdict: LessonVerdict, context: FlightContext) {
  lastLessonVerdict = verdict;
  const { run, demo } = verdict;
  const lesson = run.lesson;
  if (!demo && run.status === 'passed') {
    const firstPass = (schoolRecord(store)[lesson.id] ?? 0) === 0;
    reportLesson(pass, lesson, run.stars, recordLesson(store, lesson.id, run.stars), firstPass);
  }
  toasts.flush();
  const index = LESSONS.indexOf(lesson);
  const next = LESSONS[index + 1];
  const flyLesson = (which: Lesson, asDemo: boolean) =>
    void fly(
      { ...which.setup, deck: settings.flightDeck },
      { meta: { kind: 'lesson', lesson: which.id }, lesson: { lesson: which, demo: asDemo } },
    );
  openOverlay(
    lessonDebrief(lesson, run, demo, {
      again: () => flyLesson(lesson, false),
      demo: () => flyLesson(lesson, true),
      next: next ? () => flyLesson(next, false) : null,
      replay:
        !demo && session?.recording()
          ? () => {
              const flight = session?.flight;
              if (flight) void watchLive(flight, context, null);
            }
          : null,
      school,
    }),
  );
}

function school() {
  endSession();
  show(
    schoolScreen(LESSONS, schoolRecord(store), settings.flightDeck, {
      fly: (lesson, demo) =>
        void fly(
          { ...lesson.setup, deck: settings.flightDeck },
          { meta: { kind: 'lesson', lesson: lesson.id }, lesson: { lesson, demo } },
        ),
      chooseDeck: (deck: Deck) => {
        saveSettings({ ...settings, flightDeck: deck });
      },
      back: title,
    }),
  );
}

let dailyLevel: Level = store.get<Level>('dailyLevel', 'pilot');

async function daily() {
  endSession();
  loading('Looking at today’s weather…');
  const ground = await terrainReady();
  const day = DAILY.on(new Date());
  const today = dailyApproach(day);
  // The flight itself says what the weather is: the same request, the same seed.
  const preview = createFlight(dailySetup(today, 'pilot', settings.flightDeck), ground);
  const result = dailyLog.get(day.key) ?? null;
  show(
    dailyScreen(
      {
        day,
        daily: today,
        field: preview.world.weather.destination,
        runway: preview.world.ils.runway.ident,
        result,
        streak: dailyLog.streak(day.key),
        entries: dailyLog.entries(),
        nextAt: nextDailyAt(new Date()),
        level: dailyLevel,
        deck: settings.flightDeck,
      },
      {
        fly: (level, deck, practice) => {
          dailyLevel = level;
          store.set('dailyLevel', level);
          if (deck !== settings.flightDeck) saveSettings({ ...settings, flightDeck: deck });
          void fly(dailySetup(today, level, deck), {
            meta: { kind: 'daily', daily: day.number },
            daily: { day, daily: today, practice },
          });
        },
        share: async () => {
          const done = dailyLog.get(day.key);
          if (!done) return '';
          const outcome = await shareText(
            dailyShareText(today, preview.world.weather.destination.ceilingFt, done),
          );
          return outcome === 'copied'
            ? 'Copied: paste it wherever you like.'
            : outcome === 'shared'
              ? 'Shared.'
              : outcome === 'failed'
                ? 'This browser would not copy it.'
                : '';
        },
        back: title,
      },
    ),
  );
}

function replays() {
  endSession();
  const list = savedReplays(store);
  show(
    replaysScreen(list, {
      watch: (saved) =>
        void unpackReplay(saved.packed).then((packed) =>
          watchSaved(packed, saved.focusStep, replays),
        ),
      share: (saved) =>
        void unpackReplay(saved.packed).then((packed) =>
          shareRecording(packed.recording, packed.meta),
        ),
      remove: (saved) => {
        deleteReplay(store, saved.id);
        replays();
      },
      back: title,
    }),
  );
}

/** A replay from its recording alone: the flight is flown again from its setup to the replay's start. */
async function watchSaved(packed: PackedReplay, focusStep: number, back: () => void) {
  endSession();
  const line = loading('Flying the flight again…');
  const ground = await terrainReady();
  if (!canDrawTheWorld()) {
    noWorld();
    return;
  }
  const { recording } = packed;
  const director = await ReplayDirector.prepare(
    {
      recording,
      world: createFlight(recording.setup, ground).world,
      terrain: ground,
      snapshots: [],
      focusStep,
    },
    reducedMotion,
    (share) => (line.textContent = `Flying the flight again… ${Math.round(share * 100)} %`),
  );
  screen.hidden = true;
  const viewer = new FlightSession(
    root as HTMLElement,
    createFlight(recording.setup, ground),
    ground,
    withUnlockedCosmetics(settings),
    { ended: () => {}, pause: () => {}, chart: () => {}, checklist: () => {}, event: () => {} },
    sound,
    reducedMotion,
  );
  session = viewer;
  const bar = new ReplayBar(director, {
    save: null,
    share: () => shareRecording(recording, packed.meta),
    back,
  });
  viewer.start();
  viewer.playReplay(director, (shot) => bar.update(shot));
  openOverlay(bar.element);
}

/** Someone's challenge: their flight flown again here, for its score, then theirs to beat. */
async function challenge(text: string) {
  loading('Opening the challenge…');
  history.replaceState(null, '', location.pathname + location.search);
  let packed: PackedReplay;
  try {
    packed = await unpackReplay(text);
  } catch (error) {
    show(
      h(
        'section',
        { class: 'screen loading', role: 'alert' },
        h('p', {}, error instanceof Error ? error.message : 'That link is damaged.'),
        h('button', { type: 'button', class: 'menu-link', onclick: title }, 'Back to the title'),
      ),
    );
    return;
  }
  const ground = await terrainReady();
  const theirs = replayRecording(packed.recording, ground);
  const score = scoreLanding(theirs);
  const who = packed.meta.nickname ?? 'Someone';
  const setup = packed.recording.setup;
  const level = LEVELS.find((one) => one.id === setup.level)?.name ?? '';
  const what = `${titleFor(setup, packed.meta)} at ${level}, on the ${setup.deck === 'glass' ? 'glass' : 'classic'} deck`;
  const result = score.landed
    ? `${score.points} points · ${starsText(score.stars)} · touchdown at ${Math.round(theirs.touchdown?.sinkFpm ?? 0)} fpm`
    : `${theirs.outcome?.report.headline ?? 'The flight did not end'}.`;
  const challengeAgain = () => {
    endSession();
    void challenge(text);
  };
  show(
    challengeScreen(
      { who, what, score: result },
      {
        watch: () => void watchSaved(packed, focusStepOf(theirs), () => challengeAgain()),
        fly: () =>
          void fly(setup, {
            meta: { kind: packed.meta.kind === 'lesson' ? 'approach' : packed.meta.kind },
            challenge: { who, score },
          }),
        title,
      },
    ),
  );
}

function pause() {
  if (!session) return;
  if (toasts.visible) {
    toasts.dismiss();
    return;
  }
  session.setPaused(true);
  const resume = () => {
    closeOverlay();
    session?.setPaused(false);
  };
  const leaving = lastFlight?.context.lesson
    ? school
    : lastFlight?.context.daily
      ? () => void daily()
      : title;
  openOverlay(
    pauseMenu({
      resume,
      chart: () => chart(),
      checklist: () => checklists(),
      settings: () =>
        openOverlay(
          h(
            'div',
            { class: 'overlay' },
            h(
              'div',
              { class: 'overlay-card wide' },
              settingsScreen(settings, saveSettings, () => pause(), unlockedCosmetics()),
            ),
          ),
        ),
      restart: () => void (lastFlight && fly(lastFlight.setup, lastFlight.context)),
      quit: leaving,
    }),
  );
  overlay?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') resume();
  });
}

function chart() {
  if (!session) return;
  session.setPaused(true);
  const map = new EnRouteChart(session.flight, () => {
    closeOverlay();
    session?.setPaused(false);
  });
  openOverlay(map.element);
  requestAnimationFrame(() => map.draw());
}

function checklists() {
  if (!session) return;
  const current = session;
  const panel = checklistPanel(
    current.flight,
    (id) => {
      current.command({ kind: 'completeChecklist', id });
      panel.refresh();
    },
    closeOverlay,
  );
  openOverlay(panel.element);
  overlayTimer = setInterval(() => panel.refresh(), 400);
}

root.append(screen);
mountHallButton({ corner: 'top-right', beforeLeave: () => endSession() });

const lab = new URLSearchParams(location.search).get('lab');
if (lab) screen.hidden = true;
if (lab === 'world') void startWorldLab(root);
else if (lab === 'instruments') startInstrumentLab(root);
else if (lab === 'glass') void startGlassLab(root);
else if (lab === 'scene') void startSceneLab(root, settings, sound);
else {
  const linked = linkedReplay();
  const resume = takeResumeRequest();
  const mode = resume?.mode;
  const item = DESTINATIONS.find((destination) => destination.id === resume?.item)?.id;
  if (linked) void challenge(linked);
  else if (mode === 'daily') void daily();
  else if (mode === 'school') school();
  else if (mode && mode in MODE_NAMES) brief(mode as Mode, item);
  else title();
  void terrainReady();
}
