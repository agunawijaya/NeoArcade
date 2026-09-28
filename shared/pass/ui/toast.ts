import './tokens.css';
import './toast.css';
import type { PlayOptions, Sound } from '../../audio';
import { drawBadge } from '../art/badge';
import { drawRankEmblem } from '../art/rank';
import { TIER_NAMES } from '../manifest';
import type { PassEvent, PassHealth, PassListener } from '../pass';

/**
 * The one unlock toast every NeoArcade page uses: a badge's medal, its name,
 * a line of flavour and the XP it paid; or a level-up with what it unlocked.
 *
 * Games keep toasts queued while a turn is being played and call flush()
 * when the playfield can spare the attention (between rounds, on the
 * results screen). Pages without a playfield pass `autoFlush: true`.
 *
 *   const toasts = mountUnlockToasts(pass, { accent: '#ff8a3d', audio });
 *   onRoundOver(() => toasts.flush());
 */
export interface UnlockToasts {
  /** Shows everything queued, one after another. */
  flush(): void;
  /** Closes the toast on screen and keeps the rest queued, e.g. when the next turn starts. */
  hold(): void;
  /** Closes the toast on screen; the next queued one follows. */
  dismiss(): void;
  readonly visible: boolean;
  readonly pending: number;
  dispose(): void;
}

export interface UnlockToastOptions {
  /** Show toasts as soon as they arrive. Games leave this off and flush between turns. */
  autoFlush?: boolean;
  placement?: 'top' | 'bottom';
  /** The game's colour for a badge's enamel, or a lookup by game slug. */
  accent?: string | ((game: string) => string | undefined);
  /** Plays the unlock chime through the page's audio engine, so it follows the arcade-wide mix. */
  audio?: { play(sound: Sound, options?: PlayOptions): void };
  /** Milliseconds each toast stays up. */
  duration?: number;
  parent?: HTMLElement;
}

interface Subscribable {
  subscribe(listener: PassListener): () => void;
  readonly health: PassHealth;
}

type Toast =
  | Extract<PassEvent, { type: 'badge' } | { type: 'level' }>
  | { type: 'not-saving'; health: Exclude<PassHealth, 'ok'> };

const NOT_SAVING: Record<Exclude<PassHealth, 'ok'>, string> = {
  unavailable:
    'This browser isn’t keeping site data, so your XP and badges last until you close the tab. The game plays exactly the same.',
  full: 'Your browser’s storage is full, so new XP and badges aren’t being kept. The game plays exactly the same.',
  'newer-version':
    'A newer NeoArcade saved your Pass here, so this one leaves it alone and keeps today’s progress in memory.',
};

const DEFAULT_DURATION = 5200;
const GAP_BETWEEN_TOASTS = 280;

const CHIME: Sound = {
  wave: 'triangle',
  envelope: { attack: 0.004, decay: 0.12, sustain: 0.25, release: 0.3 },
  gain: 0.32,
  duration: 0.09,
};
const BADGE_NOTES = [784, 988, 1319];
const LEVEL_NOTES = [523, 659, 784, 1047];

export function mountUnlockToasts(
  pass: Subscribable,
  {
    autoFlush = false,
    placement = 'top',
    accent,
    audio,
    duration = DEFAULT_DURATION,
    parent = document.body,
  }: UnlockToastOptions = {},
): UnlockToasts {
  const region = document.createElement('div');
  region.className = `neo-toasts neo-toasts--${placement}`;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  parent.append(region);

  const queue: Toast[] = [];
  let showing: HTMLElement | null = null;
  let flushing = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let remaining = duration;
  let shownAt = 0;

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const accentFor = (game: string) => (typeof accent === 'function' ? accent(game) : accent);

  const startTimer = () => {
    clearTimeout(hideTimer);
    shownAt = performance.now();
    hideTimer = setTimeout(dismiss, remaining);
  };
  const pauseTimer = () => {
    if (!showing) return;
    clearTimeout(hideTimer);
    remaining = Math.max(1200, remaining - (performance.now() - shownAt));
  };

  function showNext() {
    const next = queue.shift();
    if (!next) {
      flushing = autoFlush;
      return;
    }
    showing = buildToast(next, accentFor, dismiss);
    region.append(showing);
    showing.addEventListener('pointerenter', pauseTimer);
    showing.addEventListener('pointerleave', startTimer);
    showing.addEventListener('focusin', pauseTimer);
    showing.addEventListener('focusout', startTimer);
    remaining = duration;
    startTimer();
    playChime(next);
  }

  function dismiss() {
    if (!showing) return;
    clearTimeout(hideTimer);
    const leaving = showing;
    showing = null;
    leaving.classList.add('is-leaving');
    const removeDelay = reducedMotion() ? 0 : 240;
    setTimeout(() => leaving.remove(), removeDelay);
    if (flushing) setTimeout(showNext, removeDelay + GAP_BETWEEN_TOASTS);
  }

  function playChime(toast: Toast) {
    if (!audio || toast.type === 'not-saving') return;
    const notes = toast.type === 'level' ? LEVEL_NOTES : BADGE_NOTES;
    notes.forEach((frequency, index) => audio.play(CHIME, { frequency, delay: index * 0.075 }));
  }

  // Escape closes the toast before the game hears it, so it never also opens a pause menu.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !showing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dismiss();
  };
  window.addEventListener('keydown', onKeyDown, { capture: true });

  // Saving trouble is said once per page, politely, like any other news.
  const toldAbout = new Set<PassHealth>();
  const noteHealth = (health: PassHealth) => {
    if (health === 'ok' || toldAbout.has(health)) return;
    toldAbout.add(health);
    queue.push({ type: 'not-saving', health });
  };

  const unsubscribe = pass.subscribe((event) => {
    if (event.type === 'health') noteHealth(event.health);
    else if (event.type === 'badge' || event.type === 'level') queue.push(event);
    else return;
    if (autoFlush) flush();
  });
  noteHealth(pass.health);
  if (autoFlush && queue.length > 0) flush();

  function flush() {
    flushing = true;
    if (!showing) showNext();
  }

  return {
    flush,
    hold() {
      flushing = false;
      dismiss();
    },
    dismiss,
    get visible() {
      return showing !== null;
    },
    get pending() {
      return queue.length;
    },
    dispose() {
      unsubscribe();
      clearTimeout(hideTimer);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      region.remove();
    },
  };
}

