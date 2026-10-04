import { CARGO, CARGO_IDS, type CargoId } from '../engine/cargo';
import { clockName } from '../engine/clock';
import { RULES } from '../engine/rules';
import {
  RETURN_DEADLINE,
  SINGLE_HAUL_START_CLOCK,
  type HaulDirection,
  type HaulRecord,
} from '../engine/single-haul';
import { legalLoad, ORIGINAL_DEADLINE, type TyreOrder } from '../engine/trip';
import { button, h, icon } from './dom';
import { money, pounds } from './format';
import { ICONS } from './icons';

/**
 * The terminal, before a Single Haul: which way, what load, how heavy, and
 * whether to do something about the two worn tyres. The original asked
 * these one prompt at a time; here they sit on one sheet you can change your
 * mind on.
 */
export interface DispatchChoice {
  direction: HaulDirection;
  cargo: CargoId;
  load: number;
  tyres: TyreOrder;
}

export interface DispatchOptions {
  next: (choice: DispatchChoice) => void;
  back: () => void;
}

export type TyreChoice = 'keep' | 'retread-1' | 'retread-2' | 'new-1' | 'new-2' | 'new-3';

export const TYRE_CHOICES: readonly {
  id: TyreChoice;
  label: string;
  order: TyreOrder;
  note: string;
}[] = [
  {
    id: 'keep',
    label: 'Keep them',
    order: { kind: 'none' },
    note: 'Free, and blowouts are likelier.',
  },
  { id: 'retread-1', label: 'One retread', order: { kind: 'retread', count: 1 }, note: '$100' },
  { id: 'retread-2', label: 'Two retreads', order: { kind: 'retread', count: 2 }, note: '$200' },
  { id: 'new-1', label: 'One new', order: { kind: 'new', count: 1 }, note: '$200' },
  { id: 'new-2', label: 'Two new', order: { kind: 'new', count: 2 }, note: '$400' },
  { id: 'new-3', label: 'Two new and a new spare', order: { kind: 'new', count: 3 }, note: '$600' },
];

export class DispatchScreen {
  readonly element: HTMLElement;
  private readonly inner: HTMLElement;
  private choice: DispatchChoice = {
    direction: 'east',
    cargo: 'freight',
    load: 38_000,
    tyres: { kind: 'none' },
  };
  private tyre: TyreChoice = 'keep';
  private record: HaulRecord = { trips: 0, totalCents: 0, offences: 0 };

  constructor(private readonly options: DispatchOptions) {
    this.inner = h('div', { class: 'screen__inner dispatch' });
    this.element = h(
      'section',
      { class: 'screen', 'aria-label': 'Dispatch', hidden: true },
      this.inner,
    );
  }

  show(record: HaulRecord, last: DispatchChoice | null) {
    this.record = record;
    if (last) this.choice = { ...last, tyres: { kind: 'none' } };
    this.tyre = 'keep';
    this.render();
    this.element.hidden = false;
    this.element.scrollTop = 0;
    this.inner.querySelector<HTMLButtonElement>('.choice[aria-pressed="true"]')?.focus();
  }

  hide() {
    this.element.hidden = true;
  }

  private render() {
    const east = this.choice.direction === 'east';
    const terminal = east ? 'Los Angeles' : 'New York';
    const deadline = east ? ORIGINAL_DEADLINE : RETURN_DEADLINE;

    const direction = h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Direction' },
      ...(['east', 'west'] as const).map((value) => {
        const pressed = this.choice.direction === value;
        const control = button(
          value === 'east' ? 'Los Angeles → New York' : 'New York → Los Angeles',
          () => {
            this.choice = { ...this.choice, direction: value };
            this.render();
          },
          '',
          { 'aria-pressed': pressed },
        );
        return control;
      }),
    );

