import type { Diner } from '../data/diners';
import { FATIGUE, fatigueOf } from '../engine/conditions';
import { clockName } from '../engine/clock';
import type { TripEvent } from '../engine/events';
import { RULES } from '../engine/rules';
import {
  buyFuel,
  buyTyre,
  drinkCoffee,
  finishStop,
  roomInTank,
  type StopVisit,
} from '../engine/stop';
import { expensesTotal, hourOfDay, isRefrigerated, weekHours, type Trip } from '../engine/trip';
import { paintDiner } from '../render/diner-art';
import type { Units } from '../settings';
import type { DriveScene } from '../render/scene';
import { button, fill, h, icon, SizedCanvas } from './dom';
import { fuel as fuelText, money } from './format';
import { ICONS } from './icons';

/**
 * A truck stop: the diner across the lot, the pump, the tyre shop when the
 * spare is gone, a cup of coffee, and a bunk or a motel room. Everything
 * here acts on the trip through the engine's stop functions, in the order
 * the original used: fuel and tyres first, then the hour off the road,
 * then sleep.
 */
export interface StopScreenOptions {
  units: () => Units;
  reducedMotion: () => boolean;
  /** The road as it stands, for the picture: the region, the sky, your rig. */
  scene: () => DriveScene | null;
  sound: (name: 'pump' | 'register' | 'coffee' | 'door' | 'alarm') => void;
}

export class StopScreen {
  readonly element: HTMLElement;
  private readonly art = new SizedCanvas('stop__art');
  private readonly body: HTMLElement;
  private time = 0;
  private current: { trip: Trip; visit: StopVisit; diner: Diner; done: () => void } | null = null;
  /** What happened while sleeping, once the bunk has been used. */
  private slept: TripEvent[] | null = null;

  constructor(private readonly options: StopScreenOptions) {
    this.art.element.setAttribute('aria-hidden', 'true');
    this.body = h('div', { class: 'stop__body' });
    this.element = h(
      'section',
      { class: 'screen stop', 'aria-label': 'Truck stop', hidden: true },
      h('div', { class: 'screen__inner' }, this.art.element, this.body),
    );
  }

  open(trip: Trip, visit: StopVisit, diner: Diner, done: () => void) {
    this.current = { trip, visit, diner, done };
    this.slept = null;
    this.element.hidden = false;
    this.options.sound('door');
    this.render();
    this.element.scrollTop = 0;
    this.element.querySelector<HTMLButtonElement>('.stop__leave')?.focus();
  }

  close() {
    this.element.hidden = true;
    this.current = null;
  }

  frame(dt: number) {
    if (!this.current || this.element.hidden) return;
    this.time += dt;
    const scene = this.options.scene();
    if (!scene) return;
    this.art.fit();
    const { ctx, pixelRatio } = this.art;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    paintDiner(ctx, this.art.width, this.art.height, {
      diner: this.current.diner,
      dieselCents: this.current.visit.dieselCents,
      time: this.time,
      reducedMotion: this.options.reducedMotion(),
      region: scene.region,
      sunAltitude: scene.sunAltitude,
      sunArc: scene.sunArc,
      condition: scene.condition,
      snow: scene.snow,
      paint: scene.paint,
      cargo: scene.cargo,
    });
  }

  private render() {
    const afterSleep = this.slept;
    const current = this.current;
    if (!current) return;
    const { trip, visit, diner } = current;
    const units = this.options.units();

    const head = h(
      'div',
      { class: 'stop__head' },
      h('h1', { class: 'sign' }, h('span', { class: 'sign__small' }, 'Truck stop'), diner.name),
      h(
        'div',
        { class: 'stop__facts' },
        h('p', {}, `${clockName(weekHours(trip))} · mile ${trip.miles.toLocaleString('en-US')}`),
        h('p', { class: 'muted' }, diner.detail),
        h('p', {}, `Today’s special: ${diner.special}. Pie of the day: ${diner.pie}.`),
      ),
    );

    if (afterSleep) {
      fill(this.body, head, this.sleptPanel(afterSleep, units), this.pumpPanel(units, true));
      return;
    }

    fill(
      this.body,
      head,
      h(
        'div',
        { class: 'stop__grid' },
        this.pumpPanel(units, false),
        visit.tyres ? this.tyrePanel() : null,
        this.coffeePanel(),
        this.sleepPanel(units),
      ),
      h('p', { class: 'stop__tab muted' }, `Spent so far this trip: ${money(expensesTotal(trip))}`),
    );
  }

