import { placeById } from '../data/places';
import { CARGO } from '../engine/cargo';
import { clockName, durationName } from '../engine/clock';
import { eventsOfType } from '../engine/events';
import type { Expense, ExpenseKind, Trip } from '../engine/trip';
import type { Units } from '../settings';
import { button, fill, h } from './dom';
import { distance, money, pounds } from './format';

/**
 * Arrival, or the end of the road: a logbook page for the trip and a stack
 * of receipts that add up, line by line, to what it paid. A stamp gives the
 * verdict, in the original's own words where it had them.
 */
export interface LedgerAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

export interface LedgerModel {
  heading: string;
  trip: Trip;
  /** Lines in the original's voice: profit, average, "washing dishes". */
  verdict: string[];
  stamp: { text: string; tone: 'good' | 'bad' | 'neutral' };
  /** Postcards collected on the way, and XP from the Arcade Pass. */
  notes: string[];
  actions: LedgerAction[];
  units: Units;
  /** Seconds before the stamp lands; 0 shows everything at once. */
  pace: number;
}

const EXPENSE_NAMES: Readonly<Record<ExpenseKind, string>> = {
  fuel: 'Diesel',
  tyres: 'Tyres',
  toll: 'Tolls',
  fine: 'Fines',
  'scale-fine': 'Overweight fines',
  repair: 'Reefer repairs',
  tow: 'Tow truck',
  barrel: 'Emergency diesel',
  motel: 'Motel rooms',
  coffee: 'Coffee',
};

export class LedgerScreen {
  readonly element: HTMLElement;
  private readonly inner: HTMLElement;

  constructor() {
    this.inner = h('div', { class: 'screen__inner ledger__inner' });
    this.element = h(
      'section',
      { class: 'screen ledger', 'aria-label': 'Logbook', hidden: true },
      this.inner,
    );
  }

