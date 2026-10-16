import { monthGrid, type DailyDay, type DailyEntry, type Streak } from '@shared/daily';
import type { DailyApproach, DailyApproachResult } from '../engine/daily-approach';
import type { Deck, Level } from '../engine/flight';
import { destinationById } from '../engine/navdata';
import type { FieldWeather } from '../engine/weather';
import { h } from './dom';
import { LEVELS } from './screens';

/**
 * The Daily Approach: today's field and weather, the same for everyone;
 * the realism level and flight deck to fly it with; the first attempt is
 * the one that counts, and the result can be shared as a line of text. A
 * calendar of the month shows the days flown, and a streak keeps count.
 */
export interface DailyModel {
  day: DailyDay;
  daily: DailyApproach;
  field: FieldWeather;
  runway: string;
  result: DailyApproachResult | null;
  streak: Streak;
  entries: readonly DailyEntry<DailyApproachResult>[];
  nextAt: Date;
  level: Level;
  deck: Deck;
}

export interface DailyActions {
  fly(level: Level, deck: Deck, practice: boolean): void;
  share(): Promise<string>;
  back(): void;
}

const HOURS = { morning: 'Morning, 09:20', dusk: 'Dusk, 17:35', night: 'Night, 20:15' } as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const visibility = (miles: number) =>
  miles >= 10
    ? '10 mi or more'
    : miles < 1
      ? `${miles === 0.25 ? '¼' : miles === 0.5 ? '½' : '¾'} mi`
      : `${miles} mi`;

export function dailyScreen(model: DailyModel, actions: DailyActions): HTMLElement {
  let level = model.level;
  let deck = model.deck;
  const { daily, field, result } = model;
  const destination = destinationById(daily.destination);
  const wind = `${String(Math.round(daily.wind.direction)).padStart(3, '0')}° at ${daily.wind.speedKt}${daily.wind.gustKt > 0 ? ` gusting ${daily.wind.gustKt}` : ''} kt`;
  const status = h('p', { class: 'daily-status', role: 'status' });
  const countdown = h('p', { class: 'daily-countdown' });
  const tick = () => {
    const left = Math.max(0, model.nextAt.getTime() - Date.now());
    const hours = Math.floor(left / 3_600_000);
    const minutes = Math.floor((left % 3_600_000) / 60_000);
    countdown.textContent = `The next approach in ${hours} h ${String(minutes).padStart(2, '0')} min`;
  };
  tick();
  const timer = setInterval(() => {
    if (!countdown.isConnected) clearInterval(timer);
    else tick();
  }, 30_000);

  const radios = <T extends string>(
    name: string,
    options: { id: T; name: string }[],
    current: T,
    change: (value: T) => void,
  ) =>
    h(
      'div',
      { class: 'brief-options', role: 'radiogroup', 'aria-label': name },
      ...options.map((option) => {
        const input = h('input', {
          type: 'radio',
          name,
          value: option.id,
          checked: option.id === current,
        });
        input.addEventListener('change', () => change(option.id));
        return h('label', { class: 'brief-option' }, input, h('strong', {}, option.name));
      }),
    );

  const conditions = h(
    'div',
    { class: 'panel daily-card' },
    h('p', { class: 'daily-field' }, `${destination.city}`),
    h(
      'p',
      { class: 'daily-runway' },
      `${destination.airport} · ILS runway ${model.runway} · 15 miles out`,
    ),
    h(
      'ul',
      { class: 'daily-chips' },
      h('li', {}, field.ceilingFt === null ? 'No ceiling' : `Ceiling ${field.ceilingFt} ft`),
      h('li', {}, `Visibility ${visibility(field.visibilityMi)}${field.rain ? ', rain' : ''}`),
      h('li', {}, `Wind ${wind}`),
      h('li', {}, HOURS[daily.timeOfDay]),
      h('li', {}, `Altimeter ${field.qnh.toFixed(2)}`),
    ),
    h(
      'p',
      { class: 'muted' },
      'Everyone flies the same approach today. Only the first attempt counts: stabilised at 1,000 and 500 ft, then the touchdown, the point, the centreline and the flare.',
    ),
  );

  const choices = h(
    'div',
    { class: 'daily-choices' },
    h(
      'fieldset',
      { class: 'brief-group' },
      h('legend', {}, 'Realism'),
      radios('daily-level', LEVELS, level, (value) => (level = value)),
    ),
    h(
      'fieldset',
      { class: 'brief-group' },
      h('legend', {}, 'Flight deck'),
      radios(
        'daily-deck',
        [
          { id: 'classic' as Deck, name: 'Classic' },
          { id: 'glass' as Deck, name: 'Glass' },
        ],
        deck,
        (value) => (deck = value),
      ),
    ),
  );

  const outcome = result
    ? h(
        'div',
        { class: 'panel daily-result' },
        h('p', { class: 'debrief-stars' }, result.starsText),
        h(
          'p',
          {},
          result.landed
            ? `Landed at ${Math.round(result.sinkFpm ?? 0)} fpm · ${result.points} points · ${LEVELS.find((one) => one.id === result.level)?.name ?? ''}, ${result.deck} deck`
            : 'Did not land',
        ),
        h(
          'div',
          { class: 'report-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'primary',
              onclick: () => void actions.share().then((said) => (status.textContent = said)),
            },
            'Share the result',
          ),
          h(
            'button',
            { type: 'button', class: 'menu-link', onclick: () => actions.fly(level, deck, true) },
            'Fly it again (practice)',
          ),
        ),
        status,
      )
    : h(
        'div',
        { class: 'report-actions' },
        h(
          'button',
          { type: 'button', class: 'primary', onclick: () => actions.fly(level, deck, false) },
          'Fly today’s approach',
        ),
      );

  return h(
    'section',
    { class: 'screen daily', 'aria-labelledby': 'daily-title' },
    h(
      'header',
      { class: 'screen-header' },
      h('button', { type: 'button', class: 'menu-link', onclick: actions.back }, '← Back'),
      h('h2', { id: 'daily-title' }, `Daily Approach #${model.day.number}`),
      h('p', { class: 'school-progress' }, model.day.key),
    ),
    h(
      'div',
      { class: 'daily-columns' },
      h('div', {}, conditions, result ? null : choices, outcome),
      calendar(model),
    ),
    countdown,
  );
}

function calendar(model: DailyModel): HTMLElement {
  const [year, month] = model.day.key.split('-').map(Number) as [number, number];
  const results = new Map(model.entries.map((entry) => [entry.key, entry.result]));
  const weeks = monthGrid(year, month - 1);
  return h(
    'div',
    { class: 'panel daily-calendar' },
    h('p', { class: 'daily-streak' }, `Streak ${model.streak.current} · best ${model.streak.best}`),
    h(
      'table',
      { class: 'daily-month', 'aria-label': `${MONTHS[month - 1]} ${year}` },
      h('caption', {}, `${MONTHS[month - 1]} ${year}`),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => h('th', { scope: 'col' }, day)),
        ),
      ),
      h(
        'tbody',
        {},
        ...weeks.map((week) =>
          h(
            'tr',
            {},
            ...week.map((key) => {
              if (!key) return h('td', {});
              const result = results.get(key);
              return h(
                'td',
                {
                  class: `${key === model.day.key ? 'today' : ''}${result ? ' flown' : ''}`,
                  title: result ? `${key}: ${result.starsText}` : key,
                },
                h('span', {}, String(Number(key.slice(8)))),
                result ? h('small', {}, result.landed ? result.starsText : '💥') : null,
              );
            }),
          ),
        ),
      ),
    ),
  );
}