  private pumpPanel(units: Units, closing: boolean): HTMLElement {
    const { trip, visit } = this.current as NonNullable<typeof this.current>;
    const room = roomInTank(trip);
    const slider = h('input', {
      class: 'slider',
      type: 'range',
      min: 0,
      max: Math.max(1, room),
      step: 1,
      value: room,
      'aria-label': 'Gallons to pump',
    }) as HTMLInputElement;
    const preview = h('output', { class: 'stop__preview' });
    const update = () => {
      const gallons = Number(slider.value);
      preview.textContent = `${fuelText(gallons, units)} · ${money(gallons * visit.dieselCents)}`;
    };
    slider.addEventListener('input', update);
    update();
    const pump = button(
      h('span', {}, 'Pump'),
      () => {
        const gallons = Number(slider.value);
        if (gallons <= 0) return;
        buyFuel(trip, visit, gallons);
        this.options.sound('pump');
        this.render();
      },
      'button button--primary',
      { disabled: room <= 0 },
      icon(ICONS.fuel),
    );
    const panel = h(
      'div',
      { class: 'panel stop__panel' },
      h('h2', { class: 'panel__title' }, closing ? 'Top up before you go' : 'Diesel'),
      h(
        'p',
        {},
        `${money(visit.dieselCents)} a gallon today. The tank holds ${fuelText(trip.rig.tankGallons, units)}; ${fuelText(trip.fuel, units)} in it now.`,
      ),
      h('meter', {
        class: 'stop__tank',
        min: 0,
        max: trip.rig.tankGallons,
        value: trip.fuel,
        low: 40,
        high: 100,
        optimum: 190,
      }),
      room > 0
        ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Gallons'), slider)
        : h('p', { class: 'muted' }, 'The tank is full.'),
      room > 0 ? h('div', { class: 'row' }, preview, h('span', { class: 'spacer' }), pump) : null,
      closing
        ? button('Back on the road', () => this.leave(), 'button button--primary stop__leave')
        : null,
    );
    return panel;
  }

  private tyrePanel(): HTMLElement {
    const { trip, visit } = this.current as NonNullable<typeof this.current>;
    const tyres = visit.tyres;
    if (!tyres) return h('div');
    const buy = (kind: 'new' | 'retread') => {
      buyTyre(trip, visit, kind);
      this.options.sound('register');
      this.render();
    };
    return h(
      'div',
      { class: 'panel stop__panel' },
      h('h2', { class: 'panel__title' }, 'Tyre shop'),
      h(
        'p',
        {},
        'Your spare is on the rig. Another blowout without one means a tow truck: $400 and four hours.',
      ),
      h(
        'div',
        { class: 'row' },
        button(
          `New tyre ${money(tyres.newCents)}`,
          () => buy('new'),
          'button',
          {},
          icon(ICONS.tyre),
        ),
        button(`Retread ${money(tyres.retreadCents)}`, () => buy('retread'), 'button'),
      ),
      h(
        'p',
        { class: 'muted' },
        'A new spare makes the tyres a little more trustworthy than a retread does.',
      ),
    );
  }

  private coffeePanel(): HTMLElement {
    const { trip, visit } = this.current as NonNullable<typeof this.current>;
    const drink = button(
      visit.coffee ? 'Had one' : `Coffee ${money(visit.coffeeCents)}`,
      () => {
        drinkCoffee(trip, visit);
        this.options.sound('coffee');
        this.render();
      },
      'button',
      { disabled: visit.coffee },
      icon(ICONS.coffee),
    );
    return h(
      'div',
      { class: 'panel stop__panel' },
      h('h2', { class: 'panel__title' }, 'Counter'),
      h(
        'p',
        {},
        `You have been awake ${trip.awake} hours and feel ${FATIGUE[trip.fatigue].name.toLowerCase()}.`,
      ),
      h(
        'p',
        { class: 'muted' },
        'A cup takes the edge off for a couple of hours. It cannot replace sleep.',
      ),
      drink,
    );
  }

