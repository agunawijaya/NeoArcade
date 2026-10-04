import { placeById } from '../data/places';
import { CONDITIONS, type ConditionId } from '../engine/conditions';
import { conditionAt, conditionSeverity, type WeatherSystem } from '../engine/living-weather';
import { pointAlong } from '../engine/position';
import { countEvents, knownTolls, type Route } from '../engine/route';
import { networkLines, routeTowns } from '../game/map-layers';
import { boundsOf, routeLine } from '../map/route-geometry';
import type { MapLayers, MapRoute } from '../render/map-painter';
import type { Units } from '../settings';
import type { Theme } from '../theme';
import { button, h, icon } from './dom';
import { distance, money } from './format';
import { ICONS } from './icons';
import { MapCanvas } from './map-canvas';

/**
 * Route planning: the candidate roads on the map, and a card for each that
 * compares what can be known before leaving: distance, tolls, scales, work
 * zones, radar spots, the clock, the patrols, and the weather.
 */
export interface RouteCandidate {
  route: Route;
  /** "Northern route" or the roads it follows. */
  title: string;
  roads: string;
  /** Living weather only: the systems the forecast reads. */
  sky?: readonly WeatherSystem[];
}

export interface PlannerOptions {
  theme: () => Theme;
  units: () => Units;
  reducedMotion: () => boolean;
  back: () => void;
}

const COLOURS = ['#c8322a', '#2f6fbf', '#c27c0e'];

export class PlannerScreen {
  readonly element: HTMLElement;
  private readonly map: MapCanvas;
  private readonly cards: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly brief: HTMLElement;
  private readonly go: HTMLButtonElement;
  private candidates: RouteCandidate[] = [];
  private selected = 0;
  private onGo: ((candidate: RouteCandidate) => void) | null = null;

  constructor(private readonly options: PlannerOptions) {
    this.map = new MapCanvas({
      className: 'planner__map',
      interactive: true,
      label: 'Map of the candidate routes. Drag to pan, scroll or pinch to zoom.',
      style: () => (options.theme() === 'light' ? 'paper' : 'night'),
      layers: () => this.layers(),
      reducedMotion: options.reducedMotion,
      onPick: (x, y) => this.pickNear(x, y),
    });
    this.cards = h('div', { class: 'planner__cards', role: 'radiogroup', 'aria-label': 'Routes' });
    this.heading = h('h1', { class: 'sign' });
    this.brief = h('p', { class: 'planner__brief' });
    this.go = button(
      'Hit the road',
      () => this.start(),
      'button button--primary',
      {},
      icon(ICONS.truck),
    );
    this.element = h(
      'section',
      { class: 'screen planner', 'aria-label': 'Plan the route', hidden: true },
      h(
        'div',
        { class: 'screen__inner' },
        h(
          'div',
          { class: 'screen__head' },
          button(icon(ICONS.back), () => options.back(), 'button button--small button--icon', {
            'aria-label': 'Back',
          }),
          this.heading,
          h('span', { class: 'spacer' }),
          this.go,
        ),
        this.brief,
        h(
          'div',
          { class: 'planner__grid' },
          h(
            'div',
            { class: 'planner__mapbox panel' },
            this.map.element,
            h(
              'div',
              { class: 'planner__zoom' },
              button('+', () => this.map.zoomBy(1.3), 'button button--small button--icon', {
                'aria-label': 'Zoom in',
              }),
              button('−', () => this.map.zoomBy(1 / 1.3), 'button button--small button--icon', {
                'aria-label': 'Zoom out',
              }),
            ),
          ),
          this.cards,
        ),
      ),
    );
  }

  show(
    title: string,
    brief: string,
    candidates: RouteCandidate[],
    onGo: (candidate: RouteCandidate) => void,
  ) {
    this.candidates = candidates;
    this.selected = 0;
    this.onGo = onGo;
    this.heading.replaceChildren(h('span', { class: 'sign__small' }, 'Plan the route'), title);
    this.brief.textContent = brief;
    this.element.hidden = false;
    this.renderCards();
    requestAnimationFrame(() => {
      const lines = candidates.flatMap((candidate) => routeLine(candidate.route));
      this.map.frame(boundsOf(lines), 70);
      this.map.draw();
      this.cards.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    });
  }

  hide() {
    this.element.hidden = true;
  }

  frame(dt: number) {
    if (!this.element.hidden) this.map.draw(dt);
  }

  private start() {
    const candidate = this.candidates[this.selected];
    if (candidate && this.onGo) this.onGo(candidate);
  }

