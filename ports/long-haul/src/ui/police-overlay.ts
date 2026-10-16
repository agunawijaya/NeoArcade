import { createRng } from '@shared/rng';
import { ordinal } from '../engine/police';
import type { PoliceStop, StopOverlay } from '../game/police-stop';
import type { Ticket } from '../game/stop-copy';
import { paintHearing, paintJail } from '../render/stop-art';
import type { Units } from '../settings';
import { button, fill, h, SizedCanvas } from './dom';
import { money, speed as speedText } from './format';

/**
 * What the player reads during a police stop, over the road: a caption for
 * the step, the words at the window, the ticket to sign, the hearing in
 * town and, for a fourth offence, the county jail and the revoked licence.
 * The stop decides what shows; this only draws it and passes the player's
 * presses back.
 */
export interface PoliceOverlayOptions {
  proceed: () => void;
  skip: () => void;
  stamp: () => void;
  reducedMotion: () => boolean;
  units: () => Units;
}

type Sheet = StopOverlay['kind'];

export class PoliceOverlay {
  readonly element: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly bubble: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly art = new SizedCanvas('police__art');
  private stop: PoliceStop | null = null;
  private shown: Sheet = 'none';
  private lineShown = '';
  private stampAt = Infinity;
  private stampEl: HTMLElement | null = null;

  constructor(private readonly options: PoliceOverlayOptions) {
    this.caption = h('p', { class: 'police__caption', 'aria-live': 'polite' });
    this.skipButton = button('Skip', () => options.skip(), 'button button--small police__skip', {
      title: 'Skip (Enter)',
    });
    this.bubble = h('div', { class: 'police__line', 'aria-live': 'polite', hidden: true });
    this.sheet = h('div', { class: 'police__sheet', hidden: true });
    this.element = h(
      'div',
      { class: 'police', hidden: true },
      h('div', { class: 'police__bar' }, this.caption, this.skipButton),
      this.bubble,
      this.sheet,
    );
  }

  /** Called every frame; follows the stop the session is playing, if any. */
  update(stop: PoliceStop | null, time: number) {
    if (stop !== this.stop) this.begin(stop);
    if (!stop) return;
    this.caption.textContent = stop.caption;
    this.skipButton.hidden = !stop.skippable || stop.waiting;
    this.skipButton.textContent =
      this.shown !== 'none' ? 'Skip' : stop.ticket ? 'Skip to the ticket' : 'Skip ahead';
    this.showLine(stop);
    const overlay = stop.overlay();
    if (overlay.kind !== this.shown) this.showSheet(overlay, time);
    if (overlay.kind === 'jail') this.markRevoked(overlay.revoked);
    if (overlay.kind === 'hearing' || overlay.kind === 'jail') this.paintArt(stop, overlay, time);
    if (time >= this.stampAt && this.stampEl) {
      this.stampAt = Infinity;
      this.stampEl.hidden = false;
      this.options.stamp();
    }
  }

  private begin(stop: PoliceStop | null) {
    this.stop = stop;
    this.shown = 'none';
    this.lineShown = '';
    this.stampAt = Infinity;
    this.stampEl = null;
    this.sheet.hidden = true;
    this.sheet.replaceChildren();
    this.bubble.hidden = true;
    this.element.hidden = !stop;
    if (stop?.skippable) this.skipButton.focus({ preventScroll: true });
  }

  private showLine(stop: PoliceStop) {
    // With the ticket in hand, what he says goes on the sheet with it.
    const line = this.shown === 'none' ? stop.line() : null;
    const key = line ? `${line.who}:${line.text}` : '';
    if (key === this.lineShown) return;
    this.lineShown = key;
    this.bubble.hidden = !line;
    if (!line) return;
    this.bubble.dataset.who = line.who;
    this.bubble.replaceChildren(
      h('span', { class: 'police__who' }, line.who === 'officer' ? 'Trooper' : 'You'),
      h('span', { class: 'police__words' }, line.text),
    );
  }

