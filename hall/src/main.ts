import '@shared/fonts/tilt-neon.css';
import '../styles/base.css';
import '../styles/masthead.css';
import '../styles/lobby.css';
import '../styles/shelves.css';
import '../styles/today.css';
import '../styles/screens.css';
import '../styles/timeline.css';
import '../styles/detail.css';
import '../styles/docs.css';
import '../styles/sheets.css';
import '../styles/pass.css';

import { isHistoryKey, playCounts } from '@shared/last-played';
import { openArcadePass, playedTally } from '@shared/pass';
import { createStore } from '@shared/storage';
import rawCatalog from '../catalog.json';
import { createBackupDialog, createResetDialog } from './backup-dialogs';
import { parseCatalog } from './catalog';
import { createCategoryPage } from './category-page';
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
import { createTimelinePage } from './timeline-page';

const HALL_TITLE = 'NeoArcade · The Arcade Hall';

const { games, problems } = parseCatalog(await catalogSource());
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
const categoryPage = createCategoryPage(games, store, () => playCounts());
categoryPage.showBadges(tallyFor);
const timeline = createTimelinePage(games);
// The featured game's first screen, blurred into light behind the whole page.
if (lobby.backdropImage) backdrop.style.backgroundImage = `url("${lobby.backdropImage}")`;
document.body.classList.toggle('has-library', games.length > 1);
document.body.classList.toggle('is-searchable', lobby.searchable);
const docs = createDocsView(games, () => hallTheme.theme);
const detail = createDetailPanel(() => navigate(background), tallyFor);

const chip = buildPassChip(pass);
const timelineLink = h(
  'a',
  { class: 'masthead-link', href: routeToHash({ view: 'timeline' }), title: 'Origins timeline' },
  icon(ICONS.timeline),
  h('span', { class: 'masthead-link__text' }, 'Origins'),
);
if (games.length > 0) mastheadTools.append(timelineLink);
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
const passPage = createPassPage(pass, shelves, store, games, {
  editProfile: (from) => editor.open(() => passPage.focusAction(from)),
  backUp: (tab, from) => backup.open(tab, () => passPage.focusAction(from)),
  startOver: (from) => reset.open(() => passPage.focusAction(from)),
});

main.append(lobby.element, categoryPage.element, timeline.element, docs.element, passPage.element);
document.body.classList.add('is-ready');
document.body.classList.toggle('is-empty', games.length === 0);

pass.subscribe(() => {
  chip.refresh();
  lobby.showBadges(tallyFor);
  categoryPage.showBadges(tallyFor);
  applyHallTheme(pass.profile.look.hallTheme, hallTheme.theme);
});

// Games write their dailies and the play history while the Hall waits in
// another tab, or in the back-forward cache: read them again on the way back.
const writtenByAGame = (key: string | null) =>
  isHistoryKey(key) || games.some((game) => key?.startsWith(`neoarcade:${game.slug}:`));
window.addEventListener('storage', (event) => {
  if (writtenByAGame(event.key)) lobby.refresh();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) lobby.refresh();
});
hallTheme.onChange((theme) => {
  applyHallTheme(pass.profile.look.hallTheme, theme);
  docs.redraw();
});

let currentRoute: Route = { view: 'lobby' };
/** The page a game's detail panel opens over, and that closing it returns to. */
let background: Route = { view: 'lobby' };

function navigate(route: Route) {
  location.hash = routeToHash(route);
}

/** The route as asked, with unknown games sent somewhere sensible. */
function resolveRoute(route: Route): Route {
  if (route.view === 'timeline') {
    const known = !route.slug || games.some((game) => game.slug === route.slug);
    return known ? route : { view: 'timeline' };
  }
  if ('slug' in route && !games.some((game) => game.slug === route.slug)) return { view: 'lobby' };
  return route;
}

