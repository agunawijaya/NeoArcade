import './styles/base.css';
import './styles/screens.css';
import './styles/drive.css';

import { createAudio } from '@shared/audio';
import {
  copyText,
  createDailyLog,
  dailyChallenge,
  nextDailyAt,
  shareText,
  type DailyDay,
} from '@shared/daily';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { createLoop } from '@shared/loop';
import { connectPass, mountUnlockToasts } from '@shared/pass';
import { randomSeed } from '@shared/rng';
import { createStore } from '@shared/storage';
import manifest from '../pass.manifest';
import { soundFor, ROAD_SONG, TITLE_SONG, type SoundName } from './audio/sounds';
import { placeById } from './data/places';
import { ZONE_OFFSETS, zoneOf } from './data/zones';
import {
  activeOffences,
  buyUpgrade,
  careerBoard,
  careerDate,
  careerRig,
  careerSeason,
  finishContract,
  MILLION,
  newCareer,
  sanitiseCareer,
  tripSeed,
  UPGRADES,
  waitADay,
  type Career,
  type UpgradeId,
} from './engine/career';
import {
  contractRoutes,
  contractTitle,
  contractTrip,
  DEPARTURE_CLOCK,
  type Contract,
} from './engine/contracts';
import { dailyHaul, dailyShareText, type DailyHaul, type DailyResult } from './engine/daily-haul';
import { eventsOfType } from './engine/events';
import { skyFor, type Season } from './engine/living-weather';
import { roadsOf, routeFor, type RouteOption } from './engine/network';
import {
  originalRoads,
  originalRoute,
  returnRoute,
  type OriginalRouteId,
} from './engine/original-routes';
import { STOCK_RIG } from './engine/rig';
import { FRESH_RECORD, judgeTrip, singleHaulSetup, type HaulRecord } from './engine/single-haul';
import { startTrip } from './engine/start';
import { stopMile, type Trip, type TyreOrder } from './engine/trip';
import { CbRadio } from './game/cb-radio';
import { tripLayers, tripLine } from './game/map-layers';
import { reportTrip, type CosmeticId, type TripMode } from './game/pass-report';
import { PostcardBook } from './game/postcards';
import { TripSession, type SessionHooks } from './game/session';
import { boundsOf } from './map/route-geometry';
import { RIG_PAINTS, type RigPaintId } from './render/rig';
import { defaultSettings, sanitiseSettings, type Settings } from './settings';
import { ThemePreference } from './theme';
import { AlbumScreen } from './ui/album-screen';
import { CareerScreen } from './ui/career-screen';
import { DailyScreen } from './ui/daily-screen';
import { DispatchScreen, type DispatchChoice } from './ui/dispatch-screen';
import { h } from './ui/dom';
import { DriveScreen } from './ui/drive-screen';
import { money } from './ui/format';
import { LedgerScreen, type LedgerAction, type LedgerModel } from './ui/ledger-screen';
import { MapOverlay } from './ui/map-overlay';
import { MenuNavigator } from './ui/menu-nav';
import { PauseMenu } from './ui/pause-menu';
import { PlannerScreen, type RouteCandidate } from './ui/planner-screen';
import { SettingsScreen, type PaintChoice } from './ui/settings-screen';
import { StopScreen } from './ui/stop-screen';
import { TextModeScreen } from './ui/text-mode';
import { TitleScreen, type MenuChoice } from './ui/title-screen';

type Screen =
  | 'title'
  | 'dispatch'
  | 'planner'
  | 'drive'
  | 'stop'
  | 'ledger'
  | 'settings'
  | 'career'
  | 'daily'
  | 'album'
  | 'text';

/** What the trip on the road is for. */
type Run =
  | { mode: 'single'; choice: DispatchChoice }
  | { mode: 'career'; contract: Contract }
  | { mode: 'daily'; day: DailyDay; haul: DailyHaul; practice: boolean };

const root = document.querySelector<HTMLElement>('#game');
if (!root) throw new Error('The page is missing its #game element.');

const ACCENT = '#2fbf71';
/** Daily Haul #1. */
const DAILY_LAUNCH = '2026-10-04';
const SINGLE_ODOMETER = 948_211;