  private showSheet(overlay: StopOverlay, time: number) {
    this.shown = overlay.kind;
    this.sheet.hidden = overlay.kind === 'none';
    this.sheet.dataset.kind = overlay.kind;
    const stop = this.stop;
    if (!stop) return;
    const delay = this.options.reducedMotion() ? 0 : 0.7;
    switch (overlay.kind) {
      case 'none':
        this.sheet.replaceChildren();
        break;
      case 'ticket': {
        const go = button(
          'Sign and drive on',
          () => this.options.proceed(),
          'button button--primary citation__go',
        );
        const stamp = h(
          'span',
          { class: 'stamp citation__stamp', hidden: true },
          `Hearing · ${stop.facts.town}`,
        );
        const said = stop.line();
        fill(
          this.sheet,
          said ? h('p', { class: 'police__said' }, `“${said.text}”`) : null,
          citation(overlay.ticket, this.options.units(), stamp, go),
        );
        this.stampEl = stamp;
        this.stampAt = time + delay;
        go.focus({ preventScroll: true });
        break;
      }
      case 'hearing':
        this.sheet.replaceChildren(hearing(overlay.ticket, this.art.element));
        break;
      case 'jail': {
        const go = button(
          'Continue',
          () => this.options.proceed(),
          'button button--primary jail__go',
        );
        go.disabled = true;
        this.sheet.replaceChildren(jail(stop, this.art.element, go));
        break;
      }
    }
  }

  /** Once the jail scene has played, the licence is stamped and the player may go on. */
  private markRevoked(revoked: boolean) {
    const card = this.sheet.querySelector<HTMLElement>('.licence');
    const go = this.sheet.querySelector<HTMLButtonElement>('.jail__go');
    if (!card || !go || card.classList.contains('is-revoked') === revoked) return;
    card.classList.toggle('is-revoked', revoked);
    go.disabled = !revoked;
    if (revoked) {
      this.options.stamp();
      go.focus({ preventScroll: true });
    }
  }

  private paintArt(stop: PoliceStop, overlay: StopOverlay, time: number) {
    const resized = this.art.fit();
    if (this.options.reducedMotion() && !resized && this.art.element.dataset.kind === overlay.kind)
      return;
    this.art.element.dataset.kind = overlay.kind;
    const { ctx, width, height, pixelRatio } = this.art;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const reducedMotion = this.options.reducedMotion();
    if (overlay.kind === 'hearing')
      paintHearing(ctx, width, height, {
        progress: overlay.progress,
        hour: stop.facts.hour,
        waitHours: overlay.ticket.waitHours,
        time,
        reducedMotion,
      });
    if (overlay.kind === 'jail')
      paintJail(ctx, width, height, {
        progress: overlay.progress,
        hour: stop.facts.hour,
        time,
        reducedMotion,
      });
  }
}

// ——— The ticket ———

/**
 * The citation as a trooper fills it in: a numbered form with boxed fields,
 * the fine worked out line by line, his signature and the court's stamp.
 */
