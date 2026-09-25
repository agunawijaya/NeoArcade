import '@shared/fonts/tilt-neon.css';
import '../styles/base.css';
import '../styles/masthead.css';
import '../styles/lobby.css';
import '../styles/cabinet.css';
import '../styles/detail.css';
import '../styles/docs.css';

import { createStore } from '@shared/storage';
import rawCatalog from '../catalog.json';
import { startAmbience } from './ambience';
import { parseCatalog } from './catalog';
import { createDetailPanel } from './detail';
import { createDocsView } from './docs-view';
import { startGamepadNavigation } from './gamepad-nav';
import { createLobby } from './lobby';
import { parseRoute, routeToHash, type Route } from './routes';

const HALL_TITLE = 'NeoArcade · The Arcade Hall';

const { games, problems } = parseCatalog(rawCatalog);
for (const problem of problems) console.warn(`hall/catalog.json: ${problem}`);

const main = document.querySelector<HTMLElement>('#main');
const ambience = document.querySelector<HTMLCanvasElement>('#ambience');
if (!main || !ambience) throw new Error('The Hall page is missing its #main or #ambience element.');

startAmbience(ambience);

// Canvas text can't wait for a web font the way CSS text does, so covers start
// once the neon font is in (or after a short wait, falling back to system fonts).
await Promise.race([
  document.fonts.load("1em 'Tilt Neon'"),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]);

const lobby = createLobby(games, createStore('hall'));
const docs = createDocsView(games);
const detail = createDetailPanel(() => navigate({ view: 'lobby' }));
main.append(lobby.element, docs.element);
document.body.classList.add('is-ready');
document.body.classList.toggle('is-empty', games.length === 0);

let currentRoute: Route = { view: 'lobby' };

function navigate(route: Route) {
  location.hash = routeToHash(route);
}

function applyRoute() {
  const previous = currentRoute;
  const route = parseRoute(location.hash);
  const game =
    route.view === 'lobby' ? undefined : games.find((entry) => entry.slug === route.slug);
  if (route.view !== 'lobby' && !game) {
    history.replaceState(null, '', routeToHash({ view: 'lobby' }));
    currentRoute = { view: 'lobby' };
  } else {
    currentRoute = route;
  }

  const showingDoc = currentRoute.view === 'doc' && game;
  lobby.element.hidden = Boolean(showingDoc);
  document.body.classList.toggle('is-reading', Boolean(showingDoc));
  if (currentRoute.view === 'doc' && game) {
    detail.hide();
    void docs.show(game, currentRoute.doc);
  } else {
    docs.hide();
    document.title = game ? `${game.title} · NeoArcade` : HALL_TITLE;
    if (currentRoute.view === 'game' && game) detail.show(game);
    else detail.hide();
  }

  // Coming back to the lobby puts focus on the cabinet the player came from.
  if (currentRoute.view === 'lobby' && previous.view !== 'lobby') {
    requestAnimationFrame(() => lobby.focusGame(previous.slug));
  }
}

window.addEventListener('hashchange', applyRoute);
applyRoute();

startGamepadNavigation({
  scope: () => (detail.openSlug ? document.querySelector('dialog[open]') : null) ?? document.body,
  back() {
    if (currentRoute.view === 'doc') navigate({ view: 'game', slug: currentRoute.slug });
    else if (currentRoute.view === 'game') navigate({ view: 'lobby' });
  },
  stepGenre: (delta) => lobby.stepGenre(delta),
  start() {
    if (detail.openSlug) detail.play();
  },
});