const store = createStore('long-haul');
let settings: Settings = sanitiseSettings(store.get<unknown>('settings', defaultSettings()));
const themePreference = new ThemePreference(store);
const audio = createAudio();
const pass = connectPass(manifest);
const toasts = mountUnlockToasts(pass, { accent: ACCENT, audio });
const radio = new CbRadio(store);
const postcards = new PostcardBook(store);
const daily = dailyChallenge({ game: 'long-haul', launch: DAILY_LAUNCH });
const dailyLog = createDailyLog<DailyResult>(store);
const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => reducedMotionQuery.matches;
const howToPlay = `${hallUrl()}#/games/long-haul/how-to-play`;
// A seed in the address (?seed=1982) replays the same Single Haul or career: the same weather, patrols and blowouts for the same driving.
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed') ?? '', 10);
const nextSeed = () => (Number.isFinite(seedParam) ? seedParam : randomSeed());

let record: HaulRecord = {
  ...FRESH_RECORD,
  ...store.get<Partial<HaulRecord>>('single-record', {}),
};
let lastDispatch: DispatchChoice | null = store.get<DispatchChoice | null>('single-last', null);
let career: Career | null = sanitiseCareer(store.get<unknown>('career', null));
let session: TripSession | null = null;
let run: Run | null = null;
let screen: Screen = 'title';
let plannerBack: () => void = () => show('title');

// ——— Sound and paint ———

function sound(name: SoundName) {
  for (const { sound: patch, delay } of soundFor(name)) audio.play(patch, { delay });
}

const PAINTS: readonly {
  id: RigPaintId;
  name: string;
  cosmetic: CosmeticId | null;
  hint: string;
}[] = [
  { id: 'classic', name: 'Classic red', cosmetic: null, hint: '' },
  { id: 'highway', name: 'Highway green', cosmetic: 'paint-highway', hint: 'Reach Arcade level 3' },
  { id: 'cream', name: 'Cream and red', cosmetic: 'paint-cream', hint: 'Badge: Coast to Coast' },
  { id: 'midnight', name: 'Midnight blue', cosmetic: 'paint-midnight', hint: 'Badge: Night Owl' },
  { id: 'sunset', name: 'Sunset orange', cosmetic: 'paint-sunset', hint: 'Badge: Fresh Squeezed' },
  {
    id: 'chrome',
    name: 'Polished chrome',
    cosmetic: 'paint-chrome',
    hint: 'Badge: Million-Mile Club',
  },
];

function paintChoices(): PaintChoice[] {
  return PAINTS.map((paint) => ({
    id: paint.id,
    name: paint.name,
    unlocked: paint.cosmetic === null || pass.isUnlocked(paint.cosmetic),
    hint: paint.hint,
  }));
}

function rigPaint() {
  const chosen = paintChoices().find((paint) => paint.id === settings.paint);
  return RIG_PAINTS[chosen?.unlocked ? chosen.id : 'classic'];
}

function saveSettings(change: Partial<Settings>) {
  settings = sanitiseSettings({ ...settings, ...change });
  store.set('settings', settings);
  drive.refreshTools();
}

// ——— Screens ———