  private select(index: number) {
    this.selected = index;
    this.renderCards();
    this.cards.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)?.focus();
  }

  private renderCards() {
    const units = this.options.units();
    this.cards.replaceChildren(
      ...this.candidates.map((candidate, index) => {
        const { route } = candidate;
        const facts = describeRoute(route, units, candidate.sky);
        const card = button(
          h(
            'span',
            { class: 'choice__inner' },
            h('span', {
              class: 'planner__swatch',
              style: `background: ${COLOURS[index] ?? '#888'}`,
            }),
            h('span', { class: 'choice__title' }, candidate.title),
            h('span', { class: 'choice__meta' }, candidate.roads),
            h(
              'dl',
              { class: 'planner__facts' },
              ...facts.flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, value)]),
            ),
          ),
          () => this.select(index),
          'choice planner__card',
          { role: 'radio', 'aria-checked': index === this.selected, 'data-index': index },
        );
        card.addEventListener('keydown', (event) => {
          const step =
            event.key === 'ArrowDown' || event.key === 'ArrowRight'
              ? 1
              : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                ? -1
                : 0;
          if (step === 0) return;
          event.preventDefault();
          this.select((index + step + this.candidates.length) % this.candidates.length);
        });
        card.tabIndex = index === this.selected ? 0 : -1;
        return card;
      }),
    );
  }

  private layers(): MapLayers {
    const routes: MapRoute[] = this.candidates.map((candidate, index) => ({
      line: routeLine(candidate.route),
      tone: index === this.selected ? 'active' : 'option',
      colour: COLOURS[index],
    }));
    // The selected route is drawn last, on top.
    routes.push(...routes.splice(this.selected, 1));
    const selected = this.candidates[this.selected];
    return {
      network: networkLines(),
      routes,
      towns: selected ? routeTowns(selected.route) : [],
      weather: selected?.sky && selected.sky.length > 0 ? { systems: selected.sky, hour: 6 } : null,
      zoneBands: true,
      stateNames: true,
    };
  }

  /** A tap near a line picks that route. */
  private pickNear(x: number, y: number) {
    let best = -1;
    let bestDistance = 30;
    this.candidates.forEach((candidate, index) => {
      for (const point of routeLine(candidate.route)) {
        const away = Math.hypot(point.x - x, point.y - y);
        if (away < bestDistance) {
          bestDistance = away;
          best = index;
        }
      }
    });
    if (best >= 0) this.select(best);
  }
}

/** The patrols and the tyres, from RH: the north is strict and easy on rubber, the south the other way. */
export function factorWords(factor: number): { patrols: string; tyres: string } {
  if (factor >= 3.5) return { patrols: 'Strict', tyres: 'Easy on tyres' };
  if (factor >= 2.5) return { patrols: 'Watchful', tyres: 'Fair to tyres' };
  if (factor >= 1.5) return { patrols: 'Average', tyres: 'Average wear' };
  return { patrols: 'Easygoing', tyres: 'Hard on tyres' };
}

function averageFactor(route: Route): number {
  let previous = 0;
  let total = 0;
  for (const stop of route.stops) {
    total += (stop.factor ?? route.factor) * (stop.mile - previous);
    previous = stop.mile;
  }
  return route.miles > 0 ? total / route.miles : route.factor;
}

function zoneChanges(route: Route): number {
  return route.stops.reduce(
    (sum, stop) => sum + stop.events.filter((event) => event.kind === 'time-zone').length,
    0,
  );
}

export function describeRoute(
  route: Route,
  units: Units,
  sky?: readonly WeatherSystem[],
): [string, string][] {
  const factor = factorWords(averageFactor(route));
  return [
    ['Distance', distance(route.miles, units)],
    ['Tolls', knownTolls(route) > 0 ? money(knownTolls(route)) : 'none'],
    ['Scales', String(countEvents(route, 'weigh-station'))],
    ['Work zones', String(countEvents(route, 'construction'))],
    ['Radar spots', String(countEvents(route, 'radar'))],
    ['Time zones', String(zoneChanges(route))],
    ['Patrols', factor.patrols],
    ['Road', factor.tyres],
    ['Weather', weatherOutlook(route, sky)],
  ];
}

/**
 * The forecast along a route, assuming a steady day's pace from departure:
 * the worst weather the systems will bring, and where.
 */
export function weatherOutlook(route: Route, sky?: readonly WeatherSystem[]): string {
  if (route.weather.kind === 'original') {
    return route.weather.profile === 'north'
      ? 'Rough: snow and blizzards likely in the east'
      : route.weather.profile === 'middle'
        ? 'Mixed: snow possible past St. Louis'
        : 'Mild: rain more than snow';
  }
  if (!sky || sky.length === 0) return 'Unknown';
  let worst: ConditionId = 'clear';
  let where = '';
  let badHours = 0;
  const pace = 40;
  for (let mile = 0; mile <= route.miles; mile += 20) {
    const hour = mile / pace;
    const point = pointAlong(route, mile);
    const condition = conditionAt(sky, point.lat, point.lon, hour, (8 + Math.round(hour)) % 24);
    if (conditionSeverity(condition) >= 2) badHours += 20 / pace;
    if (conditionSeverity(condition) > conditionSeverity(worst)) {
      worst = condition;
      const stop = route.stops.find((candidate) => candidate.mile >= mile);
      where = stop ? placeById(stop.place).name : '';
    }
  }
  if (worst === 'clear') return 'Clear skies forecast';
  return `${CONDITIONS[worst].name} near ${where}${badHours >= 1 ? `, about ${Math.round(badHours)} h of bad weather` : ''}`;
}
