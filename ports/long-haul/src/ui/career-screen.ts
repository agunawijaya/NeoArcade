import { placeById } from '../data/places';
import { CARGO } from '../engine/cargo';
import { DAY_NAMES, hourName } from '../engine/clock';
import {
  activeOffences,
  careerDate,
  careerDateName,
  careerSeason,
  canAfford,
  careerRig,
  MILLION,
  OFFENCE_MEMORY_DAYS,
  summarise,
  UPGRADES,
  type Career,
  type CareerTrip,
  type UpgradeId,
} from '../engine/career';
import {
  contractTitle,
  DEPARTURE_CLOCK,
  LATE_GRACE,
  legalFuel,
  terminalFuel,
  type Contract,
} from '../engine/contracts';
import { DIFFICULTIES, type DifficultyId } from '../engine/difficulty';
import { RULES } from '../engine/rules';
import type { TyreOrder } from '../engine/trip';
import type { Units } from '../settings';
import { TYRE_CHOICES, type TyreChoice } from './dispatch-screen';
import { button, fill, h, icon } from './dom';
import { distance, money, pounds } from './format';
import { ICONS } from './icons';

/**
 * The career office at whichever hub the last load ended: the bank balance,
 * what shippers think of you, today's job board, the garage, and the
 * logbook of every haul so far. When a career ends, the same screen shows
 * how it went.
 */
export interface CareerScreenOptions {
  units: () => Units;
  difficulty: () => DifficultyId;
  start: () => void;
  take: (contract: Contract, tyres: TyreOrder) => void;
  wait: () => void;
  buy: (id: UpgradeId) => void;
  retire: () => void;
  back: () => void;
}

const SEASON_NAMES = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
} as const;
const SPECIAL_NAMES = { rush: 'Rush', heavy: 'Heavy', 'early-bonus': 'Early bonus' } as const;
const SPECIAL_NOTES = {
  rush: 'Rush: due sooner, pays more, and your name rises if it arrives on time.',
  heavy: 'Heavy: it pays more, but the scales fine every pound over 60,000.',
  'early-bonus': 'Early bonus: 10 % more if it arrives before it is due.',
} as const;

export class CareerScreen {
  readonly element: HTMLElement;
  private readonly inner: HTMLElement;
  private board: Contract[] = [];
  private selected = 0;
  private tyre: TyreChoice = 'keep';
  private confirmRetire = false;

  constructor(private readonly options: CareerScreenOptions) {
    this.inner = h('div', { class: 'screen__inner career' });
    this.element = h(
      'section',
      { class: 'screen', 'aria-label': 'Career', hidden: true },
      this.inner,
    );
  }

  /** The office, or the start of a career when there is none. */
  show(career: Career | null, board: Contract[]) {
    this.board = board;
    this.selected = Math.min(this.selected, Math.max(0, board.length - 1));
    this.confirmRetire = false;
    if (!career) this.renderStart();
    else if (career.status !== 'active') this.renderSummary(career);
    else this.renderOffice(career);
    this.element.hidden = false;
    this.inner.querySelector<HTMLElement>('.button--primary, [aria-checked="true"]')?.focus();
  }

  hide() {
    this.element.hidden = true;
  }

  private head(title: string, small: string, ...extra: (Node | null)[]): HTMLElement {
    return h(
      'div',
      { class: 'screen__head' },
      button(icon(ICONS.back), () => this.options.back(), 'button button--small button--icon', {
        'aria-label': 'Back to the title',
      }),
      h('h1', { class: 'sign' }, h('span', { class: 'sign__small' }, small), title),
      h('span', { class: 'spacer' }),
      ...extra,
    );
  }

