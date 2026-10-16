import { copyText, shareText as share } from '@shared/daily';
import type { CameraView } from '../render/view';
import { button, h } from './dom';

/** A share line in a box with a button that shares or copies it. */
export function shareBox(text: string): HTMLElement {
  const status = h('span', { class: 'share__status', 'aria-live': 'polite' });
  return h(
    'div',
    { class: 'share' },
    h('pre', { class: 'share__text' }, text),
    button(
      'Share',
      () => {
        void share(text).then((outcome) => {
          status.textContent =
            outcome === 'copied' ? 'Copied' : outcome === 'failed' ? 'Could not copy' : '';
        });
      },
      'chip',
      { 'data-action': 'share' },
    ),
    button(
      'Copy',
      () => {
        void copyText(text).then((outcome) => {
          status.textContent = outcome === 'copied' ? 'Copied' : 'Could not copy';
        });
      },
      'chip',
    ),
    status,
  );
}

export interface PauseHandlers {
  resume(): void;
  restart(): void;
  menu(): void;
  camera(view: CameraView): void;
  settings(): void;
}

/** The pause card: back to it, the camera, settings, how to play, the menu and the Hall. */
export function buildPauseMenu(handlers: PauseHandlers, howToPlayHref: string, hallHref: string) {
  const message = h('p', { class: 'card__note', hidden: true });
  const cameras = (['side', 'diorama'] as const).map((view) =>
    button(view === 'side' ? 'Side view' : 'Diorama 3D', () => handlers.camera(view), 'chip', {
      'data-camera': view,
    }),
  );
  const resume = button('Back to the fight', () => handlers.resume(), 'card__button');
  const element = h(
    'section',
    { class: 'screen screen--overlay', 'aria-labelledby': 'pause-title', hidden: true },
    h(
      'div',
      { class: 'card' },
      h('h2', { class: 'card__title card__title--small', id: 'pause-title' }, 'Paused'),
      message,
      resume,
      h('div', { class: 'title__row', role: 'group', 'aria-label': 'Camera' }, ...cameras),
      h(
        'div',
        { class: 'title__row' },
        button('Start again', () => handlers.restart(), 'chip'),
        button('Settings', () => handlers.settings(), 'chip'),
        h('a', { class: 'chip', href: howToPlayHref }, 'How to play'),
      ),
      h(
        'div',
        { class: 'title__row' },
        button('Menu', () => handlers.menu(), 'chip'),
        h('a', { class: 'chip', href: hallHref }, 'Back to the Hall'),
      ),
    ),
  );
  return {
    element,
    open(camera: CameraView, note: string | null = null) {
      element.hidden = false;
      message.hidden = note === null;
      message.textContent = note ?? '';
      this.showCamera(camera);
      resume.focus();
    },
    showCamera(camera: CameraView) {
      for (const choice of cameras)
        choice.setAttribute('aria-pressed', String(choice.dataset.camera === camera));
    },
    close() {
      element.hidden = true;
    },
  };
}

/** One line of the results: what, how many, what it was worth. */
export interface ResultLine {
  label: string;
  value: string;
}

export interface ResultsContent {
  kicker: string;
  title: string;
  lines: readonly ResultLine[];
  total: string;
  /** Campaign stars, earned or not, with what each asked. */
  stars?: readonly { earned: boolean; label: string }[];
  note?: string;
  share?: string;
  actions: readonly { label: string; run(): void; primary?: boolean }[];
}

/** The results card at the end of a game. */
export function buildResults() {
  const card = h('div', { class: 'card card--results' });
  const element = h(
    'section',
    { class: 'screen screen--overlay', 'aria-label': 'Results', hidden: true },
    card,
  );
  return {
    element,
    show(content: ResultsContent) {
      const parts: (Node | null)[] = [
        h('p', { class: 'card__kicker' }, content.kicker),
        h('h2', { class: 'card__title card__title--small' }, content.title),
        content.stars
          ? h(
              'ul',
              { class: 'goals goals--results' },
              ...content.stars.map((star) =>
                h('li', { class: star.earned ? 'goal goal--earned' : 'goal' }, `★ ${star.label}`),
              ),
            )
          : null,
        h(
          'dl',
          { class: 'tally' },
          ...content.lines.flatMap((line) => [h('dt', {}, line.label), h('dd', {}, line.value)]),
        ),
        h('p', { class: 'card__score' }, content.total),
        content.note ? h('p', { class: 'card__note' }, content.note) : null,
        content.share ? shareBox(content.share) : null,
        h(
          'div',
          { class: 'card__footer' },
          ...content.actions.map((action) =>
            button(action.label, action.run, action.primary ? 'card__button' : 'chip'),
          ),
        ),
      ];
      card.replaceChildren(...parts.filter((part): part is Node => part !== null));
      element.hidden = false;
      card.querySelector<HTMLElement>('.card__button, .chip')?.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}
