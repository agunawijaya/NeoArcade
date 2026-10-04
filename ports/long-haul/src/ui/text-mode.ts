import { placeById } from '../data/places';
import { CONDITIONS, FATIGUE } from '../engine/conditions';
import { DAY_NAMES, readClock } from '../engine/clock';
import type { TripEvent } from '../engine/events';
import { clampSpeed, driveHour } from '../engine/hour';
import { buyFuel, buyTyre, finishStop, openStop, roomInTank, type StopVisit } from '../engine/stop';
import {
  currentRoad,
  expensesTotal,
  isRefrigerated,
  milesToGo,
  weekHours,
  type Trip,
} from '../engine/trip';
import { copyFor } from '../game/event-copy';
import { h } from './dom';

/**
 * The CRT Easter egg: a Single Haul played as the original played it,
 * green on black, one hour at a time. The status block at the top, the
 * road and how you feel, "How fast do you wish to go (20-100)?" every
 * hour, Y or N at the truck stops. The engine underneath is the same one
 * the other front ends use, with the original's bugs fixed.
 */
export interface TextModeOptions {
  sound: (
    name: 'cb' | 'alarm' | 'register' | 'card:blowout' | 'card:police' | 'card:crash',
  ) => void;
  /** The verdict in the original's words, once the trip is over. */
  verdict: (trip: Trip) => string[];
  /** "Do you want to make another trip?" */
  again: (yes: boolean) => void;
  quit: () => void;
}

type Answer = (value: string) => void;

export class TextModeScreen {
  readonly element: HTMLElement;
  private readonly status: HTMLElement;
  private readonly output: HTMLElement;
  private readonly promptLine: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly input: HTMLInputElement;
  private trip: Trip | null = null;
  private pending: {
    kind: 'yn' | 'number' | 'key';
    keys?: string;
    fallback?: string;
    answer: Answer;
  } | null = null;
  private lastSpeed = 55;
  private lastHour: string[] = [];
  private visit: StopVisit | null = null;

