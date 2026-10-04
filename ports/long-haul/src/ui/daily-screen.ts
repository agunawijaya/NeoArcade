import { monthGrid, type DailyDay, type DailyEntry, type Streak } from '@shared/daily';
import { placeById } from '../data/places';
import { CARGO } from '../engine/cargo';
import { durationName } from '../engine/clock';
import { cargoEmoji, type DailyHaul, type DailyResult } from '../engine/daily-haul';
import type { TyreOrder } from '../engine/trip';
import type { Units } from '../settings';
import { TYRE_CHOICES, type TyreChoice } from './dispatch-screen';
import { button, fill, h, icon } from './dom';
import { distance, money, pounds } from './format';
import { ICONS } from './icons';

/**
 * The Daily Haul: today's load, the same for everyone; the first run is the
 * one that counts. A calendar of the month shows the days driven, a streak
 * keeps count, and the result can be shared as a line of text that gives
 * away the profit but not the road.
 */
export interface DailyModel {
  day: DailyDay;
  haul: DailyHaul;
  result: DailyResult | null;
  streak: Streak;
  entries: readonly DailyEntry<DailyResult>[];
  /** When the next load is posted. */
  nextAt: Date;
  shareText: string | null;
}

export interface DailyScreenOptions {
  units: () => Units;
  play: (practice: boolean, tyres: TyreOrder) => void;
  share: (text: string) => Promise<string>;
  back: () => void;
}

const SEASON_NAMES = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
} as const;
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

export class DailyScreen {
  readonly element: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly countdown: HTMLElement;
  private model: DailyModel | null = null;
  private tyre: TyreChoice = 'keep';

  constructor(private readonly options: DailyScreenOptions) {
    this.inner = h('div', { class: 'screen__inner daily' });
    this.countdown = h('span', { class: 'chip' });
    this.element = h(
      'section',
      { class: 'screen', 'aria-label': 'Daily Haul', hidden: true },
      this.inner,
    );
  }

  show(model: DailyModel) {
    this.model = model;
    this.render();
    this.element.hidden = false;
    this.element.scrollTop = 0;
    this.inner.querySelector<HTMLButtonElement>('.button--primary')?.focus();
  }

  hide() {
    this.element.hidden = true;
  }

  /** Keeps the countdown to the next load ticking. */
  frame(now: Date) {
    if (!this.model || this.element.hidden) return;
    const left = Math.max(0, this.model.nextAt.getTime() - now.getTime());
    const hours = Math.floor(left / 3_600_000);
    const minutes = Math.floor((left % 3_600_000) / 60_000);
    const text = `Next load in ${hours} h ${String(minutes).padStart(2, '0')} min`;
    if (this.countdown.textContent !== text) this.countdown.textContent = text;
  }

