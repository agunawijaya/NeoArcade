import type { Point } from '../engine/geometry';
import type { PlayerIndex } from '../engine/gorillas';
import type { MatchFormat } from '../engine/match';
import { POWER_UPS, type PowerUpKind } from '../engine/powerups';
import type { TypedField } from '../game/typed-entry';
import { h, icon } from './dom';
import { ICONS, POWER_UP_ICONS } from './icons';

export interface HudHandlers {
  pause(): void;
  mute(): void;
  powerUp(player: PlayerIndex): void;
  /** A key pressed on the on-screen number pad. */
  keypad(key: string): void;
  skip(): void;
  /** Send the hit that just landed to a friend. */
  challenge(): void;
}

interface Plate {
  root: HTMLElement;
  name: HTMLElement;
  badge: HTMLElement;
  score: HTMLElement;
  power: HTMLButtonElement;
}

/** How a miss is shown: the distance and verdict, and for people a line of encouragement. */
export interface MissCallout {
  label: string;
  comment: string | null;
  accent: string;
}

const KEYPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'Backspace'];
const SPEECH_SECONDS = 3.2;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The heads-up display drawn over the city: plain DOM, so text stays crisp and readable. */
export class Hud {
  readonly element: HTMLElement;
  private readonly plates: [Plate, Plate];
  private accents: [string, string] = ['#ff7a3d', '#3fe0ff'];
  private readonly wind: HTMLElement;
  private readonly windArrow: HTMLElement;
  private readonly windValue: HTMLElement;
  private readonly twist: HTMLElement;
  private readonly throwCount: HTMLElement;
  private readonly roundLabel: HTMLElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly aim: HTMLElement;
  private readonly typedPanel: HTMLElement;
  private readonly keypad: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly hintBox: HTMLElement;
  private readonly replay: HTMLButtonElement;
  private readonly replayLabel: HTMLElement;
  private readonly challengeButton: HTMLButtonElement;
  private readonly speech: HTMLElement;
  private readonly miss: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  private speechTimer: ReturnType<typeof setTimeout> | undefined;
  private lastWind: number | null = null;

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
    this.twist = h('div', { class: 'hud__twist', hidden: true });
    this.throwCount = h('div', { class: 'hud__throws', hidden: true });
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
    this.replayLabel = h('span', {}, 'Instant replay');
    this.replay = h(
      'button',
      { class: 'hud__replay', type: 'button', hidden: true },
      h('span', { class: 'hud__replay-dot' }),
      this.replayLabel,
      h('span', { class: 'hud__replay-skip' }, 'tap or press Space to skip'),
    );
    this.replay.addEventListener('click', () => handlers.skip());
    this.challengeButton = h(
      'button',
      { class: 'button hud__challenge', type: 'button', hidden: true },
      icon(ICONS.swords),
      'Challenge a friend',
    );
    this.challengeButton.addEventListener('click', () => handlers.challenge());
    this.speech = h('div', { class: 'hud__speech', role: 'status', hidden: true });
    this.miss = h('div', { class: 'hud__miss', role: 'status', hidden: true });