function buildToast(
  toast: Toast,
  accentFor: (game: string) => string | undefined,
  dismiss: () => void,
): HTMLElement {
  const card = element('div', 'neo-toast');
  const art = element('div', 'neo-toast__art');
  const text = element('div', 'neo-toast__text');
  const eyebrow = element('p', 'neo-toast__eyebrow');
  const title = element('p', 'neo-toast__title');
  const line = element('p', 'neo-toast__line');
  const close = element('button', 'neo-toast__close');
  close.setAttribute('type', 'button');
  close.setAttribute('aria-label', 'Dismiss');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  close.addEventListener('click', dismiss);

  if (toast.type === 'badge') {
    const { badge, xp, unlocks } = toast;
    card.classList.add('neo-toast--badge', `neo-toast--${badge.tier}`);
    art.append(drawBadge(badge, { unlocked: true, accent: accentFor(toast.game) }));
    eyebrow.textContent = `${TIER_NAMES[badge.tier]} badge unlocked`;
    title.textContent = badge.name;
    line.textContent = badge.description;
    text.append(eyebrow, title, line);
    if (unlocks.length > 0) text.append(unlockLine(unlocks.map((unlock) => unlock.name)));
    if (xp > 0) card.append(xpPill(xp));
  } else if (toast.type === 'not-saving') {
    card.classList.add('neo-toast--notice');
    art.append(noticeIcon());
    eyebrow.textContent = 'Arcade Pass';
    title.textContent = 'Progress isn’t being saved';
    line.textContent = NOT_SAVING[toast.health];
    text.append(eyebrow, title, line);
  } else {
    card.classList.add('neo-toast--level');
    if (toast.newRank) {
      art.append(drawRankEmblem(toast.rank.id));
      eyebrow.textContent = 'New rank';
      title.textContent = `${toast.rank.name} · level ${toast.level}`;
      line.textContent = toast.rank.motto;
    } else {
      art.append(levelDisc(toast.level));
      eyebrow.textContent = 'Level up';
      title.textContent = `Level ${toast.level}`;
      line.textContent = `${toast.rank.name}, and climbing.`;
    }
    text.append(eyebrow, title, line);
    if (toast.unlocks.length > 0) {
      text.append(unlockLine(toast.unlocks.map((unlock) => unlock.name)));
    }
  }
  card.prepend(art, text);
  card.append(close);
  return card;
}

function unlockLine(names: string[]): HTMLElement {
  const line = element('p', 'neo-toast__unlocks');
  const shown = names.slice(0, 3).join(', ');
  line.textContent = `Unlocked: ${shown}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
  return line;
}

function xpPill(xp: number): HTMLElement {
  const pill = element('p', 'neo-toast__xp');
  pill.textContent = `+${xp} XP`;
  return pill;
}

function noticeIcon(): HTMLElement {
  const icon = element('div', 'neo-toast__notice');
  icon.textContent = '!';
  return icon;
}

function levelDisc(level: number): HTMLElement {
  const disc = element('div', 'neo-toast__level');
  disc.textContent = String(level);
  return disc;
}

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
