import { WINNING_CLIMB } from '../engine/constants';
import { h, icon } from './dom';
import { ICONS } from './icons';

/**
 * The heads-up display over the road. It only shows what the session tells
 * it, and touches the DOM only when a value really changes.
 */
export interface HudHandlers {
  pause(): void;
  mute(): void;
}

export interface RunReadout {
  score: number;
  metres: number;
  lives: number;
  multiplier: number;
  combo: number;
  /** 0…1 towards the finish, or null for Endless. */
  progress: number | null;
  kmh: number;
}

export interface DuelReadout {
  /** Left and right plates: in Classic, the Donkey and the Driver; in Donkey vs Driver, the two players. */
  left: { name: string; role: 'donkey' | 'driver'; score: number };
  right: { name: string; role: 'donkey' | 'driver'; score: number };
  climb: number;
  pointsToWin: number;
}

export type PopupTone = 'near' | 'carrot' | 'beat' | 'crash' | 'info';

export class Hud {
  readonly element: HTMLElement;
  private readonly left = h('div', { class: 'hud__plate hud__plate--left' });
  private readonly middle = h('div', { class: 'hud__middle' });
  private readonly right = h('div', { class: 'hud__plate hud__plate--right' });
  private readonly popups = h('div', { class: 'hud__popups', 'aria-live': 'polite' });
  private lastCarrot: { popup: HTMLElement; count: number; points: number } | null = null;
  private readonly captionBox = h('p', { class: 'hud__caption', role: 'status' });
  private readonly countdownBox = h('div', { class: 'hud__countdown', 'aria-live': 'assertive' });
  private readonly bannerBox = h('div', { class: 'hud__banner' });
  private readonly hint = h('p', { class: 'hud__hint' });
  private readonly zones = h(
    'div',
    { class: 'hud__zones', 'aria-hidden': 'true' },
    h('span', { class: 'hud__zone hud__zone--p1' }, 'Player 1'),
    h('span', { class: 'hud__zone hud__zone--p2' }, 'Player 2'),
  );
  private readonly muteButton: HTMLButtonElement;
  private cache = new Map<string, string>();
  private captionTimer: ReturnType<typeof setTimeout> | undefined;
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(handlers: HudHandlers) {
    const pause = h(
      'button',
      { class: 'hud__button', type: 'button', 'aria-label': 'Pause' },
      icon(ICONS.pause),
    );
    pause.addEventListener('click', handlers.pause);
    this.muteButton = h('button', { class: 'hud__button', type: 'button' });
    this.muteButton.addEventListener('click', handlers.mute);
    this.element = h(
      'div',
      { class: 'hud', hidden: true },
      h('div', { class: 'hud__bar' }, this.left, this.middle, this.right),
      h('div', { class: 'hud__buttons' }, this.muteButton, pause),
      this.popups,
      this.captionBox,
      this.countdownBox,
      this.bannerBox,
      this.hint,
      this.zones,
    );
  }

  show(on: boolean) {
    this.element.hidden = !on;
    if (!on) {
      this.countdown(null);
      this.popups.replaceChildren();
      this.bannerBox.classList.remove('is-visible');
      this.captionBox.classList.remove('is-visible');
    }
  }

  setMuted(muted: boolean) {
    this.muteButton.replaceChildren(icon(muted ? ICONS.soundOff : ICONS.soundOn));
    this.muteButton.setAttribute('aria-label', muted ? 'Sound on' : 'Mute');
  }

  /** Switches the plates between a run's readout and a duel's. */
  layout(kind: 'run' | 'duel', versus = false) {
    this.element.dataset.kind = kind;
    this.zones.hidden = !versus;
    this.cache.clear();
    if (kind === 'run') {
      this.left.replaceChildren(
        h('span', { class: 'hud__label' }, 'Score'),
        h('strong', { class: 'hud__score', 'data-field': 'score' }, '0'),
        h('span', { class: 'hud__combo', 'data-field': 'combo' }),
      );
      this.middle.replaceChildren(
        h('strong', { class: 'hud__metres', 'data-field': 'metres' }, '0 m'),
        h(
          'div',
          { class: 'hud__progress', 'data-field': 'progress-track' },
          h('span', { class: 'hud__progress-fill', 'data-field': 'progress' }),
        ),
        h('span', { class: 'hud__speed', 'data-field': 'speed' }),
      );
      this.right.replaceChildren(
        h('span', { class: 'hud__label' }, 'Lives'),
        h('span', { class: 'hud__lives', 'data-field': 'lives' }),
      );
    } else {
      for (const [plate, side] of [
        [this.left, 'left'],
        [this.right, 'right'],
      ] as const) {
        plate.replaceChildren(
          h(
            'span',
            { class: 'hud__who' },
            h('span', { class: 'hud__role', 'data-field': `${side}-role` }),
            h('span', { class: 'hud__name', 'data-field': `${side}-name` }),
          ),
          h('strong', { class: 'hud__score', 'data-field': `${side}-score` }, '0'),
        );
      }
      this.middle.replaceChildren(
        h('span', { class: 'hud__label' }, 'Road to the top'),
        h(
          'div',
          { class: 'hud__climb', 'data-field': 'climb' },
          ...Array.from({ length: WINNING_CLIMB - 1 }, () => h('span', { class: 'hud__step' })),
        ),
      );
    }
  }