  private sleepPanel(units: Units): HTMLElement {
    const { trip, visit } = this.current as NonNullable<typeof this.current>;
    const hours = h('input', {
      class: 'slider',
      type: 'range',
      min: 0,
      max: 12,
      step: 1,
      value: suggestSleep(trip),
      'aria-label': 'Hours of sleep',
    }) as HTMLInputElement;
    const motel = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const forecast = h('p', { class: 'stop__forecast' });
    const leave = button(
      '',
      () => this.leave({ hours: Number(hours.value), motel: motel.checked }),
      'button button--primary stop__leave',
    );
    const update = () => {
      const chosen = Number(hours.value);
      const startHour = (hourOfDay(trip) + 1) % 24;
      const daytime = startHour >= 6 && startHour < 20;
      const quiet = motel.checked || trip.rig.sleeper === 'sleeper-cab';
      const counted = chosen === 0 ? 0 : daytime && !quiet ? Math.floor(chosen / 2 + 0.6) : chosen;
      const awake = counted > 3 ? 0 : Math.round(trip.awake / 2);
      const after = fatigueOf(
        chosen === 0 ? trip.awake : awake,
        trip.hr + 1 + chosen,
        trip.slept + counted,
      );
      const reefer =
        isRefrigerated(trip) && chosen > 0
          ? ` The reefer will burn ${fuelText(RULES.reeferGallonsPerHour * chosen, units)} while you sleep.`
          : '';
      forecast.textContent =
        chosen === 0
          ? 'Just the hour for fuel and a meal.'
          : `${counted} of ${chosen} hours will count${daytime && !quiet ? ' (daytime noise in the bunk)' : ''}. You should wake feeling ${FATIGUE[after].name.toLowerCase()}.${reefer}`;
      leave.textContent =
        chosen === 0
          ? 'Back on the road'
          : motel.checked
            ? `Sleep ${chosen} h at the motel (${money(visit.motelCents)})`
            : `Sleep ${chosen} h in the bunk`;
    };
    hours.addEventListener('input', update);
    motel.addEventListener('change', update);
    update();
    return h(
      'div',
      { class: 'panel stop__panel stop__panel--sleep' },
      h('h2', { class: 'panel__title' }, 'Sleep'),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Hours'), hours),
      trip.rig.sleeper === 'sleeper-cab'
        ? h('p', { class: 'muted' }, 'Your sleeper cab is quiet at any hour.')
        : h(
            'label',
            { class: 'row stop__motel' },
            motel,
            h('span', {}, `Take a motel room (${money(visit.motelCents)}): quiet, even in daytime`),
          ),
      forecast,
      leave,
    );
  }

  private sleptPanel(events: TripEvent[], units: Units): HTMLElement {
    const slept = events.find((event) => event.type === 'slept');
    const idle = events.find((event) => event.type === 'reefer-idle');
    const { trip } = this.current as NonNullable<typeof this.current>;
    return h(
      'div',
      { class: 'panel stop__panel' },
      h('h2', { class: 'panel__title' }, 'Time to hit the road again.'),
      slept && slept.type === 'slept'
        ? h(
            'p',
            {},
            slept.sleep < slept.hours
              ? `Thanks to the daytime noise, you got only ${slept.sleep} hours real sleep.`
              : `You slept ${slept.sleep} hours.`,
          )
        : null,
      slept && slept.type === 'slept' && slept.reeferGallons > 0
        ? h(
            'p',
            {},
            `The reefer burned ${fuelText(slept.reeferGallons, units)}. You now have ${fuelText(trip.fuel, units)}.`,
          )
        : null,
      idle
        ? h(
            'p',
            { class: 'chip chip--bad' },
            'The reefer ran dry while you slept: the oranges suffered.',
          )
        : null,
      h('p', {}, `You feel ${FATIGUE[trip.fatigue].name.toLowerCase()}.`),
    );
  }

  private leave(rest: { hours: number; motel: boolean } | null = null) {
    const current = this.current;
    if (!current) return;
    const { trip, visit, done } = current;
    if (!visit.done) {
      const events = finishStop(trip, visit, rest && rest.hours > 0 ? rest : null);
      if (rest && rest.hours > 0) this.options.sound('alarm');
      if (rest && rest.hours > 0 && isRefrigerated(trip)) {
        // The original offered more fuel after a night with oranges aboard.
        this.slept = events;
        this.render();
        return;
      }
    }
    this.close();
    done();
  }
}

/** A sensible default: a night's sleep when tired at night, nothing in the middle of the day. */
function suggestSleep(trip: Trip): number {
  const hour = (hourOfDay(trip) + 1) % 24;
  const night = hour >= 20 || hour < 5;
  if (trip.fatigue === 'fatigued' || trip.fatigue === 'exhausted') return 8;
  if (night && trip.awake >= 8) return 8;
  return 0;
}
