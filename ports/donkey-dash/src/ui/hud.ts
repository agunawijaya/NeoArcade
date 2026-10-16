import { WINNING_CLIMB } from '../engine/constants';
import type { RivalMove } from '../game/controls';
import { h, icon } from './dom';
import { ICONS } from './icons';

/**
 * The heads-up display over the road. It only shows what the session tells
 * it, and touches the DOM only when a value really changes.
 */
export interface HudHandlers {
  pause(): void;
  mute(): void;
  /** A tap on a Rival driver's touch pad. */
  steer(driver: 0 | 1, move: RivalMove): void;
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

/** One Rival driver's plate: who they are, rounds won, and how full their race meter is. */
export interface RivalPlate {
  name: string;
  rounds: number;
  /** In quarters, too: a row passed riding Ahead counts a little more. */
  meter: number;
  state: 'racing' | 'crashed';
  /** Riding Ahead, or on the way there. */
  ahead: boolean;
}

export interface RivalReadout {
  left: RivalPlate;
  right: RivalPlate;
  meterTarget: number;
  roundsToWin: number;
  round: number;
}

/** Rival Driver's touch pads: one for each driver, or one against the CPU, with their keys. */
export interface SteerLayout {
  drivers: readonly { name: string; keys: Record<RivalMove, string> }[];
}

/** A pad's four keys, in the order of a cross: the arrow on each. */
const PAD_KEYS: readonly { move: RivalMove; arrow: string; label: string }[] = [
  { move: 'surge', arrow: '▲', label: 'Surge Ahead' },
  { move: 'left', arrow: '◀', label: 'Lane left' },
  { move: 'right', arrow: '▶', label: 'Lane right' },
  { move: 'drop', arrow: '▼', label: 'Drop back' },
];

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
  /** Rival Driver: where each driver's left and right are, on screen and on the keys. */
  private readonly steer = h('div', { class: 'hud__steer', 'aria-hidden': 'true', hidden: true });
  private readonly muteButton: HTMLButtonElement;
  private cache = new Map<string, string>();
  private captionTimer: ReturnType<typeof setTimeout> | undefined;
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly handlers: HudHandlers) {
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
      this.steer,
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

  /** Switches the plates between a run's readout, a duel's and a race's. */
  layout(kind: 'run' | 'duel' | 'rival', twoPlayers = false) {
    this.element.dataset.kind = kind;
    this.zones.hidden = !(twoPlayers && kind === 'duel');
    this.steer.hidden = kind !== 'rival';
    this.cache.clear();
    if (kind === 'rival') {
      for (const [plate, side] of [
        [this.left, 'left'],
        [this.right, 'right'],
      ] as const) {
        plate.dataset.driver = side === 'left' ? '0' : '1';
        plate.replaceChildren(
          h(
            'span',
            { class: 'hud__who' },
            h('span', { class: 'hud__dot' }),
            h('span', { class: 'hud__name', 'data-field': `${side}-name` }),
            h(
              'span',
              {
                class: 'hud__ahead',
                title: 'Riding Ahead: each row counts a little more, but donkeys show up closer',
              },
              '▲ Ahead',
            ),
          ),
          h('span', { class: 'hud__rounds', 'data-field': `${side}-rounds` }),
          h('span', { class: 'hud__meter', 'data-field': `${side}-meter` }),
        );
      }
      this.middle.replaceChildren(
        h('span', { class: 'hud__label' }, 'Round'),
        h('strong', { class: 'hud__score', 'data-field': 'round' }, '1'),
        h('span', { class: 'hud__speed', 'data-field': 'first-to' }),
      );
      return;
    }
    delete this.left.dataset.driver;
    delete this.right.dataset.driver;
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

  rival(readout: RivalReadout) {
    for (const side of ['left', 'right'] as const) {
      const plate = readout[side];
      this.text(`${side}-name`, plate.name);
      const key = `${plate.rounds}/${readout.roundsToWin}:${plate.meter}/${readout.meterTarget}:${plate.state}:${plate.ahead}`;
      if (this.cache.get(`${side}-plate`) === key) continue;
      this.cache.set(`${side}-plate`, key);
      const rounds = this.field(`${side}-rounds`);
      rounds?.setAttribute('aria-label', `${plate.rounds} of ${readout.roundsToWin} rounds`);
      rounds?.replaceChildren(
        ...Array.from({ length: readout.roundsToWin }, (_, index) =>
          h('span', { class: `hud__pip${index < plate.rounds ? ' is-won' : ''}` }),
        ),
      );
      const meter = this.field(`${side}-meter`);
      meter?.setAttribute(
        'aria-label',
        `Race meter ${fraction(plate.meter)} of ${readout.meterTarget}`,
      );
      meter?.replaceChildren(
        ...Array.from({ length: readout.meterTarget }, (_, index) => {
          const fill = Math.max(0, Math.min(1, plate.meter - index));
          const notch = h('span', {
            class: `hud__notch${fill === 1 ? ' is-full' : fill > 0 ? ' is-part' : ''}`,
          });
          if (fill > 0 && fill < 1) notch.style.setProperty('--fill', `${fill * 100}%`);
          return notch;
        }),
      );
      const element = side === 'left' ? this.left : this.right;
      element.dataset.state = plate.state;
      element.dataset.ahead = String(plate.ahead);
    }
    this.text('round', String(readout.round));
    this.text('first-to', `first to ${readout.roundsToWin}`);
  }

  /**
   * Lays out the touch pads: each driver's in the outer corner of their half
   * of the screen, or one in the right-hand corner against the CPU. Each is a
   * cross of four keys showing the keyboard key for it; a touch on one
   * steers at once.
   */
  steering(layout: SteerLayout) {
    const alone = layout.drivers.length === 1;
    this.steer.replaceChildren(
      ...layout.drivers.map((driver, index) => {
        const side = index as 0 | 1;
        return h(
          'div',
          {
            class: 'hud__pad',
            'data-driver': String(side),
            'data-corner': alone || side === 1 ? 'right' : 'left',
          },
          ...PAD_KEYS.map(({ move, arrow, label }) => {
            const key = h(
              'span',
              { class: 'hud__pad-key', 'data-move': move, title: label },
              h('b', {}, arrow),
              h('kbd', {}, driver.keys[move]),
            );
            key.addEventListener('pointerdown', (event) => {
              // A thumb on a pad steers; it must not also count as a tap on the road.
              event.preventDefault();
              event.stopPropagation();
              this.handlers.steer(side, move);
            });
            return key;
          }),
          h('span', { class: 'hud__pad-name' }, driver.name),
        );
      }),
    );
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

  /** A row passed riding Ahead: the extra it put on the meter floats up off the plate. */
  aheadBonus(side: 'left' | 'right', extra: number) {
    const plate = side === 'left' ? this.left : this.right;
    const bonus = h('span', { class: 'hud__bonus', 'aria-hidden': 'true' }, `+${fraction(extra)}`);
    plate.append(bonus);
    setTimeout(() => bonus.remove(), 1000);
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

const QUARTERS = ['', '¼', '½', '¾'];

/** A meter reading as people write it: 3¼, ½, 8. */
function fraction(value: number): string {
  const quarters = Math.round(value * 4);
  const whole = Math.floor(quarters / 4);
  const part = QUARTERS[quarters % 4] ?? '';
  return whole === 0 && part ? part : `${whole}${part}`;
}