function citation(ticket: Ticket, units: Units, stamp: HTMLElement, go: HTMLElement): HTMLElement {
  const field = (label: string, value: string) =>
    h('div', { class: 'citation__field' }, h('dt', {}, label), h('dd', {}, value));
  const mph = (value: number) =>
    units === 'km'
      ? `${Math.round(value)} mph (${speedText(value, units)})`
      : `${Math.round(value)} mph`;
  const caught =
    ticket.method === 'Radar'
      ? `Radar${ticket.reading !== null ? `, read ${Math.round(ticket.reading)}` : ''}`
      : 'Patrol, paced';
  const fines = [
    ['Base fine', money(ticket.baseCents)],
    [`${ticket.overBy} mph over × ${money(ticket.perMphCents)}`, money(ticket.overCents)],
    ...(ticket.detectorCents > 0 ? [['Radar detector', money(ticket.detectorCents)]] : []),
  ];
  return h(
    'article',
    {
      class: 'citation',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'citation-title',
    },
    h(
      'header',
      { class: 'citation__head' },
      h('span', { class: 'citation__agency' }, 'Interstate Patrol'),
      h('h2', { class: 'citation__title', id: 'citation-title' }, 'Uniform traffic citation'),
      h('span', { class: 'citation__number' }, ticket.number),
    ),
    h(
      'dl',
      { class: 'citation__grid' },
      field('Date and time', ticket.clock),
      field('Offence', `${ordinal(ticket.offence)} · Speeding`),
      field('Speed', mph(ticket.speed)),
      field('Limit', mph(ticket.limit)),
      field('Detected by', caught),
      field('Over the limit', `${ticket.overBy} mph`),
    ),
    h(
      'div',
      { class: 'citation__money' },
      h(
        'table',
        { class: 'citation__fines' },
        h(
          'tbody',
          {},
          ...fines.map(([label, amount]) => h('tr', {}, h('th', {}, label), h('td', {}, amount))),
          h(
            'tr',
            { class: 'citation__total' },
            h('th', {}, 'Total due'),
            h('td', {}, money(ticket.totalCents)),
          ),
        ),
      ),
      h(
        'p',
        { class: 'citation__court' },
        `Appear before the ${ticket.court.charAt(0).toLowerCase()}${ticket.court.slice(1)}. Expect to wait ${ticket.waitHours} hour${ticket.waitHours === 1 ? '' : 's'}.`,
      ),
      h(
        'footer',
        { class: 'citation__foot' },
        h(
          'div',
          { class: 'citation__sign' },
          signature(ticket.signature),
          h('span', {}, `${ticket.officer} · badge ${ticket.badge}`),
        ),
        h('div', { class: 'citation__sign citation__sign--driver' }, h('span', {}, 'Driver')),
      ),
      go,
    ),
    stamp,
  );
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A trooper's signature: a run of loops and a flourish, shaped by the
 * ticket's number so the same trooper's hand looks the same.
 */
function signature(seed: number): SVGSVGElement {
  const rng = createRng(`signature-${seed}`);
  let x = 6;
  let d = `M ${x} 30`;
  const letters = rng.int(5, 8);
  for (let letter = 0; letter < letters; letter++) {
    const tall = rng.next() < 0.3 ? rng.float(16, 22) : rng.float(6, 11);
    const width = rng.float(7, 12);
    d += ` C ${x + width * 0.2} ${30 - tall}, ${x + width * 0.9} ${30 - tall}, ${x + width * 0.55} ${30 - tall * 0.3}`;
    d += ` S ${x + width * 0.6} ${33}, ${x + width} ${28 + rng.float(-2, 2)}`;
    x += width;
  }
  d += ` M 4 37 C ${x * 0.4} 33, ${x * 0.7} 40, ${x + 6} 34`;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'citation__signature');
  svg.setAttribute('viewBox', `0 0 ${Math.ceil(x + 10)} 44`);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  path.setAttribute('pathLength', '1');
  svg.append(path);
  return svg;
}

// ——— The hearing and the jail ———

function hearing(ticket: Ticket, art: HTMLCanvasElement): HTMLElement {
  return h(
    'article',
    { class: 'vignette', 'aria-labelledby': 'hearing-title' },
    art,
    h(
      'div',
      { class: 'vignette__text' },
      h('h2', { id: 'hearing-title' }, 'The hearing'),
      h(
        'p',
        {},
        `${ticket.waitHours} hour${ticket.waitHours === 1 ? '' : 's'} on a bench in the courthouse, then two minutes before the ${ticket.court.charAt(0).toLowerCase()}${ticket.court.slice(1)}.`,
      ),
      h(
        'p',
        { class: 'vignette__verdict' },
        h('span', {}, 'Fine confirmed'),
        h('strong', {}, money(ticket.totalCents)),
      ),
    ),
  );
}

function jail(stop: PoliceStop, art: HTMLCanvasElement, go: HTMLButtonElement): HTMLElement {
  return h(
    'article',
    { class: 'vignette vignette--jail', 'aria-labelledby': 'jail-title' },
    art,
    h(
      'div',
      { class: 'vignette__text' },
      h('h2', { id: 'jail-title' }, 'County jail'),
      h(
        'p',
        {},
        `A ${ordinal(stop.facts.event.offence)} offence. The judge in ${stop.facts.town} takes your licence, and the trip ends here.`,
      ),
      licence(stop.facts.flavour),
      go,
    ),
  );
}

/** The driver's licence, ready for its stamp. */
function licence(seed: number): HTMLElement {
  const number = `${String.fromCharCode(65 + (seed % 26))}${String(1_000_000 + ((seed * 7907) % 8_999_999)).slice(0, 7)}`;
  return h(
    'div',
    { class: 'licence', role: 'img', 'aria-label': 'Your licence' },
    h('span', { class: 'licence__head' }, 'Commercial driver licence'),
    h('span', { class: 'licence__photo', 'aria-hidden': 'true' }),
    h(
      'dl',
      { class: 'licence__fields' },
      h('dt', {}, 'No.'),
      h('dd', {}, number),
      h('dt', {}, 'Class'),
      h('dd', {}, 'A · tractor-trailer'),
      h('dt', {}, 'Expires'),
      h('dd', {}, '03-31-84'),
    ),
    h('span', { class: 'stamp licence__stamp' }, 'Revoked'),
  );
}