const title = new TitleScreen({
  choose: (choice) => chooseMode(choice),
  toggleTheme: () => themePreference.choose(themePreference.theme === 'light' ? 'dark' : 'light'),
  howToPlay,
  reducedMotion,
  paint: () => rigPaint(),
});
const dispatch = new DispatchScreen({
  next: (choice) => planSingleHaul(choice),
  back: () => show('title'),
});
const planner = new PlannerScreen({
  theme: () => themePreference.theme,
  units: () => settings.units,
  reducedMotion,
  back: () => plannerBack(),
});
const drive = new DriveScreen({
  settings: () => settings,
  theme: () => themePreference.theme,
  reducedMotion,
  saveSettings,
  pause: () => (pause.element.hidden ? openPause() : resume()),
  openMap: () => (mapOverlay.element.hidden ? openMap() : closeMap()),
  openStop: () => undefined,
  sound,
});
const stopScreen = new StopScreen({
  units: () => settings.units,
  reducedMotion,
  scene: () => session?.scene() ?? null,
  sound,
});
const ledger = new LedgerScreen();
const settingsScreen = new SettingsScreen({
  settings: () => settings,
  save: saveSettings,
  theme: themePreference,
  audio,
  paints: paintChoices,
  back: () => show('title'),
});
const careerScreen = new CareerScreen({
  units: () => settings.units,
  difficulty: () => settings.difficulty,
  start: () => {
    career = newCareer(nextSeed(), settings.difficulty);
    saveCareer();
    openCareer();
  },
  take: (contract, tyres) => planCareerLoad(contract, tyres),
  wait: () => {
    if (!career) return;
    career = waitADay(career);
    if (career.cashCents < 0) {
      career = { ...career, status: 'repossessed' };
      pass.unlock('repossessed');
    }
    saveCareer();
    openCareer();
  },
  buy: (id: UpgradeId) => {
    if (!career) return;
    career = buyUpgrade(career, id);
    sound('register');
    saveCareer();
    checkCareerBadges(career);
    openCareer();
  },
  retire: () => {
    if (!career) return;
    career = { ...career, status: 'retired' };
    saveCareer();
    openCareer();
  },
  back: () => show('title'),
});
const dailyScreen = new DailyScreen({
  units: () => settings.units,
  play: (practice, tyres) => planDailyHaul(practice, tyres),
  share: (text) => shareText(text),
  back: () => show('title'),
});
const album = new AlbumScreen({
  collected: () => new Set(postcards.keys()),
  back: () => show('title'),
});
const textMode = new TextModeScreen({
  sound,
  verdict: (trip) => {
    const conclusion = conclude(trip);
    const notes = conclusion.notes.map((note) => `     ${note}`);
    // A crash or a lost licence has already been told, in the original's words.
    return trip.status === 'arrived'
      ? ['', conclusion.heading, '', ...conclusion.verdict, ...notes]
      : notes;
  },
  again: (yes) => {
    textMode.hide();
    if (yes) chooseMode('single');
    else show('title');
  },
  quit: () => {
    textMode.hide();
    session = null;
    run = null;
    show('title');
  },
});
const pause = new PauseMenu({
  resume: () => resume(),
  openMap: () => openMap(),
  switchView: () => saveSettings({ view: settings.view === 'cab' ? 'diorama' : 'cab' }),
  switchRhythm: () =>
    saveSettings({ rhythm: settings.rhythm === 'realtime' ? 'legs' : 'realtime' }),
  quit: () => quitTrip(),
  settings: () => settings,
  howToPlay,
});
const mapOverlay = new MapOverlay({
  theme: () => themePreference.theme,
  reducedMotion,
  close: () => closeMap(),
});

root.append(
  title.element,
  dispatch.element,
  planner.element,
  careerScreen.element,
  dailyScreen.element,
  album.element,
  drive.element,
  stopScreen.element,
  ledger.element,
  settingsScreen.element,
  textMode.element,
  pause.element,
  mapOverlay.element,
);

mountHallButton({
  corner: 'bottom-left',
  beforeLeave: () => {
    if (!session || session.phase === 'done') return true;
    openPause('Leave the road? This trip will not be kept.');
    return false;
  },
});

const menus = new MenuNavigator(
  () => {
    if (!pause.element.hidden) return pause.element;
    if (!mapOverlay.element.hidden) return null;
    const menuScreens: Partial<Record<Screen, HTMLElement>> = {
      title: title.element,
      dispatch: dispatch.element,
      planner: planner.element,
      ledger: ledger.element,
      settings: settingsScreen.element,
      career: careerScreen.element,
      daily: dailyScreen.element,
      album: album.element,
      stop: stopScreen.element,
    };
    return menuScreens[screen] ?? null;
  },
  () => {
    if (toasts.visible) return toasts.dismiss();
    if (!pause.element.hidden) return resume();
    if (screen === 'album' && album.viewing) return album.closeCard();
    if (screen === 'planner') return plannerBack();
    if (
      screen === 'dispatch' ||
      screen === 'settings' ||
      screen === 'career' ||
      screen === 'daily' ||
      screen === 'album' ||
      screen === 'ledger'
    )
      show('title');
  },
);

const SCREENS: Record<Screen, () => HTMLElement> = {
  title: () => title.element,
  dispatch: () => dispatch.element,
  planner: () => planner.element,
  drive: () => drive.element,
  stop: () => stopScreen.element,
  ledger: () => ledger.element,
  settings: () => settingsScreen.element,
  career: () => careerScreen.element,
  daily: () => dailyScreen.element,
  album: () => album.element,
  text: () => textMode.element,
};

