import { deliveryIfArrivingAt } from '../engine/arrival';
import { CARGO } from '../engine/cargo';
import { shortClockName } from '../engine/clock';
import type { Ahead } from '../engine/foresight';
import { stopMile, totalMiles, type Trip } from '../engine/trip';
import { placeById } from '../data/places';
import type { Units } from '../settings';
import { h } from './dom';
import { distance } from './format';

/**
 * The slim bar across the top of the drive screen: the whole route as a
 * line, every waypoint a tick you can hover or focus for its name, the rig
 * moving along it, the next waypoint and truck stop lit, and the miles to
 * go, the ETA and the deadline in a colour that says how it is going.
 */
export type DeadlineState = 'good' | 'tight' | 'late' | 'none';

const ICONS: Partial<Record<Ahead['kind'], string>> = {
  toll: '$',
  'weigh-station': 'W',
  construction: '⚠',
  radar: 'R',
  'rock-slide': '▲',
};

export class RouteStrip {
  readonly element: HTMLElement;
  private readonly track: HTMLElement;
  private readonly done: HTMLElement;
  private readonly rig: HTMLElement;
  private readonly stopMark: HTMLElement;
  private readonly facts: HTMLElement;
  private readonly toGo: HTMLElement;
  private readonly eta: HTMLElement;
  private readonly deadline: HTMLElement;
  private ticks: HTMLButtonElement[] = [];
  private trip: Trip | null = null;
  private lastNext = -1;

  constructor() {
    this.track = h('div', { class: 'strip__track' });
    this.done = h('div', { class: 'strip__done' });
    this.rig = h('div', { class: 'strip__rig', 'aria-hidden': 'true' });
    this.stopMark = h(
      'div',
      { class: 'strip__stop', title: 'Truck stop ahead', 'aria-hidden': 'true' },
      '⛽',
    );
    this.track.append(h('div', { class: 'strip__line' }), this.done, this.stopMark, this.rig);
    this.toGo = h('span', { class: 'strip__fact' });
    this.eta = h('span', { class: 'strip__fact' });
    this.deadline = h('span', { class: 'strip__fact strip__deadline' });
    this.facts = h(
      'div',
      { class: 'strip__facts', 'aria-live': 'polite' },
      this.toGo,
      this.eta,
      this.deadline,
    );
    this.element = h('header', { class: 'strip', 'aria-label': 'Route' }, this.track, this.facts);
  }

  attach(trip: Trip) {
    this.trip = trip;
    this.lastNext = -1;
    for (const tick of this.ticks) tick.remove();
    this.ticks = [];
    const total = totalMiles(trip);
    const from = h(
      'span',
      { class: 'strip__end strip__end--from' },
      placeById(trip.route.from).name,
    );
    const to = h('span', { class: 'strip__end strip__end--to' }, placeById(trip.route.to).name);
    this.track.querySelectorAll('.strip__end').forEach((end) => end.remove());
    this.track.append(from, to);
    trip.route.stops.forEach((stop, index) => {
      const place = placeById(stop.place);
      const tick = h(
        'button',
        {
          class: `strip__tick strip__tick--${place.kind}`,
          type: 'button',
          style: `left: ${(stop.mile / total) * 100}%`,
          'data-name': stop.name,
          'aria-label': `${stop.name}, mile ${stop.mile}`,
        },
        h('span', { class: 'strip__icon', 'aria-hidden': 'true' }),
      );
      tick.tabIndex = index === 0 ? 0 : -1;
      tick.addEventListener('keydown', (event) => this.roveTicks(event, index));
      this.track.append(tick);
      this.ticks.push(tick);
    });
  }

  /** Arrow keys walk the ticks; Tab leaves the strip. */
  private roveTicks(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = this.ticks[Math.max(0, Math.min(this.ticks.length - 1, index + step))];
    if (!next) return;
    for (const tick of this.ticks) tick.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  }

