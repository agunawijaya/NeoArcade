import { monthGrid, nextDailyAt, type DailyLog } from '@shared/daily';
import { DAILY, shareText, type DailyResult } from '../game/daily';
import { button, h, icon } from './dom';
import { ICONS } from './icons';
import { shareBox } from './overlays';

export interface DailyHandlers {
  log: DailyLog<DailyResult>;
  play(practice: boolean): void;
  back(): void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Today's Daily Road: the same road for everyone on this UTC date. The first
 * run counts; after it, practise as much as you like. The streak and a
 * calendar of past roads live here too.
 */
export function buildDailyScreen(handlers: DailyHandlers) {
  const body = h('div', { class: 'daily' });
  let shownMonth: { year: number; month: number } | null = null;
  let now = new Date();

  const element = h(
    'section',
    { class: 'screen screen--panel', 'aria-labelledby': 'daily-title', hidden: true },
    h(
      'div',
      { class: 'panel daily-panel' },
      h('h2', { class: 'panel__title', id: 'daily-title' }, 'Daily Road'),
      body,
      h(
        'div',
        { class: 'panel__footer' },
        button('Back', handlers.back, 'button button--quiet', {}, icon(ICONS.back)),
      ),
    ),
  );

  const render = () => {
    const today = DAILY.on(now);
    const result = handlers.log.get(today.key);
    const streak = handlers.log.streak(today.key);
    const next = nextDailyAt(now);
    const minutes = Math.max(1, Math.round((next.getTime() - now.getTime()) / 60_000));
    const clock = next.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const month = shownMonth ?? { year: now.getUTCFullYear(), month: now.getUTCMonth() };

    body.replaceChildren(
      h(
        'div',
        { class: 'daily__today' },
        h('p', { class: 'daily__number' }, `Road #${today.number}`),
        h(
          'p',
          { class: 'daily__when' },
          `${formatDay(today.key)} · the next road opens in ${Math.floor(minutes / 60)} h ${minutes % 60} min (${clock} your time)`,
        ),
        h(
          'p',
          { class: 'daily__streak' },
          streak.current > 0
            ? `${streak.current}-day streak · best ${streak.best}`
            : streak.best > 0
              ? `Best streak ${streak.best} days`
              : 'Drive today to start a streak',
        ),
        result
          ? h(
              'div',
              { class: 'daily__done' },
              h('p', {}, 'Today’s run is in. Share it, or practise the same road.'),
              shareBox(shareText(today, result)),
              button('Practise', () => handlers.play(true), 'button button--primary'),
            )
          : h(
              'div',
              { class: 'daily__open' },
              h('p', {}, 'One scored run. Everyone drives exactly this road today.'),
              button(
                'Drive today’s road',
                () => handlers.play(false),
                'button button--primary',
                {},
                icon(ICONS.play),
              ),
            ),
      ),
      calendar(month, today.key, handlers.log, (change) => {
        const date = new Date(Date.UTC(month.year, month.month + change, 1));
        shownMonth = { year: date.getUTCFullYear(), month: date.getUTCMonth() };
        render();
      }),
    );
  };

  return {
    element,
    refresh(date: Date) {
      now = date;
      shownMonth = null;
      render();
    },
  };
}

function calendar(
  { year, month }: { year: number; month: number },
  today: string,
  log: DailyLog<DailyResult>,
  turn: (change: number) => void,
): HTMLElement {
  const title = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return h(
    'div',
    { class: 'calendar' },
    h(
      'div',
      { class: 'calendar__head' },
      button('‹', () => turn(-1), 'calendar__turn', { 'aria-label': 'Previous month' }),
      h('strong', {}, title),
      button('›', () => turn(1), 'calendar__turn', { 'aria-label': 'Next month' }),
    ),
    h(
      'table',
      { class: 'calendar__grid' },
      h('thead', {}, h('tr', {}, ...WEEKDAYS.map((day) => h('th', { scope: 'col' }, day)))),
      h(
        'tbody',
        {},
        ...monthGrid(year, month).map((week) =>
          h(
            'tr',
            {},
            ...week.map((key) => {
              if (!key) return h('td', {});
              const result = log.get(key);
              const state = result
                ? result.finished
                  ? 'finished'
                  : 'driven'
                : key === today
                  ? 'today'
                  : 'empty';
              return h(
                'td',
                {
                  class: `calendar__day calendar__day--${state}`,
                  title: result
                    ? `${result.metres.toLocaleString('en')} m, ${result.crashes} crashes`
                    : undefined,
                },
                h('span', {}, String(Number(key.slice(8)))),
                result
                  ? h(
                      'small',
                      {},
                      result.finished ? '🏁' : `${Math.round(result.metres / 100) / 10} km`,
                    )
                  : null,
              );
            }),
          ),
        ),
      ),
    ),
  );
}

function formatDay(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