function show(next: Screen) {
  screen = next;
  document.body.dataset.screen = next;
  for (const [name, element] of Object.entries(SCREENS) as [Screen, () => HTMLElement][]) {
    // The road stays drawn under the truck stop.
    element().hidden = !(name === next || (name === 'drive' && next === 'stop'));
  }
  drive.setActive(next === 'drive');
  const onTheRoad = next === 'drive' || next === 'stop' || next === 'text';
  if (onTheRoad) toasts.hold();
  else toasts.flush();
  if (next === 'drive') audio.playMusic(ROAD_SONG);
  else if (next === 'ledger' || next === 'text') audio.stopMusic();
  else if (next !== 'stop') audio.playMusic(TITLE_SONG);
  if (next === 'title') {
    refreshStatuses();
    title.focusFirst();
  }
}

function chooseMode(choice: MenuChoice) {
  sound('menu');
  if (choice === 'single') {
    dispatch.show(record, lastDispatch);
    show('dispatch');
  } else if (choice === 'career') {
    openCareer();
  } else if (choice === 'daily') {
    openDaily();
  } else if (choice === 'album') {
    album.show();
    show('album');
  } else {
    settingsScreen.show();
    show('settings');
  }
}

function refreshStatuses() {
  title.setStatus(
    'single',
    record.trips > 0
      ? `${record.trips} trip${record.trips === 1 ? '' : 's'} · ${money(record.totalCents, true)} so far`
      : 'Los Angeles to New York, the original run',
  );
  title.setStatus(
    'career',
    !career
      ? 'Your own rig, the whole country'
      : career.status === 'active'
        ? `${money(career.cashCents, true)} in the bank · ${placeById(career.hub).name}`
        : 'Career over · start another',
  );
  const today = daily.on(new Date());
  const played = dailyLog.has(today.key);
  const streak = dailyLog.streak(today.key).current;
  title.setStatus(
    'daily',
    `#${today.number} · ${played ? 'driven today' : 'one load, the same for everyone'}${streak > 1 ? ` · ${streak}-day streak` : ''}`,
    played ? undefined : 'New',
  );
  title.setStatus(
    'album',
    `${postcards.count} postcard${postcards.count === 1 ? '' : 's'} collected`,
  );
}

// ——— Single Haul ———

function planSingleHaul(choice: DispatchChoice) {
  lastDispatch = choice;
  store.set('single-last', choice);
  const east = choice.direction === 'east';
  const candidates: RouteCandidate[] = (['north', 'middle', 'south'] as const).map((id) => {
    const route = east ? originalRoute(id) : returnRoute(id);
    return { route, title: route.name, roads: originalRoads(id) };
  });
  plannerBack = () => show('dispatch');
  planner.show(
    east ? 'Los Angeles → New York' : 'New York → Los Angeles',
    'Three roads, as in the original. The north is shortest but its patrols are strict and its weather rough; the south is long and easygoing; the middle is in between.',
    candidates,
    (candidate) =>
      startSingleHaul(choice, candidate.route.id.replace('-return', '') as OriginalRouteId),
  );
  show('planner');
}

function startSingleHaul(choice: DispatchChoice, route: OriginalRouteId) {
  const { trip } = startTrip(
    singleHaulSetup({
      route,
      direction: choice.direction,
      cargo: choice.cargo,
      load: choice.load,
      tyres: choice.tyres,
      seed: nextSeed(),
      difficulty: settings.difficulty,
      offences: record.offences,
    }),
  );
  run = { mode: 'single', choice };
  // Monday 1 March 1982, 8 AM at the terminal: 16:00 UTC in Los Angeles, 13:00 in New York.
  const departure = Date.UTC(1982, 2, 1, choice.direction === 'east' ? 16 : 13);
  if (settings.textMode) {
    textMode.start(trip);
    show('text');
    return;
  }
  beginTrip(trip, departure, SINGLE_ODOMETER, 'winter');
}

// ——— Career ———

function saveCareer() {
  store.set('career', career);
}

function openCareer() {
  careerScreen.show(career, career && career.status === 'active' ? careerBoard(career) : []);
  show('career');
}

