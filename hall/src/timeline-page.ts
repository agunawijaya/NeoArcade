import { categoryById } from './categories';
import { originDate, originYears, type GameEntry } from './catalog';
import { inkOn } from './colour';
import { h, icon } from './dom';
import { machineSilhouette } from './emblems';
import { ERAS } from './eras';
import { ICONS } from './icons';
import { gameUrl, launchOnClick } from './launch';
import { MACHINES } from './machines';
import { prefersReducedMotion } from './motion';
import { routeToHash } from './routes';
import { buildScreenShow, type ScreenShow } from './screen-show';
import { watchEdges } from './scroll-row';
import {
  assignLanes,
  axisYears,
  centreOf,
  fitMarkers,
  positionOf,
  timelineRange,
  type YearSpan,
} from './timeline-layout';

/**
 * The Origins timeline: every original in the Hall placed on the years it
 * came from, over the eras of home computing, each with the machine it ran
 * on. Picking one shows what is known about it beside the remake it became.
 */
export interface TimelinePage {
  element: HTMLElement;
  show(slug?: string): void;
  hide(): void;
  /** Puts keyboard focus on the picked original, where the arrow keys take over. */
  focusSelected(): void;
}

/** A marker's width on the track, label included, in pixels. */
const MARKER_WIDTH = 164;

export function createTimelinePage(games: readonly GameEntry[]): TimelinePage {
  const ordered = [...games].sort(
    (a, b) => centreOf(originYears(a.origin)) - centreOf(originYears(b.origin)),
  );
  const range = timelineRange(ordered.map((game) => originYears(game.origin)));
  const { yearWidth, lanes: markerLanes } = fitMarkers(
    ordered.map((game) => centreOf(originYears(game.origin))),
    MARKER_WIDTH,
  );
  const laneCount = Math.max(1, ...markerLanes.map((lane) => lane + 1));

  const panel = h('div', {
    class: 'origin-detail',
    role: 'tabpanel',
    id: 'origin-detail',
    'aria-live': 'polite',
  });
  const markers = ordered.map((game, index) => buildMarker(game, range, markerLanes[index] ?? 0));
  const markerList = h(
    'div',
    {
      class: 'timeline__markers',
      role: 'tablist',
      'aria-label': 'The originals, oldest first',
      style: `--lanes: ${laneCount}`,
    },
    ...markers,
  );
  const track = h(
    'div',
    {
      class: 'timeline__track',
      style: `--years: ${range.to - range.from}; --year-width: ${yearWidth}px`,
    },
    markerList,
    buildAxis(range, ordered),
    buildEras(range),
  );
  const scroller = h('div', { class: 'timeline__scroller edge-fade' }, track);
  watchEdges(scroller);

  const element = h(
    'section',
    { class: 'timeline', hidden: true, tabindex: -1, 'aria-labelledby': 'timeline-title' },
    h(
      'div',
      { class: 'page-bar' },
      h(
        'a',
        { class: 'page-bar__back', href: routeToHash({ view: 'lobby' }) },
        icon(ICONS.back),
        'The Hall',
      ),
    ),
    h(
      'header',
      { class: 'timeline__intro' },
      h('p', { class: 'timeline__eyebrow' }, `${range.from} – today`),
      h('h1', { class: 'timeline__title', id: 'timeline-title' }, 'Origins'),
      h(
        'p',
        { class: 'timeline__lede' },
        'Every game in the Hall began as a program someone typed in, traded on a disk or found on a new computer. Here they are in the order they first appeared, on the machines they ran on.',
      ),
    ),
    scroller,
    h(
      'p',
      { class: 'timeline__note' },
      'A soft band means nobody can vouch for the exact year. The eras behind are rough edges, not dates.',
    ),
    panel,
  );

  let selected: string | null = null;
  let screens: ScreenShow | null = null;

  const select = (slug: string, { focus = false, scroll = true } = {}) => {
    const game = ordered.find((candidate) => candidate.slug === slug) ?? ordered[0];
    if (!game) return;
    const changed = selected !== game.slug;
    selected = game.slug;
    for (const marker of markers) {
      const isSelected = marker.dataset.slug === game.slug;
      marker.setAttribute('aria-selected', String(isSelected));
      marker.tabIndex = isSelected ? 0 : -1;
      if (isSelected) {
        if (focus) marker.focus({ preventScroll: true });
        if (scroll) revealMarker(scroller, marker);
      }
    }
    for (const moment of track.querySelectorAll<HTMLElement>('.timeline__moment')) {
      moment.classList.toggle('is-selected', moment.dataset.slug === game.slug);
    }
    if (changed) {
      screens?.dispose();
      screens = buildScreenShow(game, { cycle: false, eager: true });
      panel.replaceChildren(...buildDetail(game, screens));
      panel.setAttribute('aria-labelledby', `origin-marker-${game.slug}`);
      element.style.setProperty('--accent', game.accent);
      element.style.setProperty('--on-accent', inkOn(game.accent));
    }
    const hash = routeToHash({ view: 'timeline', slug: game.slug });
    if (location.hash !== hash) history.replaceState(null, '', hash);
  };

  // Selection follows focus, as in any tab list: arrows, Tab and a gamepad all pick.
  markerList.addEventListener('focusin', (event) => {
    const marker = (event.target as Element).closest<HTMLElement>('.origin-marker');
    if (marker?.dataset.slug && marker.dataset.slug !== selected) select(marker.dataset.slug);
  });
  markerList.addEventListener('click', (event) => {
    const marker = (event.target as Element).closest<HTMLElement>('.origin-marker');
    if (marker?.dataset.slug) select(marker.dataset.slug, { focus: true });
  });
  markerList.addEventListener('keydown', (event) => {
    const index = markers.findIndex((marker) => marker.dataset.slug === selected);
    const steps: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      Home: 0,
      End: markers.length - 1,
    };
    const next = markers[steps[event.key] ?? -1];
    if (!next?.dataset.slug) return;
    event.preventDefault();
    event.stopPropagation();
    select(next.dataset.slug, { focus: true });
  });

  return {
    element,
    show(slug) {
      const opening = element.hidden;
      element.hidden = false;
      document.title = 'Origins · NeoArcade';
      select(slug ?? selected ?? ordered[0]?.slug ?? '', { scroll: true });
      if (opening) window.scrollTo({ top: 0 });
    },
    hide() {
      element.hidden = true;
    },
    focusSelected() {
      markers.find((marker) => marker.dataset.slug === selected)?.focus({ preventScroll: true });
    },
  };
}