function applyRoute() {
  const previous = currentRoute;
  const asked = parseRoute(location.hash);
  const route = resolveRoute(asked);
  if (route !== asked) history.replaceState(null, '', routeToHash(route));
  currentRoute = route;

  if (route.view === 'lobby' || route.view === 'category' || route.view === 'timeline') {
    background = route;
  } else if (route.view !== 'game') {
    background = { view: 'lobby' };
  }
  const page: Route = route.view === 'game' ? background : route;
  const game = 'slug' in route ? games.find((entry) => entry.slug === route.slug) : undefined;

  // Back on the lobby from another page, e.g. after clearing the history on the Pass page.
  if (page.view === 'lobby' && lobby.element.hidden) lobby.refresh();
  lobby.element.hidden = page.view !== 'lobby';
  document.body.classList.toggle('is-reading', page.view !== 'lobby');
  if (page.view === 'category') categoryPage.show(page.category);
  else categoryPage.hide();
  if (page.view === 'timeline') timeline.show(page.slug);
  else timeline.hide();
  if (page.view === 'pass') passPage.show();
  else passPage.hide();
  if (page.view === 'doc' && game) void docs.show(game, page.doc);
  else docs.hide();
  if (page.view === 'lobby') document.title = HALL_TITLE;
  timelineLink.setAttribute('aria-current', page.view === 'timeline' ? 'page' : 'false');

  if (route.view === 'game' && game) {
    document.title = `${game.title} · NeoArcade`;
    detail.show(game);
  } else {
    detail.hide();
  }
  restoreFocus(previous, route);
}

// Keyboard focus follows the page, and comes back to where the player left.
function restoreFocus(previous: Route, route: Route) {
  const later = (action: () => void) => requestAnimationFrame(action);
  const from = previous.view;
  if (route.view === 'pass' && from !== 'pass') {
    later(() => passPage.element.focus({ preventScroll: true }));
  } else if (route.view === 'category' && from !== 'game' && from !== 'category') {
    later(() => categoryPage.element.focus({ preventScroll: true }));
  } else if (route.view === 'timeline' && from !== 'game' && from !== 'timeline') {
    later(() => timeline.focusSelected());
  } else if ((from === 'game' || from === 'doc') && 'slug' in previous) {
    const slug = previous.slug;
    if (route.view === 'lobby') later(() => lobby.focusGame(slug));
    else if (route.view === 'category') later(() => categoryPage.focusGame(slug));
  } else if (route.view === 'lobby' && from === 'pass') {
    later(() => chip.element.focus({ preventScroll: true }));
  } else if (route.view === 'lobby' && from === 'timeline') {
    later(() => timelineLink.focus({ preventScroll: true }));
  } else if (route.view === 'lobby' && previous.view === 'category') {
    const category = previous.category;
    later(() => lobby.focusCategory(category));
  }
}

window.addEventListener('hashchange', applyRoute);
applyRoute();

// Esc leaves a page for the lobby, once no dialog is open to close first.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (!['pass', 'category', 'timeline'].includes(currentRoute.view)) return;
  if (document.querySelector('dialog[open]')) return;
  navigate({ view: 'lobby' });
});

startGamepadNavigation({
  scope: () => document.querySelector<HTMLElement>('dialog[open]') ?? document.body,
  move: (direction) => currentRoute.view === 'lobby' && lobby.move(direction),
  back() {
    const openDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (openDialog && !detail.openSlug) openDialog.close();
    else if (currentRoute.view === 'doc') navigate({ view: 'game', slug: currentRoute.slug });
    else if (currentRoute.view === 'game') navigate(background);
    else if (currentRoute.view !== 'lobby') navigate({ view: 'lobby' });
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

/**
 * The catalog the Hall shows. On the dev server, `?fixture=big` swaps in
 * forty pretend games to prove the shelves scale; the build never sees it.
 */
async function catalogSource(): Promise<unknown> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('fixture') === 'big') {
    const fixtures = import.meta.glob<(real: unknown) => unknown>('../dev/big-catalog.ts', {
      import: 'bigCatalog',
    });
    for (const load of Object.values(fixtures)) return (await load())(rawCatalog);
  }
  return rawCatalog;
}