function candidatesFor(
  options: readonly RouteOption[],
  seed: number,
  season: Season,
  difficulty: Settings['difficulty'],
): RouteCandidate[] {
  const sky = skyFor({ seed, season, scale: difficulty === 'hard' ? 1.25 : 1 });
  return options.map((option, index) => {
    const via = option.hubs.slice(1, -1).map((hub) => placeById(hub).name);
    return {
      route: routeFor(option),
      title:
        index === 0
          ? `Shortest${via.length > 0 ? `, via ${via.join(' and ')}` : ''}`
          : via.length > 0
            ? `Via ${via.join(' and ')}`
            : 'Direct',
      roads: roadsOf(option.legs),
      sky,
    };
  });
}

function departureUtc(day: number, from: string): number {
  const offset = ZONE_OFFSETS[zoneOf(placeById(from))];
  return careerDate(day).getTime() + (DEPARTURE_CLOCK - offset) * 3_600_000;
}

function weekdayOf(day: number): number {
  return (careerDate(day).getUTCDay() + 6) % 7;
}

function planCareerLoad(contract: Contract, tyres: TyreOrder) {
  const current = career;
  if (!current) return;
  const season = careerSeason(current.day);
  const seed = tripSeed(current, contract);
  const options = contractRoutes(contract);
  const candidates = candidatesFor(options, seed, season, current.difficulty);
  plannerBack = () => openCareer();
  planner.show(
    contractTitle(contract),
    `${contract.goods.charAt(0).toUpperCase()}${contract.goods.slice(1)}, ${contract.load.toLocaleString('en-US')} lb, for ${money(contract.payCents, true)}. The forecast is for the weather systems drifting across the map this week.`,
    candidates,
    (candidate) => {
      const option = options[candidates.indexOf(candidate)];
      if (!option) return;
      const { trip } = startTrip(
        contractTrip({
          contract,
          option,
          tyres,
          seed,
          difficulty: current.difficulty,
          season,
          offences: activeOffences(current),
          rig: careerRig(current),
          weekday: weekdayOf(current.day),
          carriedFuel: current.fuel ?? 0,
        }),
      );
      run = { mode: 'career', contract };
      beginTrip(trip, departureUtc(current.day, contract.from), current.odometer, season);
    },
  );
  show('planner');
}

function checkCareerBadges(current: Career) {
  if (current.upgrades.length >= UPGRADES.length) pass.unlock('fully-loaded');
  if (current.reputation >= 85) pass.unlock('legend-of-the-docks');
  if (current.cashCents >= 2_500_000) pass.unlock('fat-wallet');
  if (current.odometer >= MILLION) pass.unlock('million-mile-club');
}

// ——— Daily Haul ———

function todaysHaul(): { day: DailyDay; haul: DailyHaul } {
  const day = daily.on(new Date());
  return { day, haul: dailyHaul(day.seed, day.key) };
}

function dailyNames(haul: DailyHaul) {
  return { from: placeById(haul.contract.from).name, to: placeById(haul.contract.to).name };
}

function openDaily() {
  const { day, haul } = todaysHaul();
  const result = dailyLog.get(day.key) ?? null;
  dailyScreen.show({
    day,
    haul,
    result,
    streak: dailyLog.streak(day.key),
    entries: dailyLog.entries(),
    nextAt: nextDailyAt(new Date()),
    shareText: result ? dailyShareText(day.number, haul, result, dailyNames(haul)) : null,
  });
  show('daily');
}

