import { monthGrid, nextDailyAt, type DailyLog } from '@shared/daily';
import { DAILY, dailySortieOptions, isNavalDay, shareText, type DailyResult } from '../game/daily';
import { SORTIE_MISSIONS } from '../game/sortie';
import { button, h } from './dom';
import { shareBox } from './overlays';

export interface DailyHandlers {
  log: DailyLog<DailyResult>;
  play(practice: boolean): void;
  back(): void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Today's Daily Sortie: the same battlefield for everyone on this UTC
 * date, on land or (some days) at sea. The first sortie counts; after it,
 * practise as much as you like. The streak and a calendar of past sorties
 * live here too.
 */
export function buildDailyScreen(handlers: DailyHandlers) {
  const body = h('div', { class: 'daily' });
  const element = h(
    'section',
    { class: 'screen', 'aria-labelledby': 'daily-title', hidden: true },
    h(
      'div',
      { class: 'card card--wide' },
      h('h2', { class: 'card__title card__title--small', id: 'daily-title' }, 'Daily Sortie'),
      body,
      h('div', { class: 'card__footer' }, button('Back', handlers.back, 'chip')),
    ),
  );

  const refresh = (now: Date) => {
    const today = DAILY.on(now);
    const result = handlers.log.get(today.key);
    const streak = handlers.log.streak(today.key);
    const next = nextDailyAt(now);
    const minutes = Math.max(1, Math.round((next.getTime() - now.getTime()) / 60_000));
    const clock = next.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const mission = SORTIE_MISSIONS.find(
      (candidate) => candidate.id === dailySortieOptions(today).mission,
    );
    const what = isNavalDay(today)
      ? `At sea today: ${mission?.name.toLowerCase() ?? 'a mission'} off our carrier, the landing assist on`
      : 'One round of 1984’s battle on today’s ground';
    body.replaceChildren(
      h('p', { class: 'daily__number' }, `Sortie #${today.number}`),
      h(
        'p',
        { class: 'daily__when' },
        `${what}, in smooth flight, the same for everyone. The next opens in ${Math.floor(minutes / 60)} h ${minutes % 60} min (${clock} your time).`,
      ),
      h(
        'p',
        { class: 'daily__streak' },
        streak.current > 0
          ? `${streak.current}-day streak · best ${streak.best}`
          : streak.best > 0
            ? `Best streak ${streak.best} days`
            : 'Fly today to start a streak',
      ),
      result
        ? h(
            'div',
            { class: 'daily__done' },
            h(
              'p',
              {},
              `${result.won ? 'Into the sun' : 'The End'} · ${result.score.toLocaleString('en')} points. Share it, or practise the same ground.`,
            ),
            shareBox(shareText(today, result)),
            button('Practise', () => handlers.play(true), 'card__button', {
              'data-action': 'play',
            }),
          )
        : button('Take off', () => handlers.play(false), 'card__button', {
            'data-action': 'play',
          }),
      calendar(handlers.log, now),
    );
  };

  return {
    element,
    refresh,
    focusFirst() {
      body.querySelector<HTMLElement>('[data-action="play"]')?.focus();
    },
  };
}

/** This month at a glance: a sun for a won sortie, a dot for one that ended in THE END. */
function calendar(log: DailyLog<DailyResult>, now: Date): HTMLElement {
  const weeks = monthGrid(now.getUTCFullYear(), now.getUTCMonth());
  const todayKey = DAILY.on(now).key;
  return h(
    'table',
    { class: 'calendar' },
    h(
      'caption',
      {},
      now.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    ),
    h('tr', {}, ...WEEKDAYS.map((day) => h('th', { scope: 'col' }, day))),
    ...weeks.map((week) =>
      h(
        'tr',
        {},
        ...week.map((key) => {
          if (!key) return h('td', {});
          const result = log.get(key);
          const mark = result ? (result.won ? '☀' : '•') : '';
          return h(
            'td',
            { class: key === todayKey ? 'calendar__today' : undefined },
            h('span', { class: 'calendar__day' }, String(Number(key.slice(8)))),
            h('span', { class: 'calendar__mark' }, mark),
          );
        }),
      ),
    ),
  );
}