  private renderStart() {
    const difficulty = DIFFICULTIES[this.options.difficulty()];
    fill(
      this.inner,
      this.head('Your own rig', 'Career'),
      h(
        'div',
        { class: 'panel career__intro' },
        h(
          'p',
          {},
          'March 1982. You have $1,000 in the bank, a rig with nearly a million miles on it, and a name nobody on the loading docks knows yet.',
        ),
        h(
          'p',
          {},
          'Haul loads between nineteen cities. Profit carries from one trip to the next: spend it on a bigger tank, a quieter cab or better tyres, or keep it for a bad week. Deliver on time and shippers offer longer, better-paying runs.',
        ),
        h(
          'p',
          { class: 'muted' },
          `A crash or a fourth offence ends it, and so does a balance below zero. Offences fall off your record after ${OFFENCE_MEMORY_DAYS} days. Difficulty: ${difficulty.name}.`,
        ),
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'spacer' }),
          button(
            'Start a career',
            () => this.options.start(),
            'button button--primary',
            {},
            icon(ICONS.truck),
          ),
        ),
      ),
    );
  }

  private renderOffice(career: Career) {
    const units = this.options.units();
    const season = careerSeason(career.day);
    const offences = activeOffences(career);
    const clearing = career.offenceDays
      .filter((day) => career.day - day < OFFENCE_MEMORY_DAYS)
      .map((day) => OFFENCE_MEMORY_DAYS - (career.day - day));
    const delivered = career.trips.filter((trip) => trip.outcome === 'delivered').length;

    const stats = h(
      'div',
      { class: 'career__stats' },
      stat(
        'Bank',
        money(career.cashCents, true),
        career.cashCents < RULES.truckDayCents * 3 ? 'bad' : undefined,
      ),
      h(
        'div',
        { class: 'career__stat' },
        h('span', { class: 'career__label' }, 'Reputation'),
        h('span', { class: 'career__value' }, reputationName(career.reputation)),
        h('meter', {
          class: 'career__meter',
          min: 0,
          max: 100,
          value: career.reputation,
          'aria-label': `Reputation ${career.reputation} of 100`,
        }),
      ),
      stat('Odometer', distance(career.odometer, units)),
      stat(
        'Record',
        offences === 0 ? 'Clean' : `${offences} offence${offences === 1 ? '' : 's'}`,
        offences >= 2 ? 'bad' : offences === 1 ? 'warn' : undefined,
        offences > 0 ? `the oldest clears in ${Math.min(...clearing)} days` : undefined,
      ),
      stat(
        'Delivered',
        String(delivered),
        undefined,
        career.odometer >= MILLION ? 'Million-mile rig' : undefined,
      ),
    );

    const contract = this.board[this.selected];
    const boardList = h(
      'div',
      { class: 'career__board', role: 'radiogroup', 'aria-label': 'Loads on the board' },
      ...this.board.map((item, index) => {
        const card = button(
          h(
            'span',
            { class: 'choice__inner' },
            h(
              'span',
              { class: 'career__route' },
              h('span', { class: 'choice__title' }, placeById(item.to).name),
              h('span', { class: 'career__pay' }, money(item.payCents, true)),
            ),
            h(
              'span',
              { class: 'choice__meta' },
              `${capitalise(item.goods)} · ${pounds(item.load)} · ${distance(item.miles, units)}`,
            ),
            h(
              'span',
              { class: 'row career__chips' },
              h('span', { class: `chip chip--cargo-${item.cargo}` }, CARGO[item.cargo].name),
              item.special
                ? h(
                    'span',
                    { class: `chip ${item.special === 'rush' ? 'chip--warn' : ''}` },
                    SPECIAL_NAMES[item.special],
                  )
                : null,
              item.cargo !== 'mail'
                ? h('span', { class: 'chip' }, `Due ${dueText(career.day, item.dueHours)}`)
                : h('span', { class: 'chip' }, 'No deadline'),
            ),
          ),
          () => {
            this.selected = index;
            this.renderOffice(career);
            this.inner.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)?.focus();
          },
          'choice career__load',
          {
            role: 'radio',
            'aria-checked': index === this.selected,
            'data-index': index,
            tabindex: index === this.selected ? 0 : -1,
          },
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
          this.selected = (index + step + this.board.length) % this.board.length;
          this.renderOffice(career);
          this.inner.querySelector<HTMLButtonElement>(`[data-index="${this.selected}"]`)?.focus();
        });
        return card;
      }),
    );

    const tyres = h(
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
            this.renderOffice(career);
          },
          'choice',
          { 'aria-pressed': this.tyre === option.id },
        ),
      ),
    );

    const detail = contract
      ? h(
          'div',
          { class: 'panel career__detail' },
          h('h2', { class: 'panel__title' }, contractTitle(contract)),
          h('p', {}, detailText(career.day, contract)),
          contract.special ? h('p', { class: 'muted' }, SPECIAL_NOTES[contract.special]) : null,
          h('p', { class: 'muted' }, scaleNote(career, contract)),
          h('h3', { class: 'career__subhead' }, 'Two of your tyres are worn'),
          tyres,
          h(
            'div',
            { class: 'row' },
            button(
              `Wait a day (−${money(RULES.truckDayCents, true)})`,
              () => this.options.wait(),
              'button button--ghost',
              { title: 'A new board tomorrow; the truck payment is due either way.' },
              icon(ICONS.calendar),
            ),
            h('span', { class: 'spacer' }),
            button(
              'Take this load',
              () => this.take(contract),
              'button button--primary',
              {},
              icon(ICONS.map),
            ),
          ),
        )
      : h(
          'div',
          { class: 'panel' },
          h('p', {}, 'Nothing on the board today.'),
          button('Wait a day', () => this.options.wait(), 'button'),
        );

    const garage = h(
      'div',
      { class: 'panel career__garage' },
      h('h2', { class: 'panel__title' }, 'Garage'),
      h(
        'div',
        { class: 'career__upgrades' },
        ...UPGRADES.map((upgrade) => {
          const fitted = career.upgrades.includes(upgrade.id);
          const affordable = canAfford(career, upgrade.cents);
          return h(
            'div',
            { class: `career__upgrade${fitted ? ' is-fitted' : ''}` },
            h(
              'div',
              { class: 'career__upgrade-head' },
              h('strong', {}, upgrade.name),
              h('span', { class: 'spacer' }),
              fitted
                ? h('span', { class: 'chip chip--good' }, 'Fitted')
                : h('span', { class: 'career__price' }, money(upgrade.cents, true)),
            ),
            h('p', { class: 'muted' }, upgrade.blurb),
            upgrade.finePrint ? h('p', { class: 'career__fine' }, upgrade.finePrint) : null,
            fitted
              ? null
              : button(
                  affordable ? 'Buy' : 'Not enough in the bank',
                  () => this.options.buy(upgrade.id),
                  'button button--small',
                  { disabled: !affordable },
                ),
          );
        }),
      ),
    );

    const history =
      career.trips.length > 0
        ? h(
            'div',
            { class: 'panel career__history' },
            h('h2', { class: 'panel__title' }, 'Logbook'),
            historyTable(career.trips.slice(-8).reverse(), units),
          )
        : null;

    const retire = this.confirmRetire
      ? h(
          'div',
          { class: 'row career__retire' },
          h('span', {}, `Hand in the keys with ${money(career.cashCents, true)} in the bank?`),
          button('Yes, retire', () => this.options.retire(), 'button button--danger button--small'),
          button(
            'Not yet',
            () => {
              this.confirmRetire = false;
              this.renderOffice(career);
            },
            'button button--small',
          ),
        )
      : h(
          'div',
          { class: 'row career__retire' },
          h('span', { class: 'spacer' }),
          button(
            'Retire',
            () => {
              this.confirmRetire = true;
              this.renderOffice(career);
            },
            'button button--ghost button--small',
          ),
        );

    fill(
      this.inner,
      this.head(
        `${placeById(career.hub).name} terminal`,
        'Career',
        h('span', { class: 'chip' }, `${careerDateName(career.day)} · ${SEASON_NAMES[season]}`),
      ),
      stats,
      h(
        'div',
        { class: 'career__grid' },
        h(
          'div',
          { class: 'panel career__jobs' },
          h('h2', { class: 'panel__title' }, 'Job board'),
          boardList,
        ),
        detail,
      ),
      garage,
      history,
      retire,
    );
  }

  private take(contract: Contract) {
    const order = TYRE_CHOICES.find((option) => option.id === this.tyre)?.order ?? { kind: 'none' };
    this.tyre = 'keep';
    this.options.take(contract, order);
  }

  private renderSummary(career: Career) {
    const units = this.options.units();
    const summary = summarise(career);
    const ending = {
      active: ['Still on the road', ''],
      retired: ['Retired', 'You handed in the keys and walked away from the dock.'],
      repossessed: ['Repossessed', 'You are bankrupt !!! Your rig has been repossessed.'],
      wrecked: ['Wrecked', 'You lose your truck & profits.'],
      jailed: ['Licence revoked', "Your I.C.C. driver's license is revoked !"],
    }[career.status];
    fill(
      this.inner,
      this.head(ending[0] ?? 'Career', 'Career over'),
      ending[1]
        ? h('div', { class: 'panel ledger__verdict' }, h('p', { class: 'ledger__line' }, ending[1]))
        : null,
      h(
        'div',
        { class: 'career__stats' },
        stat('Days', String(summary.days)),
        stat('Loads', `${summary.delivered} of ${summary.trips}`),
        stat('Driven', distance(summary.miles, units)),
        stat('Cities', String(summary.hubsVisited)),
        stat(
          summary.profitCents >= 0 ? 'Profit' : 'Loss',
          money(summary.profitCents, true),
          summary.profitCents < 0 ? 'bad' : 'good',
        ),
      ),
      summary.bestTrip
        ? h(
            'p',
            { class: 'panel' },
            `Best haul: ${contractTitle(summary.bestTrip)}, ${summary.bestTrip.goods}, for ${money(summary.bestTrip.profitCents, true)}.`,
          )
        : null,
      career.trips.length > 0
        ? h(
            'div',
            { class: 'panel career__history' },
            h('h2', { class: 'panel__title' }, 'Every haul'),
            historyTable([...career.trips].reverse(), units),
          )
        : null,
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'spacer' }),
        button('Start a new career', () => this.options.start(), 'button button--primary'),
      ),
    );
  }
}