    this.element = h(
      'div',
      { class: 'hud', hidden: true },
      this.plates[0].root,
      this.plates[1].root,
      h('div', { class: 'hud__bottom' }, this.twist, this.wind, this.throwCount, this.roundLabel),
      h('div', { class: 'hud__buttons' }, pauseButton, this.muteButton),
      this.miss,
      this.speech,
      this.aim,
      this.typedPanel,
      this.keypad,
      this.banner,
      this.toastBox,
      this.hintBox,
      this.replay,
      this.challengeButton,
    );
  }

  show(visible: boolean) {
    this.element.hidden = !visible;
  }

  setPlayers(names: [string, string], cpu: [boolean, boolean], accents: [string, string]) {
    this.accents = accents;
    this.plates.forEach((plate, player) => {
      plate.name.textContent = names[player] ?? '';
      plate.badge.hidden = !cpu[player];
      plate.root.style.setProperty('--accent', accents[player] ?? '#ffffff');
    });
  }

  setScores(scores: [number, number] | null, points = 0, format: MatchFormat = 'firstTo') {
    this.plates.forEach((plate, player) => {
      if (!scores) {
        plate.score.replaceChildren();
        plate.score.removeAttribute('aria-label');
        return;
      }
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

  /** The wind gauge; `hidden` is the heat haze, which hides it altogether. */
  setWind(wind: number, calmed: boolean, hidden = false) {
    if (hidden) {
      this.wind.dataset.direction = 'hidden';
      this.windValue.textContent = '?';
      this.wind.setAttribute('aria-label', 'Wind hidden: read the flags and smoke');
      return;
    }
    // A change of wind between throws pulses the gauge, so a gust never goes unnoticed.
    if (this.lastWind !== null && wind !== this.lastWind && !reducedMotion()) {
      this.wind.animate(
        [{ transform: 'scale(1.18)', borderColor: '#ffd23f' }, { transform: 'scale(1)' }],
        { duration: 700, easing: 'ease-out' },
      );
    }
    this.lastWind = wind;
    const strength = Math.abs(wind);
    this.windArrow.style.setProperty('--length', `${Math.min(64, 10 + strength * 4)}px`);
    this.wind.dataset.direction = calmed || wind === 0 ? 'calm' : wind > 0 ? 'right' : 'left';
    this.windValue.textContent = calmed ? 'Calm' : wind === 0 ? 'Still' : String(strength);
    this.wind.setAttribute(
      'aria-label',
      calmed || wind === 0 ? 'No wind' : `Wind ${strength} to the ${wind > 0 ? 'right' : 'left'}`,
    );
  }

  /** Forgets the last wind, so a new round's wind does not pulse as a gust. */
  resetWind() {
    this.lastWind = null;
  }

  /** The stage's twist, named next to the wind gauge. */
  setTwist(text: string | null) {
    this.twist.hidden = text === null;
    this.twist.textContent = text ?? '';
  }

  /** Your throws against the stage's budget for its second star. */
  setThrows(count: number | null, budget: number | null) {
    this.throwCount.hidden = count === null;
    if (count === null) return;
    this.throwCount.textContent =
      budget === null ? `Throws ${count}` : `Throws ${count} / ${budget}`;
    this.throwCount.classList.toggle('hud__throws--over', budget !== null && count > budget);
  }

  setRound(round: number, world: string) {
    this.setLabel(`Round ${round} · ${world}`);
  }

  /** The line in the bottom corner: the round and place, a puzzle's name, a daily's number. */
  setLabel(text: string) {
    this.roundLabel.textContent = text;
  }

  /** A free-form count beside the wind, such as "Attempt 3". */
  setCounter(text: string | null) {
    this.throwCount.hidden = text === null;
    this.throwCount.textContent = text ?? '';
    this.throwCount.classList.remove('hud__throws--over');
  }

  /** A side with nobody to show, such as a puzzle with no dummy, loses its name plate. */
  showPlate(player: PlayerIndex, visible: boolean) {
    this.plates[player].root.hidden = !visible;
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
    this.aim.style.setProperty('--accent', this.accents[player]);
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

  toast(text: string, accent: string | null = null) {
    clearTimeout(this.toastTimer);
    this.toastBox.textContent = text;
    this.toastBox.style.setProperty('--accent', accent ?? '#ffffff');
    this.toastBox.classList.add('hud__toast--visible');
    this.toastTimer = setTimeout(() => this.toastBox.classList.remove('hud__toast--visible'), 2600);
  }

  hint(text: string | null) {
    this.hintBox.textContent = text ?? '';
    this.hintBox.classList.toggle('hud__hint--visible', Boolean(text));
  }

  /** The badge over a replayed shot: the instant replay, or a challenger's shot. */
  showReplay(visible: boolean, label = 'Instant replay') {
    this.replay.hidden = !visible;
    this.replayLabel.textContent = label;
  }

  offerChallenge(visible: boolean) {
    this.challengeButton.hidden = !visible;
  }

  /** A rival's line in a speech bubble over their head; it pops away after a few seconds. */
  say(text: string, accent: string, player: PlayerIndex, seconds = SPEECH_SECONDS) {
    clearTimeout(this.speechTimer);
    this.speech.textContent = text;
    this.speech.dataset.side = player === 0 ? 'left' : 'right';
    this.speech.style.setProperty('--accent', accent);
    this.speech.hidden = false;
    this.speech.classList.remove('hud__speech--out');
    this.speechTimer = setTimeout(() => {
      this.speech.classList.add('hud__speech--out');
      this.speechTimer = setTimeout(() => (this.speech.hidden = true), 300);
    }, seconds * 1000);
  }

  hush() {
    clearTimeout(this.speechTimer);
    this.speech.hidden = true;
  }

  /** Keeps the bubble over the speaker's head as the camera moves, and inside the screen. */
  placeSpeech(at: Point | null, bounds: { width: number }) {
    if (!at || this.speech.hidden) return;
    const half = this.speech.offsetWidth / 2;
    const x = Math.min(bounds.width - half - 12, Math.max(half + 12, at.x));
    // The tail still points at the speaker when the bubble has been nudged aside.
    this.speech.style.setProperty('--tail', `${Math.round(at.x - x)}px`);
    this.speech.style.transform = `translate(${Math.round(x)}px, ${Math.round(at.y)}px)`;
  }

  /** "So close!": a marker where the banana came down, with the distance and a comment. */
  showMiss(callout: MissCallout | null) {
    if (!callout) {
      this.miss.classList.add('hud__miss--out');
      return;
    }
    this.miss.replaceChildren(
      h('span', { class: 'hud__miss-pin', 'aria-hidden': 'true' }),
      h(
        'span',
        { class: 'hud__miss-text' },
        h('strong', {}, callout.label),
        callout.comment ? h('span', {}, callout.comment) : null,
      ),
    );
    this.miss.classList.toggle('hud__miss--light', callout.comment === null);
    this.miss.classList.remove('hud__miss--out');
    this.miss.style.setProperty('--accent', callout.accent);
    this.miss.hidden = false;
  }

  /** Pins the marker to where the banana landed, kept on screen. */
  placeMiss(at: Point | null, bounds: { width: number; height: number }) {
    if (!at || this.miss.hidden) return;
    const x = Math.min(bounds.width - 16, Math.max(16, at.x));
    const y = Math.min(bounds.height - 60, Math.max(70, at.y));
    this.miss.dataset.flip = x > bounds.width - 220 ? 'true' : 'false';
    this.miss.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  clearMiss() {
    this.miss.hidden = true;
  }

  private makePlate(player: PlayerIndex): Plate {
    const name = h('span', { class: 'hud__name' });
    const badge = h('span', { class: 'hud__badge', hidden: true }, 'CPU');
    const score = h('span', { class: 'hud__score' });
    const power = h('button', { class: 'hud__power', type: 'button', hidden: true });
    power.addEventListener('click', () => this.handlers.powerUp(player));
    const root = h(
      'div',
      { class: `hud__plate hud__plate--p${player + 1}` },
      h('div', { class: 'hud__who' }, name, badge),
      score,
      power,
    );
    return { root, name, badge, score, power };
  }
}
