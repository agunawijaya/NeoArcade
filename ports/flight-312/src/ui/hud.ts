import type { CockpitView } from '../cockpit/actions';
import type { ReadbackChoice, Transmission } from '../engine/atc';
import type { HintId } from '../engine/flight';
import type { Controller } from '../engine/phraseology';
import { h } from './dom';

/**
 * What sits over the cockpit: the radio's subtitles, the readback choices
 * when a controller waits for an answer, coaching hints, the clock and
 * time compression, the view buttons, and on touch screens the levers and
 * buttons a thumb needs. Plain DOM, so it stays sharp and readable.
 */
const SPEAKER_NAMES: Record<Controller, string> = {
  clearance: 'Clearance',
  tower: 'Tower',
  departure: 'Departure',
  center: 'Center',
  approach: 'Approach',
  arrivalTower: 'Tower',
  firstOfficer: 'First officer',
  captain: 'You',
};

export const HINTS: Record<HintId, string> = {
  releaseBrakes: 'Cleared for takeoff: release the parking brake and bring the thrust levers up.',
  setFlaps: 'Set takeoff flaps — 10 or 20 — before the roll.',
  rotate: 'Rotate: ease the nose up toward 10°.',
  gearUp: 'Positive climb: gear up.',
  climbThrust: 'Passing 1,000 ft: flaps up on schedule, climb thrust.',
  tuneComm: 'Dial the new frequency on COMM 1 (pedestal) and swap it to active.',
  armApproach:
    'Cleared for the ILS: arm the approach (ILS button) to capture the localizer and glideslope.',
  gearDown: 'Glideslope alive: gear down.',
  landingFlaps: 'Landing flaps: 25 or 30.',
  flare: 'Fifty feet: start the flare.',
  idle: 'Thrust levers to idle.',
  reverse: 'On the ground: reverse thrust and brakes.',
  stall: 'Stall! Lower the nose and add thrust.',
  pullUp: 'Terrain! Pull up and climb.',
};

