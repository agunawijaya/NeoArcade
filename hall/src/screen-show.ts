import type { GameEntry } from './catalog';
import { playCover, type CoverPlayer } from './cover-player';
import { loadCover } from './covers';
import { mediaUrl } from './docs-source';
import { h } from './dom';
import { onMotionPreferenceChange, prefersReducedMotion } from './motion';

/**
 * A game's own screens, shown as they are: screenshots from the port that
 * cross-fade every few seconds, each with its caption. Cycling pauses while
 * the pointer or focus rests on it, stops for good once the player picks a
 * screen, and never starts for players who prefer reduced motion. A game
 * without screenshots, or whose screenshots fail to load, shows its
 * animated cover instead.
 */
export interface ScreenShow {
  element: HTMLElement;
  /** Starts or pauses the show, e.g. while the panel holding it opens and closes. */
  setPlaying(playing: boolean): void;
  dispose(): void;
}

export interface ScreenShowOptions {
  /** Cycle through every screen with dots to pick one; otherwise show only the first. */
  cycle: boolean;
  /** Load the first screen straight away instead of when it scrolls into view. */
  eager?: boolean;
}

const SECONDS_PER_SCREEN = 6;

interface Frame {
  figure: HTMLElement;
  caption: string;
}

export function buildScreenShow(game: GameEntry, options: ScreenShowOptions): ScreenShow {
  const element = h('div', { class: 'screens', style: `--accent: ${game.accent}` });
  const screens = (game.screens ?? [])
    .map((screen) => ({ ...screen, url: mediaUrl(`ports/${game.slug}/${screen.image}`) }))
    .filter((screen) => screen.url !== null)
    .slice(0, options.cycle ? undefined : 1);

  let cover: CoverPlayer | null = null;
  let playing = false;
  let disposed = false;
  const showCover = () => {
    if (element.dataset.kind === 'cover') return;
    element.dataset.kind = 'cover';
    const canvas = h('canvas', { class: 'screens__cover', 'aria-hidden': 'true' });
    element.replaceChildren(canvas);
    void loadCover(game.cover).then((definition) => {
      if (disposed) return;
      cover = playCover(canvas, definition, {
        seed: coverSeed(game.slug),
        accent: game.accent,
        title: game.title,
      });
      cover.setAlive(playing);
    });
  };

  if (screens.length === 0) {
    showCover();
    return {
      element,
      setPlaying(next) {
        playing = next;
        cover?.setAlive(next);
      },
      dispose() {
        disposed = true;
        cover?.dispose();
      },
    };
  }

  element.dataset.kind = 'screens';
  const caption = h('p', { class: 'screens__caption' });
  const dots = h('div', { class: 'screens__dots', role: 'group', 'aria-label': 'Screenshots' });
  let frames: Frame[] = [];
  let current = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resting = false;
  let chosen = false;

  const show = (index: number) => {
    current = (index + frames.length) % frames.length;
    frames.forEach((frame, position) => {
      frame.figure.classList.toggle('is-active', position === current);
    });
    [...dots.children].forEach((dot, position) => {
      dot.setAttribute('aria-pressed', String(position === current));
    });
    const text = frames[current]?.caption ?? '';
    caption.textContent = text;
    caption.hidden = text === '';
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const cycling = playing && !resting && !chosen && frames.length > 1 && !prefersReducedMotion();
    if (cycling && !document.hidden) timer = setTimeout(advance, SECONDS_PER_SCREEN * 1000);
  };

  const advance = () => {
    show(current + 1);
    schedule();
  };

  const drop = (frame: Frame) => {
    frame.figure.remove();
    const position = frames.indexOf(frame);
    frames = frames.filter((other) => other !== frame);
    dots.children[position]?.remove();
    if (frames.length === 0) {
      showCover();
      return;
    }
    dots.hidden = frames.length < 2;
    show(Math.min(current, frames.length - 1));
  };

  frames = screens.map((screen, index) => {
    const image = h('img', {
      class: 'screens__image',
      src: screen.url,
      alt: screen.caption ?? `${game.title}, screenshot ${index + 1}`,
      loading: index === 0 && options.eager ? 'eager' : 'lazy',
      decoding: 'async',
      draggable: 'false',
    });
    const frame: Frame = {
      figure: h('figure', { class: 'screens__frame' }, image),
      caption: screen.caption ?? '',
    };
    image.addEventListener('error', () => drop(frame), { once: true });
    return frame;
  });

  frames.forEach((frame, index) => {
    const dot = h('button', {
      class: 'screens__dot',
      type: 'button',
      'aria-label': `Screenshot ${index + 1} of ${frames.length}`,
    });
    dot.addEventListener('click', () => {
      chosen = true;
      show(frames.indexOf(frame));
      schedule();
    });
    dots.append(dot);
  });
  dots.hidden = !options.cycle || frames.length < 2;

  element.append(...frames.map((frame) => frame.figure), caption, dots);
  if (!options.cycle) caption.remove();
  show(0);

  const rest = (next: boolean) => () => {
    resting = next;
    schedule();
  };
  element.addEventListener('pointerenter', rest(true));
  element.addEventListener('pointerleave', rest(false));
  element.addEventListener('focusin', rest(true));
  element.addEventListener('focusout', rest(false));
  document.addEventListener('visibilitychange', schedule);
  const stopListening = onMotionPreferenceChange(schedule);

  return {
    element,
    setPlaying(next) {
      playing = next;
      cover?.setAlive(next);
      schedule();
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
      stopListening();
      cover?.dispose();
    },
  };
}

/** A stable seed per game, so each cover always opens on the same scene. */
function coverSeed(slug: string): number {
  return [...slug].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
}
