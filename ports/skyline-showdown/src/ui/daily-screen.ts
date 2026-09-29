import { monthGrid, nextDailyAt, type DailyEntry, type Streak } from '@shared/daily';
import {
  DAILY_LAUNCH,
  DAILY_THROWS,
  startDaily,
  TWIST_WORDS,
  windText,
  type DailyResult,
  type DailySkyline,
} from '../daily/daily';
import { WORLDS } from '../engine/worlds';
import { drawCityPreview } from '../render/city-preview';
import type { Theme } from '../render/palette';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface DailyScreenHandlers {
  /** Start, or pick up, today's scored attempt. */
  play(): void;
  practice(): void;
  results(): void;
  back(): void;
}

export interface DailyView {
  skyline: DailySkyline;
  /** Today's scored attempt, once it is over. */
  result: DailyResult | undefined;
  /** Throws already made in an attempt left unfinished. */
  inProgress: number;
  streak: Streak;
  entries: readonly DailyEntry<DailyResult>[];
  now: Date;
  theme: Theme;
}

export interface DailyScreen {
  element: HTMLElement;
  refresh(view: DailyView): void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * The Daily Skyline's home: today's city and what makes it tricky, one
 * button for the scored attempt (or its result), practice once it is done,
 * the streak, and a calendar of every day played.
 */
export function buildDailyScreen(handlers: DailyScreenHandlers): DailyScreen {
  const streakLine = h('p', { class: 'daily__streak' });
  const dayLine = h('p', { class: 'card__chapter' });
  const picture = h('canvas', { class: 'daily__picture', 'aria-hidden': 'true' });
  const facts = h('ul', { class: 'daily__facts' });
  const twistLine = h('p', { class: 'daily__twist' });
  const status = h('p', { class: 'daily__status' });
  const actions = h('div', { class: 'menu menu--row daily__actions' });
  const nextLine = h('p', { class: 'daily__next' });
  const monthName = h('h3', { class: 'calendar__month', 'aria-live': 'polite' });
  const grid = h('div', { class: 'calendar__grid', role: 'grid' });
  const previous = h(
    'button',
    { class: 'calendar__turn', type: 'button', 'aria-label': 'Previous month' },
    icon(ICONS.back),
  );
  const following = h(
    'button',
    { class: 'calendar__turn', type: 'button', 'aria-label': 'Next month' },
    icon(ICONS.next),
  );
  const back = h(
    'button',
    { class: 'button button--quiet', type: 'button' },
    icon(ICONS.back),
    'Back',
  );
  back.addEventListener('click', handlers.back);

  const element = h(
    'section',
    { class: 'screen screen--daily', 'aria-labelledby': 'daily-title', hidden: true },
    h(
      'header',
      { class: 'tour__head' },
      back,
      h('h2', { class: 'tour__title', id: 'daily-title' }, 'Daily Skyline'),
      streakLine,
    ),
    h(
      'div',
      { class: 'daily' },
      h(
        'article',
        { class: 'panel daily__today' },
        picture,
        h('div', { class: 'daily__about' }, dayLine, facts, twistLine, status, actions, nextLine),
      ),
      h(
        'article',
        { class: 'panel calendar', 'aria-label': 'Past dailies' },
        h('header', { class: 'calendar__head' }, previous, monthName, following),
        grid,
        h(
          'p',
          { class: 'calendar__legend' },
          'The number is the throws it took · ✗ no hit · outlined: today',
        ),
      ),
    ),
  );

  let view: DailyView | null = null;
  let shown = { year: 0, month: 0 };

  const button = (label: string, symbol: string, action: () => void, primary = false) => {
    const control = h(
      'button',
      { class: `button${primary ? ' button--primary' : ''}`, type: 'button' },
      icon(symbol),
      label,
    );
    control.addEventListener('click', action);
    return control;
  };

  const drawCalendar = () => {
    if (!view) return;
    const today = view.skyline.day.key;
    const results = new Map(view.entries.map((entry) => [entry.key, entry.result]));
    monthName.textContent = new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(Date.UTC(shown.year, shown.month, 15));
    const launch = monthOf(DAILY_LAUNCH);
    const current = monthOf(today);
    previous.disabled = shown.year * 12 + shown.month <= launch.year * 12 + launch.month;
    following.disabled = shown.year * 12 + shown.month >= current.year * 12 + current.month;
    grid.replaceChildren(
      h(
        'div',
        { class: 'calendar__row', role: 'row' },
        ...WEEKDAYS.map((day) =>
          h('span', { class: 'calendar__weekday', role: 'columnheader' }, day),
        ),
      ),
      ...monthGrid(shown.year, shown.month).map((week) =>
        h(
          'div',
          { class: 'calendar__row', role: 'row' },
          ...week.map((key) => dayCell(key, today, results.get(key ?? ''))),
        ),
      ),
    );
  };

  const turn = (months: number) => {
    const index = shown.year * 12 + shown.month + months;
    shown = { year: Math.floor(index / 12), month: index % 12 };
    drawCalendar();
  };
  previous.addEventListener('click', () => turn(-1));
  following.addEventListener('click', () => turn(1));

  return {
    element,
    refresh(current) {
      view = current;
      const { skyline, result, inProgress, streak, now, theme } = current;
      const start = startDaily(skyline);
      streakLine.replaceChildren(
        icon(ICONS.flame),
        `${streak.current} day${streak.current === 1 ? '' : 's'}`,
        h('small', {}, ` · best ${streak.best}`),
      );
      streakLine.setAttribute('aria-label', `Streak: ${streak.current} days, best ${streak.best}`);
      dayLine.textContent = `Daily #${skyline.day.number} · ${dateLabel(skyline.day.key)}`;
      const twist = TWIST_WORDS[skyline.twist];
      facts.replaceChildren(
        h('li', {}, icon(ICONS.globe), WORLDS[skyline.world].name),
        h(
          'li',
          { 'aria-label': `Wind ${windText(start.round.wind)}` },
          icon(ICONS.wind),
          windText(start.round.wind),
        ),
        h('li', {}, icon(ICONS.target), twist.name),
      );
      twistLine.textContent = twist.line;
      drawCityPreview(picture, { round: start.round, target: 1, theme });

      if (result) {
        status.textContent =
          result.outcome === 'hit'
            ? `Done for today: a hit in ${result.throws} of ${DAILY_THROWS}. Practice as much as you like.`
            : 'Done for today: no hit this time. Practice for tomorrow.';
        actions.replaceChildren(
          button('See results', ICONS.star, handlers.results, true),
          button('Practice', ICONS.retry, handlers.practice),
        );
      } else if (inProgress > 0) {
        status.textContent = `Your attempt is waiting: ${inProgress} of ${DAILY_THROWS} bananas thrown.`;
        actions.replaceChildren(button('Continue', ICONS.play, handlers.play, true));
      } else {
        status.textContent = `One scored attempt, ${DAILY_THROWS} bananas. Hit the target in as few as you can.`;
        actions.replaceChildren(button('Play today’s daily', ICONS.play, handlers.play, true));
      }
      nextLine.textContent = nextDailyText(now);
      shown = monthOf(skyline.day.key);
      drawCalendar();
    },
  };
}

function dayCell(key: string | null, today: string, result: DailyResult | undefined): HTMLElement {
  if (!key) return h('span', { class: 'calendar__day calendar__day--blank', role: 'gridcell' });
  const day = Number(key.slice(8));
  const future = key > today;
  const early = key < DAILY_LAUNCH;
  const mark = result ? (result.outcome === 'hit' ? String(result.throws) : '✗') : '';
  const label = result
    ? result.outcome === 'hit'
      ? `${dateLabel(key)}: hit in ${result.throws}`
      : `${dateLabel(key)}: no hit`
    : `${dateLabel(key)}${key === today ? ', today' : ''}`;
  return h(
    'span',
    {
      class: [
        'calendar__day',
        result ? (result.outcome === 'hit' ? 'calendar__day--hit' : 'calendar__day--miss') : '',
        key === today ? 'calendar__day--today' : '',
        future || early ? 'calendar__day--off' : '',
      ]
        .filter(Boolean)
        .join(' '),
      role: 'gridcell',
      'aria-label': label,
      title: label,
    },
    h('span', { class: 'calendar__date' }, String(day)),
    mark ? h('strong', { class: 'calendar__mark' }, mark) : null,
  );
}

function monthOf(key: string): { year: number; month: number } {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
}

/** "Tue 29 Sep" for a UTC day, in the player's own language. */
export function dateLabel(key: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(Date.parse(`${key}T12:00:00Z`));
}

/** When the next daily arrives, in the player's local time. */
export function nextDailyText(now: Date): string {
  const next = nextDailyAt(now);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    next,
  );
  const minutes = Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const wait = hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
  return `Next daily at ${time} your time, in ${wait}.`;
}