function planDailyHaul(practice: boolean, tyres: TyreOrder) {
  const { day, haul } = todaysHaul();
  const { contract } = haul;
  const options = contractRoutes(contract);
  // Everyone drives the Daily Haul on Normal, so the results compare.
  const candidates = candidatesFor(options, haul.seed, haul.season, 'normal');
  plannerBack = () => openDaily();
  const weekday = (new Date(`${day.key}T00:00:00Z`).getUTCDay() + 6) % 7;
  planner.show(
    `Daily #${day.number}: ${contractTitle(contract)}`,
    practice
      ? 'A practice run: the same load and the same luck, but only your first run counts.'
      : 'Your scored run. Choose the road; the weather systems are the same for everyone today.',
    candidates,
    (candidate) => {
      const option = options[candidates.indexOf(candidate)];
      if (!option) return;
      const { trip } = startTrip(
        contractTrip({
          contract,
          option,
          tyres,
          seed: haul.seed,
          difficulty: 'normal',
          season: haul.season,
          offences: 0,
          rig: STOCK_RIG,
          weekday,
        }),
      );
      run = { mode: 'daily', day, haul, practice };
      const offset = ZONE_OFFSETS[zoneOf(placeById(contract.from))];
      beginTrip(
        trip,
        Date.parse(`${day.key}T00:00:00Z`) + (DEPARTURE_CLOCK - offset) * 3_600_000,
        SINGLE_ODOMETER,
        haul.season,
      );
    },
  );
  show('planner');
}

// ——— On the road ———

function beginTrip(trip: Trip, departure: number, odometer: number, season: Season) {
  session = new TripSession({
    trip,
    settings: () => settings,
    season,
    departureUtc: departure,
    odometerStart: odometer,
    paint: rigPaint(),
    cb: radio,
    reducedMotion,
    hooks: sessionHooks(),
  });
  drive.attach(session);
  show('drive');
  session.start();
}

function sessionHooks(): SessionHooks {
  return {
    card: (copy, beat, done) => drive.showCard(copy, beat, done),
    quick: (copy) => drive.quick(copy),
    passed: (stop, index) => {
      if (!session) return;
      drive.passed(stopMile(session.trip, index));
      const ahead = session.trip.route.stops[index + 1];
      const entering = ahead ? placeById(ahead.place).state : null;
      const collected = postcards.collect(stop.place, entering);
      if (collected?.isNew) {
        sound('postcard');
        pass.progress('postcard-collector', postcards.count);
        pass.stat('postcards', postcards.count);
        drive.toast(
          h(
            'div',
            { class: 'toast toast--postcard' },
            h('strong', {}, 'Postcard'),
            h(
              'span',
              {},
              collected.card.kind === 'state'
                ? `Welcome to ${collected.card.title}`
                : `Greetings from ${collected.card.title}`,
            ),
          ),
        );
      }
    },
    stopOffer: (offer) => drive.stopOffer(offer),
    askStop: (offer, answer) => drive.ask(offer, answer),
    atStop: (visit, diner, done) => {
      if (!session) return;
      stopScreen.open(session.trip, visit, diner, () => {
        show('drive');
        done();
      });
      show('stop');
    },
    plan: (plan, go) => drive.plan(plan, go),
    cb: (message) => drive.cb(message),
    hour: () => undefined,
    ended: (trip) => finishTrip(trip),
  };
}

interface Conclusion {
  heading: string;
  verdict: string[];
  stamp: LedgerModel['stamp'];
  notes: string[];
  actions: LedgerAction[];
}

/** Settles the books for a finished trip, once: records, the Pass, the stamp. */
function conclude(trip: Trip): Conclusion {
  const current = run;
  run = null;
  if (current?.mode === 'career') return concludeCareer(trip, current.contract);
  if (current?.mode === 'daily')
    return concludeDaily(trip, current.day, current.haul, current.practice);
  return concludeSingle(trip);
}

function passNote(xp: number): string[] {
  return xp > 0 ? [`+${xp} XP on the Arcade Pass`] : [];
}

function report(mode: TripMode, trip: Trip, dishes: boolean, bankrupt: boolean): number {
  return reportTrip(pass, { mode, trip, dishes, bankrupt });
}

function stampFor(trip: Trip): LedgerModel['stamp'] {
  const settlement = trip.status === 'arrived' ? trip.settlement : undefined;
  if (!settlement)
    return trip.status === 'crashed'
      ? { text: 'Wrecked', tone: 'bad' }
      : { text: 'Revoked', tone: 'bad' };
  if (settlement.profitCents > 10_000) return { text: 'Good work!!', tone: 'good' };
  return settlement.profitCents >= 0
    ? { text: 'Paid', tone: 'neutral' }
    : { text: 'Bad trip', tone: 'bad' };
}

function profitLine(profitCents: number): string {
  return profitCents >= 0
    ? `Your net profit this trip was ${money(profitCents)}`
    : `Bad trip. . . You lost ${money(Math.abs(profitCents))}`;
}