function buildMarker(game: GameEntry, range: YearSpan, lane: number): HTMLElement {
  const { origin } = game;
  const span = originYears(origin);
  return h(
    'button',
    {
      class: 'origin-marker',
      type: 'button',
      role: 'tab',
      id: `origin-marker-${game.slug}`,
      'aria-controls': 'origin-detail',
      'aria-selected': 'false',
      tabindex: -1,
      'data-slug': game.slug,
      style: `--at: ${positionOf(centreOf(span), range)}; --lane: ${lane}; --accent: ${game.accent}`,
    },
    h('span', { class: 'origin-marker__machine' }, machineSilhouette(origin.machine)),
    h(
      'span',
      { class: 'origin-marker__text' },
      h('span', { class: 'origin-marker__title' }, origin.title),
      h('span', { class: 'origin-marker__year' }, originDate(origin)),
    ),
  );
}

/** Year ticks, and each original's moment on the line: a dot, or a soft band for a vague year. */
function buildAxis(range: YearSpan, games: readonly GameEntry[]): HTMLElement {
  const ticks = axisYears(range).map(({ year, major }) =>
    h(
      'span',
      {
        class: `timeline__tick${major ? ' timeline__tick--major' : ''}`,
        style: `--at: ${positionOf(year, range)}`,
      },
      major ? h('span', { class: 'timeline__year' }, String(year)) : null,
    ),
  );
  const moments = games.map((game) => {
    const span = originYears(game.origin);
    const vague = span.from !== span.to;
    return h('span', {
      class: `timeline__moment${vague ? ' timeline__moment--vague' : ''}`,
      style: `--from: ${positionOf(span.from, range)}; --to: ${positionOf(span.to, range)}; --accent: ${game.accent}`,
      'data-slug': game.slug,
    });
  });
  return h('div', { class: 'timeline__axis', 'aria-hidden': 'true' }, ...ticks, ...moments);
}