function stat(
  label: string,
  value: string,
  tone?: 'good' | 'warn' | 'bad',
  note?: string,
): HTMLElement {
  return h(
    'div',
    { class: `career__stat${tone ? ` career__stat--${tone}` : ''}` },
    h('span', { class: 'career__label' }, label),
    h('span', { class: 'career__value' }, value),
    note ? h('span', { class: 'career__note' }, note) : null,
  );
}

export function reputationName(reputation: number): string {
  if (reputation >= 85) return 'A legend';
  if (reputation >= 65) return 'Trusted';
  if (reputation >= 45) return 'Known';
  if (reputation >= 25) return 'New face';
  return 'Doubtful';
}

/** "Wed 4 PM": the day and hour a load is due, from 8 AM on departure day. */
export function dueText(day: number, dueHours: number): string {
  const weekday = (careerDate(day).getUTCDay() + 6) % 7;
  const total = weekday * 24 + DEPARTURE_CLOCK + dueHours;
  const name = DAY_NAMES[Math.floor(total / 24) % 7] ?? 'Monday';
  return `${name.slice(0, 3)} ${hourName(total % 24)}`;
}

/** What the scales will make of this load, with the diesel the rig will leave with. */
function scaleNote(career: Career, contract: Contract): string {
  const rig = careerRig(career);
  const legal = legalFuel(contract.load);
  if (legal >= rig.tankGallons) return 'Legal at the scales even with the tank full.';
  const aboard = Math.max(
    Math.min(terminalFuel(rig), legal),
    Math.min(career.fuel ?? 0, rig.tankGallons),
  );
  return aboard > legal
    ? `Legal at the scales with up to ${legal} gallons aboard; you would leave with ${aboard}, too many for an open scale.`
    : `Legal at the scales with up to ${legal} gallons aboard; you will leave with ${aboard}.`;
}