  run(readout: RunReadout) {
    this.text('score', readout.score.toLocaleString('en'));
    this.text('metres', `${readout.metres.toLocaleString('en')} m`);
    this.text('speed', `${readout.kmh} km/h`);
    this.text(
      'combo',
      readout.combo > 1 ? `×${readout.multiplier} · ${readout.combo} in a row` : '',
    );
    this.lives(readout.lives);
    const track = this.field('progress-track');
    if (track) track.hidden = readout.progress === null;
    const fill = this.field('progress');
    const width = `${Math.round((readout.progress ?? 0) * 1000) / 10}%`;
    if (fill && this.cache.get('progress-width') !== width) {
      this.cache.set('progress-width', width);
      fill.style.width = width;
    }
  }

  duel(readout: DuelReadout) {
    for (const side of ['left', 'right'] as const) {
      const plate = readout[side];
      this.text(`${side}-name`, plate.name);
      this.text(`${side}-score`, String(plate.score));
      const role = this.field(`${side}-role`);
      if (role && this.cache.get(`${side}-role`) !== plate.role) {
        this.cache.set(`${side}-role`, plate.role);
        role.replaceChildren(icon(plate.role === 'donkey' ? ICONS.donkey : ICONS.car));
        role.dataset.role = plate.role;
        (side === 'left' ? this.left : this.right).dataset.role = plate.role;
      }
    }
    const climb = String(readout.climb);
    if (this.cache.get('climb') !== climb) {
      this.cache.set('climb', climb);
      this.field('climb')
        ?.querySelectorAll('.hud__step')
        .forEach((step, index) => step.classList.toggle('is-done', index < readout.climb - 1));
    }
  }

  /** Lives as little cars: bright while you have them, hollow once they are gone. */
  private lives(count: number) {
    const key = String(count);
    if (this.cache.get('lives') === key) return;
    this.cache.set('lives', key);
    const box = this.field('lives');
    if (!box) return;
    box.setAttribute('aria-label', `${count} ${count === 1 ? 'life' : 'lives'} left`);
    box.replaceChildren(
      ...[0, 1, 2].map((index) => {
        const life = icon(ICONS.car);
        life.classList.add('hud__life');
        if (index >= count) life.classList.add('is-lost');
        return life;
      }),
    );
  }

  popup(text: string, tone: PopupTone, detail = ''): HTMLElement {
    const popup = h(
      'div',
      { class: `hud__popup hud__popup--${tone}` },
      h('strong', {}, text),
      detail ? h('span', {}, detail) : null,
    );
    this.popups.append(popup);
    while (this.popups.childElementCount > 3) this.popups.firstElementChild?.remove();
    setTimeout(() => popup.remove(), 1400);
    return popup;
  }

  /** Carrots come in rows: one pop-up counts them up, rather than a stack of them. */
  carrot(points: number) {
    const last = this.lastCarrot?.popup.isConnected ? this.lastCarrot : null;
    const count = (last?.count ?? 0) + 1;
    const total = (last?.points ?? 0) + points;
    last?.popup.remove();
    const popup = this.popup(count > 1 ? `Carrots ×${count}` : 'Carrot!', 'carrot', `+${total}`);
    this.lastCarrot = { popup, count, points: total };
  }

  caption(text: string, seconds = 3.2) {
    clearTimeout(this.captionTimer);
    this.captionBox.textContent = text;
    this.captionBox.classList.add('is-visible');
    this.captionTimer = setTimeout(
      () => this.captionBox.classList.remove('is-visible'),
      seconds * 1000,
    );
  }

  countdown(text: string | null) {
    if (this.cache.get('countdown') === (text ?? '')) return;
    this.cache.set('countdown', text ?? '');
    this.countdownBox.textContent = text ?? '';
    this.countdownBox.classList.toggle('is-visible', text !== null);
    if (text !== null) {
      this.countdownBox.classList.remove('is-pulsing');
      void this.countdownBox.offsetWidth;
      this.countdownBox.classList.add('is-pulsing');
    }
  }

  banner(title: string, subtitle = '', seconds = 1.8, tone: 'good' | 'bad' | 'plain' = 'plain') {
    clearTimeout(this.bannerTimer);
    this.bannerBox.dataset.tone = tone;
    this.bannerBox.replaceChildren(h('strong', {}, title));
    if (subtitle) this.bannerBox.append(h('span', {}, subtitle));
    this.bannerBox.classList.add('is-visible');
    this.bannerTimer = setTimeout(
      () => this.bannerBox.classList.remove('is-visible'),
      seconds * 1000,
    );
  }

  showHint(text: string | null) {
    this.hint.textContent = text ?? '';
    this.hint.classList.toggle('is-visible', text !== null);
  }

  private field(name: string): HTMLElement | null {
    return this.element.querySelector<HTMLElement>(`[data-field="${name}"]`);
  }

  private text(name: string, value: string) {
    if (this.cache.get(name) === value) return;
    this.cache.set(name, value);
    const target = this.field(name);
    if (target) target.textContent = value;
  }
}
