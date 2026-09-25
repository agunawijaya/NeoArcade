import type { Point } from '../engine/geometry';
import type { PlayerIndex } from '../engine/gorillas';
import type { MatchFormat } from '../engine/match';
import { POWER_UPS, type PowerUpKind } from '../engine/powerups';
import type { TypedField } from '../game/typed-entry';
import { GORILLA_LOOKS } from '../render/gorilla';
import { h, icon } from './dom';
import { ICONS, POWER_UP_ICONS } from './icons';

export interface HudHandlers {
  pause(): void;
  mute(): void;
  powerUp(player: PlayerIndex): void;
  /** A key pressed on the on-screen number pad. */
  keypad(key: string): void;
  skip(): void;
}

interface Plate {
  root: HTMLElement;
  name: HTMLElement;
  badge: HTMLElement;
  score: HTMLElement;
  power: HTMLButtonElement;
}

const KEYPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'Backspace'];

/** The heads-up display drawn over the city: plain DOM, so text stays crisp and readable. */
export class Hud {
  readonly element: HTMLElement;
  private readonly plates: [Plate, Plate];
  private readonly wind: HTMLElement;
  private readonly windArrow: HTMLElement;
  private readonly windValue: HTMLElement;
  private readonly roundLabel: HTMLElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly aim: HTMLElement;
  private readonly typedPanel: HTMLElement;
  private readonly keypad: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly hintBox: HTMLElement;
  private readonly replay: HTMLButtonElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly handlers: HudHandlers) {
    this.plates = [this.makePlate(0), this.makePlate(1)];
    this.windArrow = h('span', { class: 'hud__wind-arrow', 'aria-hidden': 'true' });
    this.windValue = h('span', { class: 'hud__wind-value' });
    this.wind = h(
      'div',
      { class: 'hud__wind', role: 'img' },
      h('span', { class: 'hud__wind-label' }, 'Wind'),
      this.windArrow,
      this.windValue,
    );
    this.roundLabel = h('div', { class: 'hud__round' });

    const pauseButton = h(
      'button',
      { class: 'hud__button', type: 'button', 'aria-label': 'Pause' },
      icon(ICONS.pause),
    );
    pauseButton.addEventListener('click', () => handlers.pause());
    this.muteButton = h(
      'button',
      { class: 'hud__button', type: 'button', 'aria-label': 'Mute sound' },
      icon(ICONS.soundOn),
    );
    this.muteButton.addEventListener('click', () => handlers.mute());

    this.aim = h('div', { class: 'hud__aim', hidden: true });
    this.typedPanel = h('div', { class: 'hud__typed', hidden: true });
    this.keypad = h(
      'div',
      { class: 'hud__keypad', hidden: true },
      ...[...KEYPAD, 'Enter'].map((key) => {
        const label = key === 'Backspace' ? '⌫' : key === 'Enter' ? 'Enter' : key;
        const button = h(
          'button',
          {
            class: `hud__key${key === 'Enter' ? ' hud__key--enter' : ''}`,
            type: 'button',
            'aria-label': key,
          },
          label,
        );
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          handlers.keypad(key);
        });
        return button;
      }),
    );
    this.banner = h('div', { class: 'hud__banner', hidden: true });
    this.toastBox = h('div', { class: 'hud__toast', role: 'status' });
    this.hintBox = h('div', { class: 'hud__hint' });
    this.replay = h(
      'button',
      { class: 'hud__replay', type: 'button', hidden: true },
      h('span', { class: 'hud__replay-dot' }),
      'Instant replay',
      h('span', { class: 'hud__replay-skip' }, 'tap or press Space to skip'),
    );
    this.replay.addEventListener('click', () => handlers.skip());

    this.element = h(
      'div',
      { class: 'hud', hidden: true },
      this.plates[0].root,
      this.plates[1].root,
      h('div', { class: 'hud__bottom' }, this.wind, this.roundLabel),
      h('div', { class: 'hud__buttons' }, pauseButton, this.muteButton),
      this.aim,
      this.typedPanel,
      this.keypad,
      this.banner,
      this.toastBox,
      this.hintBox,
      this.replay,
    );
  }

  show(visible: boolean) {
    this.element.hidden = !visible;
  }

  setPlayers(names: [string, string], cpu: [boolean, boolean]) {
    this.plates.forEach((plate, player) => {
      plate.name.textContent = names[player] ?? '';
      plate.badge.hidden = !cpu[player];
    });
  }

  setScores(scores: [number, number], points: number, format: MatchFormat) {
    this.plates.forEach((plate, player) => {
      const score = scores[player] ?? 0;
      plate.score.replaceChildren(
        h('strong', {}, String(score)),
        h('span', {}, format === 'firstTo' ? ` / ${points}` : ''),
      );
      plate.score.setAttribute(
        'aria-label',
        format === 'firstTo' ? `${score} of ${points} points` : `${score} points`,
      );
    });
  }

  setTurn(player: PlayerIndex | null) {
    this.plates.forEach((plate, index) =>
      plate.root.classList.toggle('hud__plate--turn', index === player),
    );
  }

  setWind(wind: number, calmed: boolean) {
    const strength = Math.abs(wind);
    this.windArrow.style.setProperty('--length', `${Math.min(64, 10 + strength * 4)}px`);
    this.wind.dataset.direction = calmed || wind === 0 ? 'calm' : wind > 0 ? 'right' : 'left';
    this.windValue.textContent = calmed ? 'Calm' : wind === 0 ? 'Still' : String(strength);
    this.wind.setAttribute(
      'aria-label',
      calmed || wind === 0 ? 'No wind' : `Wind ${strength} to the ${wind > 0 ? 'right' : 'left'}`,
    );
  }

  setRound(round: number, world: string) {
    this.roundLabel.textContent = `Round ${round} · ${world}`;
  }

  setHeld(player: PlayerIndex, kind: PowerUpKind | null, armed: boolean, usable: boolean) {
    const button = this.plates[player].power;
    button.hidden = kind === null;
    if (!kind) return;
    button.replaceChildren(icon(POWER_UP_ICONS[kind]), h('span', {}, POWER_UPS[kind].name));
    button.disabled = !usable;
    button.dataset.kind = kind;
    button.classList.toggle('hud__power--armed', armed);
    button.setAttribute('aria-pressed', String(armed));
    button.title = `${POWER_UPS[kind].effect}${usable ? ' Press U to use.' : ''}`;
  }

  setMuted(muted: boolean) {
    this.muteButton.replaceChildren(icon(muted ? ICONS.soundOff : ICONS.soundOn));
    this.muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  /** The angle and power next to the throwing arm; null hides it. */
  showAim(at: Point | null, text: string, player: PlayerIndex) {
    this.aim.hidden = at === null;
    if (!at) return;
    this.aim.textContent = text;
    this.aim.dataset.player = String(player);
    this.aim.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
  }

  /** The Classic "Angle: / Velocity:" prompt, in the thrower's top corner like 1990. */
  showTyped(
    player: PlayerIndex | null,
    field: TypedField,
    text: string,
    angle: number | null,
    keypad: boolean,
  ) {
    this.typedPanel.hidden = player === null;
    this.keypad.hidden = player === null || !keypad;
    if (player === null) return;
    this.typedPanel.dataset.player = String(player);
    const cursor = h('span', { class: 'hud__cursor' }, '_');
    const angleLine = h(
      'div',
      {},
      'Angle: ',
      field === 'angle' ? text : String(angle ?? ''),
      field === 'angle' ? cursor : null,
    );
    const velocityLine = field === 'velocity' ? h('div', {}, 'Velocity: ', text, cursor) : null;
    this.typedPanel.replaceChildren(angleLine, velocityLine ?? '');
  }

  showBanner(title: string, subtitle: string, seconds = 2.2) {
    clearTimeout(this.bannerTimer);
    this.banner.replaceChildren(h('strong', {}, title), h('span', {}, subtitle));
    this.banner.hidden = false;
    this.banner.classList.remove('hud__banner--out');
    this.bannerTimer = setTimeout(() => {
      this.banner.classList.add('hud__banner--out');
      this.bannerTimer = setTimeout(() => (this.banner.hidden = true), 500);
    }, seconds * 1000);
  }

  toast(text: string, player: PlayerIndex | null = null) {
    clearTimeout(this.toastTimer);
    this.toastBox.textContent = text;
    this.toastBox.style.setProperty(
      '--accent',
      player === null ? '#ffffff' : GORILLA_LOOKS[player].accent,
    );
    this.toastBox.classList.add('hud__toast--visible');
    this.toastTimer = setTimeout(() => this.toastBox.classList.remove('hud__toast--visible'), 2600);
  }

  hint(text: string | null) {
    this.hintBox.textContent = text ?? '';
    this.hintBox.classList.toggle('hud__hint--visible', Boolean(text));
  }

  showReplay(visible: boolean) {
    this.replay.hidden = !visible;
  }

  private makePlate(player: PlayerIndex): Plate {
    const name = h('span', { class: 'hud__name' });
    const badge = h('span', { class: 'hud__badge', hidden: true }, 'CPU');
    const score = h('span', { class: 'hud__score' });
    const power = h('button', { class: 'hud__power', type: 'button', hidden: true });
    power.addEventListener('click', () => this.handlers.powerUp(player));
    const root = h(
      'div',
      {
        class: `hud__plate hud__plate--p${player + 1}`,
        style: `--accent: ${GORILLA_LOOKS[player].accent}`,
      },
      h('div', { class: 'hud__who' }, name, badge),
      score,
      power,
    );
    return { root, name, badge, score, power };
  }
}