function buildEras(range: YearSpan): HTMLElement {
  const visible = ERAS.filter((era) => (era.to ?? range.to) > range.from && era.from < range.to);
  const lanes = assignLanes(visible.map((era) => ({ from: era.from, to: era.to ?? range.to })));
  const bands = visible.map((era, index) => {
    const from = Math.max(era.from, range.from);
    const to = Math.min(era.to ?? range.to, range.to);
    const open = era.from < range.from ? ' is-open-start' : '';
    const ongoing = era.to === null || era.to > range.to ? ' is-open-end' : '';
    const years = `${era.from}–${era.to ?? 'today'}`;
    return h(
      'li',
      {
        class: `era era--${era.tone}${open}${ongoing}`,
        style: `--from: ${positionOf(from, range)}; --to: ${positionOf(to, range)}; --lane: ${lanes[index] ?? 0}`,
      },
      h('span', { class: 'era__name' }, era.name),
      h('span', { class: 'era__years' }, years),
    );
  });
  const laneCount = Math.max(1, ...lanes.map((lane) => lane + 1));
  return h(
    'ul',
    {
      class: 'timeline__eras',
      'aria-label': 'Eras of home computing',
      style: `--lanes: ${laneCount}`,
    },
    ...bands,
  );
}

function buildDetail(game: GameEntry, screens: ScreenShow): HTMLElement[] {
  const { origin } = game;
  const play = h(
    'a',
    { class: 'button button--play', href: gameUrl(game), 'aria-label': `Play ${game.title}` },
    icon(ICONS.play),
    'Play',
  );
  launchOnClick(play);
  const fact = (term: string, value: string | undefined) =>
    value ? h('div', { class: 'origin-facts__fact' }, h('dt', {}, term), h('dd', {}, value)) : null;

  return [
    h(
      'article',
      { class: 'origin-facts', 'aria-labelledby': 'origin-facts-title' },
      h('span', { class: 'origin-facts__machine' }, machineSilhouette(origin.machine)),
      h('p', { class: 'origin-facts__eyebrow' }, `The original · ${originDate(origin)}`),
      h('h2', { class: 'origin-facts__title', id: 'origin-facts-title' }, origin.title),
      h(
        'dl',
        { class: 'origin-facts__list' },
        fact(origin.publisher ? 'Written by' : 'By', origin.author),
        fact('Published by', origin.publisher),
        fact('Language', origin.language),
        fact('Ran on', origin.platform),
        fact('First appeared', origin.appeared),
      ),
      h('p', { class: 'visually-hidden' }, `Drawn as ${MACHINES[origin.machine].name}.`),
    ),
    h(
      'p',
      { class: 'origin-detail__link', 'aria-hidden': 'true' },
      h('span', {}, 'reborn as'),
      icon(ICONS.forward),
    ),
    h(
      'article',
      { class: 'origin-remake', 'aria-labelledby': 'origin-remake-title' },
      h('div', { class: 'origin-remake__screen' }, screens.element),
      h(
        'div',
        { class: 'origin-remake__body' },
        h(
          'p',
          { class: 'origin-remake__eyebrow' },
          `The remake · ${categoryById(game.category).name}`,
        ),
        h('h2', { class: 'origin-remake__title', id: 'origin-remake-title' }, game.title),
        h('p', { class: 'origin-remake__tagline' }, game.tagline),
        h(
          'div',
          { class: 'origin-remake__actions' },
          play,
          h(
            'a',
            { class: 'button', href: routeToHash({ view: 'doc', slug: game.slug, doc: 'about' }) },
            icon(ICONS.about),
            'About',
          ),
        ),
      ),
    ),
  ];
}

/** Brings a marker into the middle of the scrolling timeline when it is not already in view. */
function revealMarker(scroller: HTMLElement, marker: HTMLElement) {
  const box = marker.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  if (box.left >= view.left + 16 && box.right <= view.right - 16) return;
  const target = scroller.scrollLeft + box.left - view.left - (view.width - box.width) / 2;
  scroller.scrollTo({ left: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}