const VIEWS: [CockpitView, string][] = [
  ['main', 'Panel'],
  ['pedestal', 'Pedestal'],
  ['overhead', 'Overhead'],
  ['engineer', 'Engineer'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['outside', 'Window'],
];

/** Matches the stylesheet's rule that folds the view list into one button. */
const FOLDED_VIEWS_QUERY = '(max-height: 520px)';

export interface HudHandlers {
  answer(choice: ReadbackChoice['id']): void;
  view(view: CockpitView): void;
  pause(): void;
  chart(): void;
  checklist(): void;
  touchThrust(value: number): void;
  touchButton(
    button: 'gear' | 'flapsDown' | 'flapsUp' | 'brakes' | 'reverse' | 'speedbrake' | 'flare',
  ): void;
}

export class Hud {
  readonly element: HTMLElement;
  private subtitles: HTMLElement;
  private choices: HTMLElement;
  private hint: HTMLElement;
  private status: HTMLElement;
  private notice: HTMLElement;
  private viewButtons = new Map<CockpitView, HTMLButtonElement>();
  private view: CockpitView = 'main';
  private hintTimer = 0;
  private noticeTimer = 0;
  private lines: { at: number; node: HTMLElement }[] = [];
  private showingChoicesFor: number | null = null;
  subtitlesOn = true;

  constructor(
    private handlers: HudHandlers,
    touch: boolean,
    /** The 1982 Rules flare on a key, so the touch controls get a button for it. */
    flareButton: boolean,
  ) {
    this.subtitles = h('div', {
      class: 'hud-subtitles',
      role: 'log',
      'aria-live': 'polite',
      'aria-label': 'Radio',
    });
    this.choices = h('div', { class: 'hud-choices', role: 'group', 'aria-label': 'Readback' });
    this.hint = h('div', { class: 'hud-hint', role: 'status' });
    this.status = h('div', { class: 'hud-status' });
    this.notice = h('div', { class: 'hud-notice', role: 'status' });
    const views = h('nav', { class: 'hud-views', 'aria-label': 'Views' });
    for (const [view, label] of VIEWS) {
      const button = h(
        'button',
        { type: 'button', class: 'hud-view', onclick: () => this.chooseView(view) },
        label,
      );
      this.viewButtons.set(view, button);
      views.append(button);
    }
    const tools = h(
      'div',
      { class: 'hud-tools' },
      h(
        'button',
        {
          type: 'button',
          class: 'hud-tool',
          onclick: () => handlers.checklist(),
          title: 'Checklists (K)',
        },
        'Checklist',
      ),
      h(
        'button',
        { type: 'button', class: 'hud-tool', onclick: () => handlers.chart(), title: 'Chart (M)' },
        'Chart',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'hud-tool',
          onclick: () => handlers.pause(),
          title: 'Pause (Esc)',
        },
        'Pause',
      ),
    );
    this.element = h(
      'div',
      { class: 'hud' },
      this.subtitles,
      this.choices,
      this.hint,
      this.status,
      this.notice,
      views,
      tools,
    );
    if (touch) this.element.append(this.touchControls(flareButton));
  }

  private touchControls(flareButton: boolean): HTMLElement {
    const thrust = h('input', {
      type: 'range',
      min: 0,
      max: 100,
      value: 0,
      class: 'touch-thrust',
      'aria-label': 'Thrust levers',
      orient: 'vertical',
    });
    thrust.addEventListener('input', () => this.handlers.touchThrust(Number(thrust.value) / 100));
    const button = (label: string, action: Parameters<HudHandlers['touchButton']>[0]) =>
      h(
        'button',
        { type: 'button', class: 'touch-button', onclick: () => this.handlers.touchButton(action) },
        label,
      );
    return h(
      'div',
      { class: 'touch-controls' },
      h('label', { class: 'touch-thrust-wrap' }, thrust, h('span', {}, 'THRUST')),
      h(
        'div',
        { class: 'touch-buttons' },
        button('GEAR', 'gear'),
        button('FLAPS +', 'flapsDown'),
        button('FLAPS −', 'flapsUp'),
        button('SPOILER', 'speedbrake'),
        button('BRAKES', 'brakes'),
        button('REVERSE', 'reverse'),
        ...(flareButton ? [button('FLARE', 'flare')] : []),
      ),
    );
  }

  /** A call on the radio: a subtitle line, if subtitles are on. */
  transmission(call: Transmission, time: number) {
    if (!this.subtitlesOn || !call.heard || call.text.written === '') return;
    const node = h(
      'p',
      { class: `hud-line hud-line-${call.speaker}` },
      h('strong', {}, `${SPEAKER_NAMES[call.speaker]}: `),
      call.text.written,
    );
    this.subtitles.append(node);
    this.lines.push({ at: time, node });
    while (this.lines.length > 3) this.lines.shift()?.node.remove();
  }

  /** The readback options, while a controller waits for one. */
  readback(
    pending: { transmission: Transmission; choices: ReadbackChoice[]; deadline: number } | null,
    time: number,
  ) {
    if (!pending) {
      if (this.showingChoicesFor !== null) this.choices.replaceChildren();
      this.showingChoicesFor = null;
      return;
    }
    const remaining = Math.max(0, pending.deadline - time);
    if (this.showingChoicesFor !== pending.transmission.id) {
      this.showingChoicesFor = pending.transmission.id;
      this.choices.replaceChildren(
        h('p', { class: 'hud-choices-title' }, 'Read back:'),
        ...pending.choices.map((choice, index) =>
          h(
            'button',
            { type: 'button', class: 'hud-choice', onclick: () => this.handlers.answer(choice.id) },
            h('kbd', {}, String(index + 1)),
            choice.text.written,
          ),
        ),
        h('div', { class: 'hud-choices-time' }),
      );
    }
    const bar = this.choices.querySelector<HTMLElement>('.hud-choices-time');
    if (bar) bar.style.setProperty('--left', String(Math.min(1, remaining / 12)));
  }

  /** A hint for a few seconds — or, given `onRead`, until the player says they have read it. */
  showHint(hint: HintId, onRead?: () => void) {
    this.hint.textContent = HINTS[hint];
    this.hint.classList.add('shown');
    this.hintTimer = onRead ? Infinity : 7;
    if (!onRead) return;
    const carryOn = h(
      'button',
      {
        type: 'button',
        class: 'hud-hint-go',
        onclick: () => {
          this.hintTimer = 0;
          onRead();
        },
      },
      'Carry on',
    );
    this.hint.append(' ', carryOn);
    carryOn.focus();
  }

  showNotice(text: string, seconds = 5) {
    this.notice.textContent = text;
    this.notice.classList.add('shown');
    this.noticeTimer = seconds;
  }

  update(dt: number, time: number, status: string, view: CockpitView) {
    this.hintTimer -= dt;
    this.noticeTimer -= dt;
    if (this.hintTimer <= 0) this.hint.classList.remove('shown');
    if (this.noticeTimer <= 0) this.notice.classList.remove('shown');
    for (const line of this.lines) line.node.classList.toggle('old', time - line.at > 12);
    if (this.status.textContent !== status) this.status.textContent = status;
    if (view !== this.view || this.element.dataset.view !== view) {
      this.view = view;
      this.element.dataset.view = view;
      for (const [key, button] of this.viewButtons) button.classList.toggle('active', key === view);
    }
  }

  /** On a short screen only the current view's button shows, and it steps on to the next. */
  private chooseView(view: CockpitView) {
    const folded = matchMedia(FOLDED_VIEWS_QUERY).matches;
    if (!folded || view !== this.view) {
      this.handlers.view(view);
      return;
    }
    const index = VIEWS.findIndex(([key]) => key === view);
    this.handlers.view((VIEWS[(index + 1) % VIEWS.length] as [CockpitView, string])[0]);
  }
}