function detailText(day: number, contract: Contract): string {
  const cargo = CARGO[contract.cargo];
  const pay = `${money(contract.payCents, true)} on delivery`;
  if (contract.cargo === 'mail')
    return `${capitalise(contract.goods)}, ${pounds(contract.load)}. ${pay}, whenever it arrives. Leaves 8 AM.`;
  if (contract.cargo === 'oranges') {
    return `${capitalise(contract.goods)}, ${pounds(contract.load)}, in the reefer. ${pay}. Due ${dueText(day, contract.dueHours)}; the load spoils after four days on the road.`;
  }
  return `${capitalise(contract.goods)}, ${pounds(contract.load)}. ${pay}. Due ${dueText(day, contract.dueHours)}; 10 % off from ${dueText(day, contract.dueHours + LATE_GRACE)}. ${cargo.name}.`;
}

function historyTable(trips: readonly CareerTrip[], units: Units): HTMLElement {
  return h(
    'table',
    { class: 'career__table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, 'Date'),
        h('th', {}, 'Haul'),
        h('th', {}, 'Load'),
        h('th', {}, 'Miles'),
        h('th', {}, 'Result'),
        h('th', { class: 'career__num' }, 'Profit'),
      ),
    ),
    h(
      'tbody',
      {},
      ...trips.map((trip) =>
        h(
          'tr',
          {},
          h(
            'td',
            {},
            careerDate(trip.day).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            }),
          ),
          h('td', {}, contractTitle(trip)),
          h('td', {}, capitalise(trip.goods)),
          h('td', {}, distance(trip.miles, units)),
          h(
            'td',
            {},
            trip.outcome === 'delivered'
              ? trip.spoiled
                ? 'Spoiled'
                : trip.late
                  ? 'Late'
                  : 'On time'
              : trip.outcome === 'crashed'
                ? 'Crashed'
                : 'Licence lost',
          ),
          h(
            'td',
            { class: `career__num ${trip.profitCents < 0 ? 'is-loss' : ''}` },
            money(trip.profitCents, true),
          ),
        ),
      ),
    ),
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