  constructor(private readonly options: TextModeOptions) {
    this.status = h('pre', { class: 'crt__status', 'aria-live': 'off' });
    this.output = h('div', { class: 'crt__output', role: 'log', 'aria-live': 'polite' });
    this.promptText = h('span', { class: 'crt__prompt-text' });
    this.input = h('input', {
      class: 'crt__input',
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Your answer',
    }) as HTMLInputElement;
    this.promptLine = h('form', { class: 'crt__prompt' }, this.promptText, this.input);
    this.promptLine.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit(this.input.value);
    });
    const quit = h('button', { class: 'crt__quit', type: 'button' }, 'Esc · leave');
    quit.addEventListener('click', () => options.quit());
    this.element = h(
      'section',
      { class: 'crt', 'aria-label': 'Trucker, as it was', hidden: true },
      h('div', { class: 'crt__screen' }, this.status, this.output, this.promptLine),
      quit,
    );
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        options.quit();
        return;
      }
      const pending = this.pending;
      if (!pending || pending.kind === 'number') return;
      const key = event.key.toUpperCase();
      if ((pending.keys ?? 'YN').includes(key) && key.length === 1) {
        event.preventDefault();
        this.submit(key);
      }
    });
    this.element.addEventListener('pointerdown', () =>
      requestAnimationFrame(() => this.input.focus()),
    );
  }

  start(trip: Trip) {
    this.trip = trip;
    this.lastSpeed = 55;
    this.lastHour = [];
    this.output.replaceChildren();
    this.element.hidden = false;
    this.print(
      `Cargo: ${trip.cargo === 'oranges' ? 'oranges' : trip.cargo === 'mail' ? 'U.S. Mail' : 'freight'}, ${trip.load.toLocaleString('en-US')} pounds.  ${trip.route.name}.`,
    );
    this.print(
      `${placeById(trip.route.from).name} to ${placeById(trip.route.to).name}: ${trip.route.miles.toLocaleString('en-US')} miles.`,
    );
    this.print('');
    this.hour();
  }

  hide() {
    this.element.hidden = true;
    this.pending = null;
    this.trip = null;
  }

  // ——— The hour loop: lines 1550–1670 ———

  private hour() {
    const trip = this.trip;
    if (!trip) return;
    this.output.replaceChildren();
    this.renderStatus(trip);
    for (const line of this.lastHour) this.print(line);
    this.lastHour = [];
    if (trip.status !== 'driving') {
      this.finish(trip);
      return;
    }
    this.print(`Cruising on ${currentRoad(trip)}`);
    this.print(`You are feeling ${FATIGUE[trip.fatigue].original}`);
    this.print(`Current weather: ${CONDITIONS[trip.condition].original}`);
    if (trip.stopOffered) this.offerStop(trip);
    else this.askSpeed(trip);
  }

  private renderStatus(trip: Trip) {
    const { day, hour } = readClock(weekHours(trip));
    const time =
      hour === 0 ? 'Midnight' : hour === 12 ? 'Noon' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
    // "Approximate fuel": the original's gauge was off by a few gallons either way.
    const gauge = Math.max(0, Math.round(trip.fuelGauge));
    this.status.textContent = [
      `            Day: ${DAY_NAMES[day] ?? ''}`.padEnd(36) + `Time: ${time}`,
      `Approximate fuel: ${gauge}`.padEnd(36) + `Speed: ${trip.speed}`,
      `        Odometer: ${Math.round(trip.miles)}`.padEnd(30) +
        `Miles to go: ${Math.max(0, Math.round(milesToGo(trip)))}`,
    ].join('\n');
  }

  private askSpeed(trip: Trip) {
    this.ask(
      `How fast do you wish to go (20-100) [${this.lastSpeed}]? `,
      'number',
      (value) => {
        const asked = value.trim() === '' ? this.lastSpeed : Number(value);
        if (!Number.isFinite(asked) || asked < 20) {
          this.print('Your have to go at least 20 --');
          this.askSpeed(trip);
          return;
        }
        const { speed, capped } = clampSpeed(trip, asked);
        if (capped) this.print(`You can only get the old rig to go ${speed} MPH on this road.`);
        this.lastSpeed = Math.round(asked);
        const result = driveHour(trip, asked);
        this.lastHour = this.linesFor(result.events);
        if (result.events.some((event) => event.type === 'blowout'))
          this.options.sound('card:blowout');
        if (result.events.some((event) => event.type === 'pulled-over'))
          this.options.sound('card:police');
        if (result.events.some((event) => event.type === 'crash')) this.options.sound('card:crash');
        this.hour();
      },
      undefined,
      String(this.lastSpeed),
    );
  }

  // ——— The truck stop: lines 1700–2020 ———

  private offerStop(trip: Trip) {
    this.ask('Truck stop ahead.  Do you want to stop (Y or N)? ', 'yn', (answer) => {
      if (answer === 'N') {
        this.askSpeed(trip);
        return;
      }
      const { visit } = openStop(trip);
      this.visit = visit;
      this.pump(trip, visit, () => this.tyres(trip, visit));
    });
  }

  private pump(trip: Trip, visit: StopVisit, next: () => void) {
    this.print(`Diesel fuel costs $${(visit.dieselCents / 100).toFixed(2)} per gallon.`);
    this.ask(
      `     How many gallons do you want [${roomInTank(trip)}]? `,
      'number',
      (value) => {
        const gallons =
          value.trim() === '' ? roomInTank(trip) : Math.max(0, Math.floor(Number(value) || 0));
        if (gallons > 0) {
          const bought = buyFuel(trip, visit, gallons);
          this.options.sound('register');
          this.print(`Pay $${(bought.cents / 100).toFixed(2)}`);
          if (bought.spilled > 0)
            this.print(
              `Your tank only holds ${trip.rig.tankGallons} gallons -- ${bought.spilled} gallons spilled !!`,
            );
        }
        this.print(
          `So far, you have spent $${(expensesTotal(trip) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        );
        next();
      },
      undefined,
      String(roomInTank(trip)),
    );
  }

  private tyres(trip: Trip, visit: StopVisit) {
    if (!visit.tyres) {
      this.sleep(trip, visit);
      return;
    }
    const prices = visit.tyres;
    this.print(
      `A new tire costs $${(prices.newCents / 100).toFixed(2)}.     A retread costs $${(prices.retreadCents / 100).toFixed(2)}.`,
    );
    this.ask('     Do you want to buy a tire (Y or N)? ', 'yn', (answer) => {
      if (answer === 'N') {
        this.sleep(trip, visit);
        return;
      }
      // Line 1850 stopped the program here; this is what it meant to ask.
      this.ask(
        '     A new one (N) or a retread (R)? ',
        'key',
        (kind) => {
          buyTyre(trip, visit, kind === 'N' ? 'new' : 'retread');
          this.options.sound('register');
          this.print('     The tire shop mounts your new spare.');
          this.sleep(trip, visit);
        },
        'NR',
      );
    });
  }

  private sleep(trip: Trip, visit: StopVisit) {
    this.ask('Do you want to get some sleep (Y or N)? ', 'yn', (answer) => {
      if (answer === 'N') {
        this.lastHour = this.linesFor(finishStop(trip, visit, null));
        this.visit = null;
        this.hour();
        return;
      }
      this.ask('     How many hours of rest? ', 'number', (value) => {
        const hours = Math.max(0, Math.min(24, Math.floor(Number(value) || 0)));
        const events = finishStop(trip, visit, hours > 0 ? { hours, motel: false } : null);
        if (hours > 0) this.options.sound('alarm');
        const slept = events.find((event) => event.type === 'slept');
        const lines: string[] = [];
        if (slept && slept.type === 'slept' && slept.sleep < slept.hours)
          lines.push(`Thanks to the daytime noise, you got only ${slept.sleep} hours real sleep.`);
        lines.push(...this.linesFor(events.filter((event) => event.type !== 'slept')));
        lines.push('Time to hit the road again.');
        if (hours > 0 && isRefrigerated(trip)) {
          this.output.replaceChildren();
          this.renderStatus(trip);
          for (const line of lines) this.print(line);
          this.print(`You now have ${Math.floor(trip.fuel)} gallons of fuel.`);
          this.ask('Do you want to buy more (Y or N)? ', 'yn', (more) => {
            if (more === 'N') {
              this.visit = null;
              this.hour();
              return;
            }
            this.pump(trip, visit, () => {
              this.visit = null;
              this.hour();
            });
          });
          return;
        }
        this.lastHour = lines;
        this.visit = null;
        this.hour();
      });
    });
  }

  // ——— The end: lines 5000–5490 ———

  private finish(trip: Trip) {
    for (const line of this.options.verdict(trip)) this.print(line);
    this.print('');
    this.ask('Do you want to make another trip (Y or N)? ', 'yn', (answer) =>
      this.options.again(answer === 'Y'),
    );
  }

  private linesFor(events: readonly TripEvent[]): string[] {
    const lines: string[] = [];
    for (const event of events) {
      if (event.type === 'passed') {
        lines.push(`You have just passed ${event.name}`);
        continue;
      }
      const copy = copyFor(event, 'mi');
      if (!copy) continue;
      if (copy.quote) lines.push(copy.quote);
      else lines.push(copy.title);
      for (const line of copy.lines) lines.push(`     ${line}`);
    }
    return lines;
  }

  // ——— Prompts ———

  private ask(
    text: string,
    kind: 'yn' | 'number' | 'key',
    answer: Answer,
    keys?: string,
    fallback?: string,
  ) {
    this.pending = { kind, keys: kind === 'yn' ? 'YN' : keys, fallback, answer };
    this.promptText.textContent = text;
    this.input.value = '';
    this.input.inputMode = kind === 'number' ? 'numeric' : 'text';
    this.input.maxLength = kind === 'number' ? 4 : 1;
    requestAnimationFrame(() => {
      this.input.focus();
      this.promptLine.scrollIntoView({ block: 'end' });
    });
  }

  private submit(value: string) {
    const pending = this.pending;
    if (!pending) return;
    let answer = value.trim();
    if (pending.kind !== 'number') {
      answer = answer.toUpperCase().slice(0, 1);
      if (!(pending.keys ?? 'YN').includes(answer) || answer === '') {
        this.input.value = '';
        return;
      }
    }
    this.pending = null;
    this.print(
      `${this.promptText.textContent ?? ''}${answer === '' ? (pending.fallback ?? '') : answer}`,
      'crt__echo',
    );
    this.input.value = '';
    pending.answer(answer);
  }

  private print(text: string, className = '') {
    this.output.append(h('p', { class: `crt__line ${className}`.trim() }, text));
  }

  /** The visit in progress, if the trip is at a stop. */
  get atStop(): boolean {
    return this.visit !== null;
  }
}
