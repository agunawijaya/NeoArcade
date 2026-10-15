import './styles/base.css';
import './styles/screens.css';
import './styles/hud.css';

import { createAudio } from '@shared/audio';
import { hallUrl, mountHallButton } from '@shared/hall-link';
import { reportPlay, takeResumeRequest } from '@shared/last-played';
import { connectPass, mountUnlockToasts } from '@shared/pass';
import { createStore } from '@shared/storage';
import manifest from '../pass.manifest';
import { Soundscape } from './audio/soundscape';
import { loadTerrainSource } from './data/unpack';
import { completeChecklist, createFlight, type FlightSetup, type Mode } from './engine/flight';
import { destinationById, DESTINATIONS, type DestinationId } from './engine/navdata';
import { createTerrain, type Terrain } from './engine/terrain';
import { reportEvent, reportOutcome, type CosmeticId } from './game/pass-report';
import { FlightSession } from './game/session';
import { startInstrumentLab } from './lab/instrument-lab';
import { startSceneLab } from './lab/scene-lab';
import { startWorldLab } from './lab/world-lab';
import { defaultSettings, sanitiseSettings, type MenuTheme, type Settings } from './settings';
import { EnRouteChart } from './ui/chart';
import { h } from './ui/dom';
import {
  briefingScreen,
  checklistPanel,
  pauseMenu,
  reportScreen,
  settingsScreen,
  titleScreen,
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

const store = createStore(GAME);
let settings: Settings = sanitiseSettings(store.get<unknown>('settings', defaultSettings()));
const audio = createAudio();
const sound = new Soundscape(() => audio.mix);
const pass = connectPass(manifest);
const toasts = mountUnlockToasts(pass, { accent: ACCENT, audio });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let terrain: Terrain | null = null;
let session: FlightSession | null = null;
let lastSetup: Partial<FlightSetup> = store.get<Partial<FlightSetup>>('lastSetup', {});
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
      (mode) => brief(mode),
      () => show(settingsScreen(settings, saveSettings, title, unlockedCosmetics())),
      hallUrl(),
    ),
  );
}

function brief(mode: Mode, destination?: DestinationId) {
  endSession();
  const remembered = { ...lastSetup, ...(destination ? { destination } : {}) };
  show(briefingScreen(mode, remembered, (setup) => void fly(setup), title));
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

async function fly(setup: FlightSetup) {
  endSession();
  lastSetup = setup;
  store.set('lastSetup', setup);
  show(
    h(
      'section',
      { class: 'screen loading', role: 'status' },
      h('p', {}, 'Preparing the aircraft…'),
    ),
  );
  const ground = await terrainReady();
  if (!canDrawTheWorld()) {
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
    return;
  }
  screen.hidden = true;
  const flight = createFlight(setup, ground);
  const destination = destinationById(setup.destination);
  reportPlay({
    game: GAME,
    mode: setup.mode,
    item: setup.destination,
    label: `${MODE_NAMES[setup.mode]} · ${destination.city}`,
  });
  toasts.hold();
  session = new FlightSession(
    root as HTMLElement,
    flight,
    ground,
    withUnlockedCosmetics(settings),
    {
      ended: (outcome, replay) => {
        reportOutcome(pass, store, flight, outcome);
        const report = () =>
          openOverlay(
            reportScreen(outcome, {
              replay: () => {
                closeOverlay();
                session?.playReplay(replay);
                openOverlay(
                  h(
                    'div',
                    { class: 'replay-bar' },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'primary',
                        onclick: () => (session?.stopReplay(), report()),
                      },
                      'Back to the report',
                    ),
                  ),
                );
              },
              again: () => void fly(setup),
              brief: () => brief(setup.mode, setup.destination),
              title,
            }),
          );
        // Let the last moment register before the report covers it.
        setTimeout(() => {
          report();
          toasts.flush();
        }, 1600);
      },
      pause: () => pause(),
      chart: () => chart(),
      checklist: () => checklists(),
      event: (event) => reportEvent(pass, event),
    },
    sound,
    reducedMotion,
  );
  session.start();
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
      restart: () => void fly(lastSetup as FlightSetup),
      quit: title,
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
  const flight = session.flight;
  const panel = checklistPanel(
    flight,
    (id) => {
      completeChecklist(flight, id);
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
else if (lab === 'scene') void startSceneLab(root, settings, sound);
else {
  const resume = takeResumeRequest();
  const mode = resume?.mode as Mode | undefined;
  const item = DESTINATIONS.find((destination) => destination.id === resume?.item)?.id;
  if (mode && mode in MODE_NAMES) brief(mode, item);
  else title();
  void terrainReady();
}