function endLine(trip: Trip): string {
  return trip.status === 'crashed'
    ? 'You lose your truck & profits.'
    : "Your I.C.C. driver's license is revoked !";
}

function concludeSingle(trip: Trip): Conclusion {
  const verdict: string[] = [];
  let stamp = stampFor(trip);
  let heading: string;
  let dishes = false;
  let bankrupt = false;
  if (trip.status === 'arrived' && trip.settlement) {
    const judged = judgeTrip(record, trip.settlement, trip.offences);
    record = judged.record;
    const outcome = judged.verdict;
    heading = `Welcome to ${placeById(trip.route.to).name}`;
    verdict.push(profitLine(outcome.profitCents));
    if (outcome.goodWork) verdict.push('     G O O D   W O R K  !!');
    if (outcome.bankrupt) {
      bankrupt = true;
      verdict.push('     You are bankrupt !!!', 'Your rig has been repossessed.');
      record = { ...FRESH_RECORD };
      stamp = { text: 'Repossessed', tone: 'bad' };
    } else {
      if (outcome.averageCents !== null)
        verdict.push(`     Your average profit has been ${money(outcome.averageCents)}`);
      if (outcome.dishes) {
        dishes = true;
        verdict.push("     You'd make more money washing dishes !");
      }
    }
  } else {
    heading = trip.status === 'crashed' ? 'The end of the road' : 'Licence revoked';
    verdict.push(endLine(trip));
    record = { ...FRESH_RECORD };
  }
  store.set('single-record', record);
  const xp = report('single', trip, dishes, bankrupt);
  return {
    heading,
    verdict,
    stamp,
    notes: passNote(xp),
    actions: [
      {
        label: record.trips === 0 ? 'Start over' : 'Make another trip',
        primary: true,
        run: () => chooseMode('single'),
      },
      { label: 'Title', run: () => show('title') },
    ],
  };
}

function concludeCareer(trip: Trip, contract: Contract): Conclusion {
  const before = career;
  if (!before) return concludeSingle(trip);
  career = finishContract(before, contract, trip);
  saveCareer();
  const after = career;
  const verdict: string[] = [];
  let stamp = stampFor(trip);
  const settlement = trip.status === 'arrived' ? trip.settlement : undefined;
  if (settlement) {
    verdict.push(profitLine(settlement.profitCents));
    if (settlement.profitCents > 10_000) verdict.push('     G O O D   W O R K  !!');
    const change = after.reputation - before.reputation;
    verdict.push(
      change > 0
        ? `     The shippers in ${placeById(contract.to).name} will remember your name. (+${change} reputation)`
        : change < 0
          ? `     Word gets around the docks. (${change} reputation)`
          : '     Nobody says much about it either way.',
    );
    verdict.push(`     ${money(after.cashCents)} in the bank.`);
  } else {
    verdict.push(endLine(trip));
  }
  const bankrupt = after.status === 'repossessed';
  if (bankrupt) {
    verdict.push('     You are bankrupt !!!', 'Your rig has been repossessed.');
    stamp = { text: 'Repossessed', tone: 'bad' };
  }
  const dishes = Boolean(settlement && settlement.profitCents < 20_000);
  if (dishes && !bankrupt) verdict.push("     You'd make more money washing dishes !");
  const xp = report('career', trip, dishes, bankrupt);
  checkCareerBadges(after);
  return {
    heading: settlement
      ? `Delivered to ${placeById(contract.to).name}`
      : trip.status === 'crashed'
        ? 'The end of the road'
        : 'Licence revoked',
    verdict,
    stamp,
    notes: passNote(xp),
    actions: [
      {
        label: after.status === 'active' ? 'Back to the terminal' : 'How the career went',
        primary: true,
        run: () => openCareer(),
      },
      { label: 'Title', run: () => show('title') },
    ],
  };
}