  show(model: LedgerModel) {
    const { trip, units } = model;
    const settlement = trip.settlement;
    const groups = groupExpenses(trip.expenses);
    const receipts: HTMLElement[] = [];
    let delay = 0;
    const step = model.pace > 0 ? model.pace / Math.max(6, groups.length + 4) : 0;
    const receipt = (
      label: string,
      detail: string,
      amount: string,
      tone: 'debit' | 'credit' | 'total',
    ) => {
      const row = h(
        'li',
        { class: `receipt receipt--${tone}`, style: `animation-delay: ${delay.toFixed(2)}s` },
        h('span', { class: 'receipt__label' }, label),
        h('span', { class: 'receipt__detail' }, detail),
        h('span', { class: 'receipt__amount' }, amount),
      );
      delay += step;
      receipts.push(row);
    };
    for (const group of groups) {
      receipt(
        EXPENSE_NAMES[group.kind],
        group.count > 1 ? `${group.count} receipts` : (group.note ?? ''),
        money(-group.cents),
        'debit',
      );
    }
    if (settlement) {
      receipt(
        'Truck payment, insurance and taxes',
        `${settlement.days + 1} day${settlement.days === 0 ? '' : 's'} × $85`,
        money(-settlement.truckCents),
        'debit',
      );
      const paid = settlement.spoiled
        ? 'Spoiled: hauled to the dump'
        : settlement.late
          ? `${CARGO[trip.cargo].name}, less 10 % for lateness`
          : settlement.damage > 0
            ? `${CARGO[trip.cargo].name}, less ${settlement.damage * 5} % damage`
            : settlement.early
              ? `${CARGO[trip.cargo].name}, with 10 % for being early`
              : `${CARGO[trip.cargo].name}, ${pounds(trip.load)}`;
      receipt('Payment for the load', paid, money(settlement.paidCents), 'credit');
      receipt(
        settlement.profitCents >= 0 ? 'Net profit' : 'Net loss',
        '',
        money(settlement.profitCents),
        'total',
      );
    } else {
      const spent = trip.expenses.reduce((sum, expense) => sum + expense.cents, 0);
      receipt('Spent before it ended', '', money(-spent), 'total');
    }

    const tickets = eventsOfType(trip.events, 'pulled-over').length;
    const blowouts = eventsOfType(trip.events, 'blowout').length;
    const slept = eventsOfType(trip.events, 'slept').reduce((sum, event) => sum + event.sleep, 0);
    const stops = eventsOfType(trip.events, 'truck-stop').length;
    const hours = settlement?.deliveredHr ?? trip.hr;
    const log = h(
      'dl',
      { class: 'logbook__entries' },
      ...entry(
        'Route',
        `${placeById(trip.route.from).name} → ${placeById(trip.route.to).name}, ${trip.route.name.toLowerCase()}`,
      ),
      ...entry('Load', `${CARGO[trip.cargo].name}, ${pounds(trip.load)}`),
      ...entry('Departed', clockName(trip.startClock + 1)),
      ...entry(settlement ? 'Delivered' : 'Ended', clockName(trip.startClock + hours)),
      ...entry('On the road', durationName(hours)),
      ...entry('Driven', distance(trip.miles, units)),
      ...entry('Truck stops', `${stops}, with ${slept} hours of sleep`),
      ...entry('Tickets', tickets === 0 ? 'none' : String(tickets)),
      ...entry('Blowouts', blowouts === 0 ? 'none' : String(blowouts)),
    );

    const stamp = h(
      'div',
      {
        class: `stamp ledger__stamp ledger__stamp--${model.stamp.tone}`,
        style: `animation-delay: ${(delay + step).toFixed(2)}s`,
      },
      model.stamp.text,
    );
    fill(
      this.inner,
      h('h1', { class: 'screen__title' }, model.heading),
      h(
        'div',
        { class: 'ledger__grid' },
        h(
          'article',
          { class: 'paper logbook' },
          h('h2', { class: 'logbook__title' }, 'Driver’s log'),
          log,
        ),
        h(
          'article',
          { class: 'paper receipts' },
          h('h2', { class: 'logbook__title' }, 'Receipts'),
          h('ol', { class: 'receipts__list' }, ...receipts),
          stamp,
        ),
      ),
      model.verdict.length > 0
        ? h(
            'div',
            { class: 'panel ledger__verdict' },
            ...model.verdict.map((line) => h('p', { class: 'ledger__line' }, line)),
          )
        : null,
      model.notes.length > 0
        ? h(
            'div',
            { class: 'ledger__notes' },
            ...model.notes.map((note) => h('span', { class: 'chip' }, note)),
          )
        : null,
      h(
        'div',
        { class: 'row ledger__actions' },
        ...model.actions.map((action) =>
          button(action.label, action.run, action.primary ? 'button button--primary' : 'button'),
        ),
      ),
    );
    this.element.classList.toggle('is-instant', model.pace === 0);
    this.element.hidden = false;
    this.element.scrollTop = 0;
    this.inner
      .querySelector<HTMLButtonElement>(
        '.ledger__actions .button--primary, .ledger__actions .button',
      )
      ?.focus();
  }

  hide() {
    this.element.hidden = true;
  }
}

function entry(label: string, value: string): HTMLElement[] {
  return [h('dt', {}, label), h('dd', {}, value)];
}

interface ExpenseGroup {
  kind: ExpenseKind;
  cents: number;
  count: number;
  note?: string;
}

function groupExpenses(expenses: readonly Expense[]): ExpenseGroup[] {
  const groups = new Map<ExpenseKind, ExpenseGroup>();
  for (const expense of expenses) {
    const group = groups.get(expense.kind) ?? {
      kind: expense.kind,
      cents: 0,
      count: 0,
      note: expense.note,
    };
    group.cents += expense.cents;
    group.count += 1;
    groups.set(expense.kind, group);
  }
  return [...groups.values()];
}