    const cargo = h(
      'div',
      { class: 'choices', role: 'group', 'aria-label': 'Cargo' },
      ...CARGO_IDS.map((id) => {
        const item = CARGO[id];
        const pay = Math.round(this.choice.load * item.centsPerPound);
        return button(
          h(
            'span',
            { class: 'choice__inner' },
            h('span', { class: 'choice__title' }, item.name),
            h(
              'span',
              { class: 'choice__meta' },
              `${item.centsPerPound}¢ a pound · about ${money(pay, true)} for this load`,
            ),
            h('span', {}, item.pitch),
            h(
              'span',
              { class: 'choice__meta' },
              id === 'freight'
                ? `Due ${clockName(SINGLE_HAUL_START_CLOCK + deadline.dueHr)}; 10 % off from ${clockName(SINGLE_HAUL_START_CLOCK + deadline.lateHr)}.`
                : id === 'oranges'
                  ? 'Keep the reefer cold and arrive inside four days, or they start to go.'
                  : 'Paid on delivery, whenever that is.',
            ),
          ),
          () => {
            this.choice = { ...this.choice, cargo: id };
            this.render();
          },
          `choice choice--${id}`,
          { 'aria-pressed': this.choice.cargo === id },
        );
      }),
    );

    const load = h('input', {
      class: 'slider',
      type: 'range',
      min: RULES.minLoad,
      max: RULES.maxLoad,
      step: 500,
      value: this.choice.load,
      'aria-label': 'Pounds of cargo',
    }) as HTMLInputElement;
    const loadValue = h('output', { class: 'dispatch__load' });
    const scale = h('p', { class: 'dispatch__scale' });
    const updateLoad = () => {
      this.choice = { ...this.choice, load: Number(load.value) };
      loadValue.textContent = pounds(this.choice.load);
      const legalFull = legalLoad(RULES.tankGallons);
      const legalStart = legalLoad(RULES.startFuel);
      const over = this.choice.load > legalStart;
      scale.textContent = over
        ? `Over ${pounds(legalStart)}, open scales will fine you with a full tank aboard (rig ${pounds(RULES.rigPounds)} + cargo + 7 lb a gallon must stay under ${pounds(RULES.grossLimitPounds)}). Louisiana turns overweight rigs away.`
        : `Legal at any scale with ${RULES.startFuel} gallons aboard (up to ${pounds(legalFull)} with the tank brim full).`;
      scale.dataset.over = String(over);
    };
    load.addEventListener('input', updateLoad);
    load.addEventListener('change', () => this.render());
    updateLoad();

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
            this.choice = { ...this.choice, tyres: option.order };
            this.render();
          },
          'choice',
          { 'aria-pressed': this.tyre === option.id },
        ),
      ),
    );

    const record =
      this.record.trips > 0
        ? h(
            'p',
            { class: 'chip' },
            `${this.record.trips} trip${this.record.trips === 1 ? '' : 's'} · ${money(this.record.totalCents, true)} in total · ${this.record.offences} offence${this.record.offences === 1 ? '' : 's'} on your record`,
          )
        : h('p', { class: 'muted' }, 'Your first trip. The record starts clean.');

    this.inner.replaceChildren(
      h(
        'div',
        { class: 'screen__head' },
        button(icon(ICONS.back), () => this.options.back(), 'button button--small button--icon', {
          'aria-label': 'Back to the title',
        }),
        h(
          'h1',
          { class: 'sign' },
          h('span', { class: 'sign__small' }, 'Single Haul'),
          `${terminal} terminal`,
        ),
        h('span', { class: 'spacer' }),
        record,
      ),
      h(
        'p',
        {},
        `Monday 8 AM. You are at the ${terminal} trucking terminal. The 190 gallons in the tank cost $190.`,
      ),
      h('div', { class: 'panel' }, h('h2', { class: 'panel__title' }, 'Which way'), direction),
      h('div', { class: 'panel' }, h('h2', { class: 'panel__title' }, 'Cargo'), cargo),
      h(
        'div',
        { class: 'panel' },
        h('h2', { class: 'panel__title' }, 'How many pounds'),
        h(
          'div',
          { class: 'row' },
          loadValue,
          h('span', { class: 'spacer' }),
          h('span', { class: 'muted' }, `${pounds(RULES.minLoad)} – ${pounds(RULES.maxLoad)}`),
        ),
        load,
        scale,
      ),
      h(
        'div',
        { class: 'panel' },
        h('h2', { class: 'panel__title' }, 'Two of your tyres are worn'),
        tyres,
        h(
          'p',
          { class: 'muted' },
          'You carry one spare. Blow a tyre without one and a tow truck brings another for $400.',
        ),
      ),
      h(
        'div',
        { class: 'row dispatch__actions' },
        h('span', { class: 'spacer' }),
        button(
          'Choose a route',
          () => this.options.next(this.choice),
          'button button--primary',
          {},
          icon(ICONS.map),
        ),
      ),
    );
  }
}