function concludeDaily(trip: Trip, day: DailyDay, haul: DailyHaul, practice: boolean): Conclusion {
  const settlement = trip.status === 'arrived' ? trip.settlement : undefined;
  const result: DailyResult = {
    profitCents: settlement?.profitCents ?? 0,
    hours: settlement?.deliveredHr ?? trip.hr,
    delivered: Boolean(settlement),
    outcome:
      trip.status === 'arrived' ? 'delivered' : trip.status === 'jailed' ? 'jailed' : 'crashed',
    tickets: eventsOfType(trip.events, 'pulled-over').length,
    late: settlement?.late ?? false,
  };
  const counted = !practice && dailyLog.record(day.key, result);
  const text = dailyShareText(day.number, haul, result, dailyNames(haul));
  const verdict: string[] = [];
  if (settlement) {
    verdict.push(profitLine(settlement.profitCents));
    if (settlement.profitCents > 10_000) verdict.push('     G O O D   W O R K  !!');
  } else {
    verdict.push(endLine(trip));
  }
  const streak = dailyLog.streak(day.key);
  if (streak.current >= 7) pass.unlock('week-on-the-road');
  const dishes = Boolean(settlement && settlement.profitCents < 20_000);
  const xp = report(practice ? 'practice' : 'daily', trip, dishes, false);
  const notes = [
    counted
      ? `Daily Haul #${day.number}: your run counts · streak ${streak.current}`
      : `Practice run: Daily Haul #${day.number} keeps your first result`,
    ...passNote(xp),
  ];
  const actions: LedgerAction[] = [];
  if (counted) {
    actions.push({
      label: 'Share',
      primary: true,
      run: () => {
        void shareText(text).then((outcome) => (outcome === 'failed' ? copyText(text) : outcome));
      },
    });
  }
  actions.push(
    { label: 'Daily Haul', primary: !counted, run: () => openDaily() },
    { label: 'Title', run: () => show('title') },
  );
  return {
    heading: settlement
      ? `Daily #${day.number}: delivered`
      : `Daily #${day.number}: the end of the road`,
    verdict,
    stamp: stampFor(trip),
    notes,
    actions,
  };
}

function finishTrip(trip: Trip) {
  const conclusion = conclude(trip);
  ledger.show({ ...conclusion, trip, units: settings.units, pace: reducedMotion() ? 0 : 2.4 });
  session = null;
  drive.detach();
  show('ledger');
  if (!reducedMotion()) setTimeout(() => sound('stamp'), 2700);
}

// ——— Pause and the map ———

function openPause(message: string | null = null) {
  if (!session || session.phase === 'done' || screen !== 'drive') return;
  session.pause();
  pause.open(message);
}

function resume() {
  pause.close();
  session?.resume();
}

function quitTrip() {
  pause.close();
  session = null;
  run = null;
  drive.detach();
  show('title');
}

function openMap() {
  const active = session;
  if (!active) return;
  if (!active.paused) active.pause();
  pause.close();
  const trip = active.trip;
  mapOverlay.open(
    `${placeById(trip.route.from).name} → ${placeById(trip.route.to).name} · ${trip.route.name}`,
    () =>
      tripLayers(trip, {
        mile: active.displayMile,
        elapsed: trip.hr - trip.zoneShift,
        utc: null,
        withTrail: true,
        withMarkers: true,
        network: true,
        highlightTo: null,
      }),
    boundsOf(tripLine(trip)),
  );
}

function closeMap() {
  mapOverlay.close();
  if (screen === 'drive') session?.resume();
}

// ——— Theme, visibility, the loop ———

function applyTheme() {
  document.documentElement.dataset.theme = themePreference.theme;
  title.showTheme(themePreference.theme);
}
themePreference.onChange(applyTheme);
applyTheme();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && session && !session.paused && screen === 'drive') openPause();
});

let clockTick = 0;
createLoop({
  update() {},
  render(_alpha, frameSeconds) {
    const dt = Math.min(0.1, frameSeconds);
    menus.update();
    if (screen === 'title') title.frame(dt);
    if (screen === 'planner') planner.frame(dt);
    if (screen === 'drive' && mapOverlay.element.hidden) drive.frame(dt);
    if (screen === 'stop') stopScreen.frame(dt);
    mapOverlay.frame(dt);
    clockTick += dt;
    if (screen === 'daily' && clockTick > 1) {
      clockTick = 0;
      dailyScreen.frame(new Date());
    }
    // For the browser tests: where the trip stands.
    const phase = session?.phase ?? '';
    if (document.body.dataset.phase !== phase) document.body.dataset.phase = phase;
  },
}).start();

show('title');
title.playIntro();
