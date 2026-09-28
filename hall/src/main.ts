import '@shared/fonts/tilt-neon.css';
import '../styles/base.css';
import '../styles/masthead.css';
import '../styles/lobby.css';
import '../styles/screens.css';
import '../styles/detail.css';
import '../styles/docs.css';
import '../styles/sheets.css';
import '../styles/pass.css';

import { openArcadePass, playedTally } from '@shared/pass';
import { createStore } from '@shared/storage';
import rawCatalog from '../catalog.json';
import { createBackupDialog, createResetDialog } from './backup-dialogs';
import { parseCatalog } from './catalog';
import { createDetailPanel } from './detail';
import { h, icon } from './dom';
import { createDocsView } from './docs-view';
import { startGamepadNavigation } from './gamepad-nav';
import { ICONS } from './icons';
import { createLobby } from './lobby';
import { buildPassChip } from './pass-chip';
import { applyHallTheme } from './pass-look';
import { loadPassShelves } from './pass-manifests';
import { createPassPage } from './pass-page';
import { createProfileEditor } from './profile-editor';
import { parseRoute, routeToHash, type Route } from './routes';
import { createHallTheme, type HallTheme } from './theme';

const HALL_TITLE = 'NeoArcade · The Arcade Hall';

const { games, problems } = parseCatalog(rawCatalog);
for (const problem of problems) console.warn(`hall/catalog.json: ${problem}`);

const main = document.querySelector<HTMLElement>('#main');
const backdrop = document.querySelector<HTMLElement>('#backdrop');
const mastheadTools = document.querySelector<HTMLElement>('#masthead-tools');
if (!main || !backdrop || !mastheadTools) {
  throw new Error('The Hall page is missing its #main, #backdrop or #masthead-tools element.');
}

const store = createStore('hall');
const hallTheme = createHallTheme(store);
const pass = openArcadePass();
const shelves = await loadPassShelves(games);
const tallyFor = (slug: string) =>
  playedTally(
    pass.profile,
    shelves.manifests.find((manifest) => manifest.game === slug),
  );
applyHallTheme(pass.profile.look.hallTheme, hallTheme.theme);

// Canvas text can't wait for a web font the way CSS text does, so covers start
// once the neon font is in (or after a short wait, falling back to system fonts).
await Promise.race([
  document.fonts.load("1em 'Tilt Neon'"),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]);

const lobby = createLobby(games, store);
lobby.showBadges(tallyFor);
// The featured game's first screen, blurred into light behind the whole page.
if (lobby.backdropImage) backdrop.style.backgroundImage = `url("${lobby.backdropImage}")`;
document.body.classList.toggle('has-library', games.length > 1);
document.body.classList.toggle('is-searchable', lobby.searchable);
const docs = createDocsView(games, () => hallTheme.theme);
const detail = createDetailPanel(() => navigate({ view: 'lobby' }), tallyFor);

const chip = buildPassChip(pass);
mastheadTools.append(buildThemeToggle(hallTheme), chip.element);

const editor = createProfileEditor(pass, hallTheme);
const backup = createBackupDialog(pass, (restored) =>
  passPage.announce(`Welcome back, ${restored.name}. Your Pass is restored.`),
);
const reset = createResetDialog(
  pass,
  () => backup.open('export', () => passPage.focusAction('safe-reset')),
  () => passPage.announce('Your Pass is brand new. Every badge is waiting for you.'),
);
const passPage = createPassPage(pass, shelves, store, {
  editProfile: (from) => editor.open(() => passPage.focusAction(from)),
  backUp: (tab, from) => backup.open(tab, () => passPage.focusAction(from)),
  startOver: (from) => reset.open(() => passPage.focusAction(from)),
});

main.append(lobby.element, docs.element, passPage.element);
document.body.classList.add('is-ready');
document.body.classList.toggle('is-empty', games.length === 0);

pass.subscribe(() => {
  chip.refresh();
  lobby.showBadges(tallyFor);
  applyHallTheme(pass.profile.look.hallTheme, hallTheme.theme);
});
hallTheme.onChange((theme) => {
  applyHallTheme(pass.profile.look.hallTheme, theme);
  docs.redraw();
});

let currentRoute: Route = { view: 'lobby' };

function navigate(route: Route) {
  location.hash = routeToHash(route);
}

function applyRoute() {
  const previous = currentRoute;
  const route = parseRoute(location.hash);
  const game = 'slug' in route ? games.find((entry) => entry.slug === route.slug) : undefined;
  if ('slug' in route && !game) {
    history.replaceState(null, '', routeToHash({ view: 'lobby' }));
    currentRoute = { view: 'lobby' };
  } else {
    currentRoute = route;
  }

  const showingDoc = currentRoute.view === 'doc' && game;
  const showingPass = currentRoute.view === 'pass';
  lobby.element.hidden = Boolean(showingDoc) || showingPass;
  document.body.classList.toggle('is-reading', Boolean(showingDoc) || showingPass);
  if (showingPass) {
    detail.hide();
    docs.hide();
    passPage.show();
  } else {
    passPage.hide();
    if (currentRoute.view === 'doc' && game) {
      detail.hide();
      void docs.show(game, currentRoute.doc);
    } else {
      docs.hide();
      document.title = game ? `${game.title} · NeoArcade` : HALL_TITLE;
      if (currentRoute.view === 'game' && game) detail.show(game);
      else detail.hide();
    }
  }

  // Keyboard focus follows the page, and comes back to where the player left.
  if (showingPass && previous.view !== 'pass') {
    requestAnimationFrame(() => passPage.element.focus({ preventScroll: true }));
  } else if (currentRoute.view === 'lobby' && previous.view === 'pass') {
    requestAnimationFrame(() => chip.element.focus({ preventScroll: true }));
  } else if (currentRoute.view === 'lobby' && 'slug' in previous) {
    requestAnimationFrame(() => lobby.focusGame(previous.slug));
  }
}

window.addEventListener('hashchange', applyRoute);
applyRoute();

// Esc leaves the Pass for the lobby, once no dialog is open to close first.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || currentRoute.view !== 'pass') return;
  if (document.querySelector('dialog[open]')) return;
  navigate({ view: 'lobby' });
});

startGamepadNavigation({
  scope: () => document.querySelector<HTMLElement>('dialog[open]') ?? document.body,
  back() {
    const openDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (openDialog && !detail.openSlug) openDialog.close();
    else if (currentRoute.view === 'doc') navigate({ view: 'game', slug: currentRoute.slug });
    else if (currentRoute.view === 'game' || currentRoute.view === 'pass') {
      navigate({ view: 'lobby' });
    }
  },
  stepGenre: (delta) => lobby.stepGenre(delta),
  start() {
    if (detail.openSlug) detail.play();
    else if (currentRoute.view === 'lobby') lobby.playFeatured();
  },
});

function buildThemeToggle(theme: HallTheme): HTMLButtonElement {
  const button = h('button', { class: 'theme-toggle', type: 'button' });
  const render = () => {
    const next = theme.theme === 'light' ? 'dark' : 'light';
    button.replaceChildren(icon(next === 'light' ? ICONS.sun : ICONS.moon));
    button.setAttribute('aria-label', `Switch to the ${next} theme`);
    button.title = `Switch to the ${next} theme`;
  };
  button.addEventListener('click', () => theme.toggle());
  theme.onChange(render);
  render();
  return button;
}