  private render() {
    const model = this.model;
    if (!model) return;
    const units = this.options.units();
    const { contract } = model.haul;
    const from = placeById(contract.from).name;
    const to = placeById(contract.to).name;
    const status = h('p', { class: 'daily__status', role: 'status' });

    const load = h(
      'div',
      { class: 'panel daily__load' },
      h(
        'p',
        { class: 'daily__route' },
        h('span', {}, from),
        h('span', { class: 'daily__arrow', 'aria-hidden': 'true' }, '→'),
        h('span', {}, to),
      ),
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'chip' }, `${cargoEmoji(contract.cargo)} ${CARGO[contract.cargo].name}`),
        h('span', { class: 'chip' }, pounds(contract.load)),
        h('span', { class: 'chip' }, `about ${distance(contract.miles, units)}`),
        h('span', { class: 'chip' }, SEASON_NAMES[model.haul.season]),
      ),
      h(
        'p',
        {},
        `Pays ${money(contract.payCents, true)} on delivery${contract.cargo === 'mail' ? ', whenever it arrives' : `, due ${durationName(contract.dueHours)} after you leave at 8 AM`}${contract.cargo === 'oranges' ? '; the load spoils after four days' : ''}.`,
      ),
      h(
        'p',
        { class: 'muted' },
        'Everyone gets the same load, the same weather and the same luck today. Choose the road, the speeds and the stops; only the first run counts.',
      ),
    );

    const order = () =>
      TYRE_CHOICES.find((option) => option.id === this.tyre)?.order ?? { kind: 'none' as const };
    const tyres = h(
      'div',
      { class: 'panel' },
      h('h2', { class: 'panel__title' }, 'Two of your tyres are worn'),
      h(
        'div',
        { class: 'choices choices--small', role: 'group', 'aria-label': 'Tyres' },
        ...TYRE_CHOICES.map((option) =>
          button(
            h(
              'span',
              { class: 'choice__inner' },
              h('span', { class: 'choice__title' }, option.label),
              h('span', { class: 'choice__meta' }, option.note),
            ),
            () => {
              this.tyre = option.id;
              this.render();
              this.inner.querySelector<HTMLButtonElement>(`[data-tyre="${option.id}"]`)?.focus();
            },
            'choice',
            { 'aria-pressed': this.tyre === option.id, 'data-tyre': option.id },
          ),
        ),
      ),
    );
    const result = model.result
      ? h(
          'div',
          { class: 'panel daily__result' },
          h('h2', { class: 'panel__title' }, 'Today’s run'),
          h(
            'p',
            {
              class: `daily__score ${model.result.profitCents < 0 || !model.result.delivered ? 'is-loss' : ''}`,
            },
            model.result.delivered
              ? money(model.result.profitCents, true)
              : model.result.outcome === 'crashed'
                ? 'Lost the rig'
                : 'Licence revoked',
          ),
          model.result.delivered
            ? h(
                'p',
                {},
                `${durationName(model.result.hours)} on the road · ${model.result.late ? 'late' : 'on time'} · ${model.result.tickets === 0 ? 'no tickets' : `${model.result.tickets} ticket${model.result.tickets === 1 ? '' : 's'}`}`,
              )
            : null,
          model.shareText ? h('pre', { class: 'daily__share' }, model.shareText) : null,
          h(
            'div',
            { class: 'row' },
            model.shareText
              ? button(
                  'Share',
                  async () => {
                    const outcome = await this.options.share(model.shareText ?? '');
                    status.textContent =
                      outcome === 'copied'
                        ? 'Copied to the clipboard.'
                        : outcome === 'shared'
                          ? 'Shared.'
                          : outcome === 'failed'
                            ? 'Could not share; select the text above and copy it.'
                            : '';
                  },
                  'button button--primary',
                  {},
                  icon(ICONS.share),
                )
              : null,
            button('Drive it again for practice', () => this.options.play(true, order()), 'button'),
            status,
          ),
        )
      : h(
          'div',
          { class: 'row daily__go' },
          h('span', { class: 'spacer' }),
          button(
            'Drive today’s haul',
            () => this.options.play(false, order()),
            'button button--primary',
            {},
            icon(ICONS.truck),
          ),
        );

    fill(
      this.inner,
      h(
        'div',
        { class: 'screen__head' },
        button(icon(ICONS.back), () => this.options.back(), 'button button--small button--icon', {
          'aria-label': 'Back to the title',
        }),
        h(
          'h1',
          { class: 'sign' },
          h('span', { class: 'sign__small' }, 'Daily Haul'),
          `#${model.day.number}`,
        ),
        h('span', { class: 'spacer' }),
        this.countdown,
      ),
      load,
      tyres,
      result,
      h(
        'div',
        { class: 'daily__grid' },
        h(
          'div',
          { class: 'panel daily__streak' },
          h('h2', { class: 'panel__title' }, 'Streak'),
          h('p', { class: 'daily__big' }, String(model.streak.current)),
          h(
            'p',
            { class: 'muted' },
            `day${model.streak.current === 1 ? '' : 's'} in a row · best ${model.streak.best}`,
          ),
        ),
        this.calendar(model),
      ),
    );
    this.frame(new Date());
  }

  private calendar(model: DailyModel): HTMLElement {
    const [year, month] = model.day.key.split('-').map(Number) as [number, number];
    const results = new Map(model.entries.map((entry) => [entry.key, entry.result]));
    const rows = monthGrid(year, month - 1);
    return h(
      'div',
      { class: 'panel daily__calendar' },
      h('h2', { class: 'panel__title' }, `${MONTHS[month - 1]} ${year}`),
      h(
        'table',
        { class: 'daily__month' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ...['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((name) => h('th', {}, name)),
          ),
        ),
        h(
          'tbody',
          {},
          ...rows.map((row) =>
            h(
              'tr',
              {},
              ...row.map((key) => {
                if (!key) return h('td', {});
                const result = results.get(key);
                const tone = !result
                  ? ''
                  : !result.delivered
                    ? 'is-lost'
                    : result.profitCents >= 0
                      ? 'is-profit'
                      : 'is-loss';
                const label = result
                  ? result.delivered
                    ? money(result.profitCents, true)
                    : 'lost'
                  : '';
                return h(
                  'td',
                  {
                    class: `${tone} ${key === model.day.key ? 'is-today' : ''}`,
                    title: label || undefined,
                  },
                  h('span', { class: 'daily__date' }, String(Number(key.slice(8)))),
                  result ? h('span', { class: 'daily__dot', 'aria-label': label }) : null,
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}