  update(options: {
    mile: number;
    hr: number;
    setSpeed: number;
    units: Units;
    ahead: readonly Ahead[];
    stopAhead: boolean;
    highlightTo?: number | null;
  }) {
    const trip = this.trip;
    if (!trip) return;
    const total = totalMiles(trip);
    const share = Math.min(1, options.mile / total);
    this.done.style.width = `${share * 100}%`;
    this.rig.style.left = `${share * 100}%`;
    this.stopMark.hidden = !options.stopAhead;
    this.stopMark.style.left = `${Math.min(100, ((options.mile + options.setSpeed * 0.8) / total) * 100)}%`;

    if (trip.next !== this.lastNext) {
      this.lastNext = trip.next;
      this.ticks.forEach((tick, index) => {
        const stop = trip.route.stops[index];
        if (!stop) return;
        tick.style.left = `${(stopMile(trip, index) / total) * 100}%`;
        tick.classList.toggle('is-passed', index < trip.next);
        tick.classList.toggle('is-next', index === trip.next);
        const known = stop.events.find((event) => event.kind === 'toll');
        const icon = tick.querySelector('.strip__icon');
        if (icon) icon.textContent = known ? '$' : '';
      });
    }
    for (const ahead of options.ahead) {
      const tick = this.ticks[ahead.stop];
      const icon = tick?.querySelector('.strip__icon');
      if (icon && ICONS[ahead.kind] && !icon.textContent)
        icon.textContent = ICONS[ahead.kind] ?? '';
    }
    this.ticks.forEach((tick, index) =>
      tick.classList.toggle(
        'is-leg',
        options.highlightTo !== undefined &&
          options.highlightTo !== null &&
          index === options.highlightTo,
      ),
    );

    const remaining = Math.max(0, total - options.mile);
    this.toGo.textContent = `${distance(remaining, options.units)} to go`;
    const etaHr = estimateArrivalHr(trip, options.hr, remaining, options.setSpeed);
    this.eta.textContent = `ETA ${shortClockName(trip.startClock + etaHr)}`;
    const state = deadlineState(trip, etaHr);
    this.deadline.dataset.state = state;
    this.deadline.textContent = deadlineText(trip, state);
  }
}

/**
 * A rough arrival time: the miles left at the set speed, plus an hour's stop
 * for every four on the road and the sleep a driver will need on the way.
 */
export function estimateArrivalHr(
  trip: Trip,
  hr: number,
  remaining: number,
  speed: number,
): number {
  const driving = remaining / Math.max(30, speed);
  const stops = Math.floor(driving / 4);
  const sleep = Math.max(0, Math.floor((trip.awake + driving) / 16)) * 8;
  return Math.round(hr + driving + stops + sleep);
}

export function deadlineState(trip: Trip, etaHr: number): DeadlineState {
  const cargo = CARGO[trip.cargo];
  if (cargo.id === 'mail') return 'none';
  if (cargo.id === 'oranges') {
    // Damage starts with the first whole day past the limit, and grows each day after.
    const days = Math.floor(etaHr / 24);
    if (days <= trip.deadline.spoilAfterDays) return 'good';
    return days === trip.deadline.spoilAfterDays + 1 ? 'tight' : 'late';
  }
  if (etaHr <= trip.deadline.dueHr) return 'good';
  return deliveryIfArrivingAt(trip, etaHr).late ? 'late' : 'tight';
}

function deadlineText(trip: Trip, state: DeadlineState): string {
  if (state === 'none') return 'No hurry';
  const due = shortClockName(trip.startClock + trip.deadline.dueHr);
  if (trip.cargo === 'oranges')
    return state === 'good'
      ? `Fresh till ${due}`
      : state === 'tight'
        ? 'Oranges ripening'
        : 'Oranges at risk';
  return state === 'late' ? `Late · due ${due}` : `Due ${due}`;
}
