import { canShareText, copyText, shareText } from '@shared/daily';
import { CAMERA_VIEWS, type CameraView } from '../settings';
import { button, h, icon } from './dom';
import { ICONS } from './icons';

export const CAMERA_NAMES: Record<CameraView, { name: string; note: string }> = {
  chase: { name: 'Chase', note: 'behind the car' },
  classic: { name: 'Classic', note: 'top-down, like 1981' },
  iso: { name: 'Isometric', note: 'a tiny model world' },
};

export interface PauseHandlers {
  resume(): void;
  restart(): void;
  menu(): void;
  camera(view: CameraView): void;
}

export function buildPauseMenu(handlers: PauseHandlers, howToPlayHref: string, hallHref: string) {
  const note = h('p', { class: 'panel__note' });
  const cameras = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Camera view' });
  const resume = button('Resume', handlers.resume, 'button button--primary', {}, icon(ICONS.play));
  const element = h(
    'section',
    {
      class: 'overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'pause-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel panel--menu' },
      h('h2', { class: 'panel__title', id: 'pause-title' }, 'Paused'),
      note,
      h(
        'div',
        { class: 'pause__camera' },
        h('span', { class: 'setting__label' }, 'Camera'),
        cameras,
      ),
      h(
        'div',
        { class: 'menu' },
        resume,
        button('Restart', handlers.restart, 'button'),
        button('Main menu', handlers.menu, 'button'),
        h('a', { class: 'button button--quiet', href: howToPlayHref }, 'How to play'),
        h('a', { class: 'button button--quiet', href: hallHref }, 'Back to the Hall'),
      ),
    ),
  );

  const showCamera = (current: CameraView) => {
    cameras.replaceChildren(
      ...CAMERA_VIEWS.map((view) =>
        button(
          h('span', {}, CAMERA_NAMES[view].name),
          () => {
            handlers.camera(view);
            showCamera(view);
            cameras.querySelector<HTMLElement>(`[data-value="${view}"]`)?.focus();
          },
          'segmented__option',
          { role: 'radio', 'aria-checked': String(view === current), 'data-value': view },
        ),
      ),
    );
  };

  return {
    element,
    open(camera: CameraView, message: string | null = null) {
      note.textContent = message ?? '';
      note.hidden = !message;
      showCamera(camera);
      element.hidden = false;
      resume.focus();
    },
    close() {
      element.hidden = true;
    },
  };
}

export interface ResultsAction {
  label: string;
  primary?: boolean;
  run(): void;
}

export interface ResultsContent {
  title: string;
  subtitle?: string;
  tone: 'good' | 'bad' | 'plain';
  stars?: { earned: readonly boolean[]; labels: readonly string[]; fresh: readonly boolean[] };
  stats: readonly { label: string; value: string }[];
  /** Lines worth celebrating: a new best, a route opened. */
  notes?: readonly string[];
  share?: string;
  actions: readonly ResultsAction[];
}

export function buildResults() {
  const card = h('div', { class: 'results' });
  const element = h(
    'section',
    {
      class: 'overlay overlay--results',
      role: 'dialog',
      'aria-labelledby': 'results-title',
      hidden: true,
    },
    card,
  );
  return {
    element,
    show(content: ResultsContent) {
      card.dataset.tone = content.tone;
      const primary = content.actions.map((action) =>
        button(action.label, action.run, action.primary ? 'button button--primary' : 'button'),
      );
      const parts: (Node | null)[] = [
        h('h2', { class: 'results__title', id: 'results-title' }, content.title),
        content.subtitle ? h('p', { class: 'results__subtitle' }, content.subtitle) : null,
        content.stars ? starRow(content.stars) : null,
        h(
          'dl',
          { class: 'results__stats' },
          ...content.stats.flatMap((stat) => [h('dt', {}, stat.label), h('dd', {}, stat.value)]),
        ),
        ...(content.notes ?? []).map((line) => h('p', { class: 'results__note' }, line)),
        content.share ? shareBox(content.share) : null,
        h('div', { class: 'menu menu--row' }, ...primary),
      ];
      card.replaceChildren(...parts.filter((part): part is Node => part !== null));
      element.hidden = false;
      primary.find((_, index) => content.actions[index]?.primary)?.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}

function starRow(stars: NonNullable<ResultsContent['stars']>): HTMLElement {
  return h(
    'ol',
    { class: 'results__stars' },
    ...stars.labels.map((label, index) =>
      h(
        'li',
        {
          class: `results__star${stars.earned[index] ? ' is-earned' : ''}${stars.fresh[index] ? ' is-fresh' : ''}`,
          style: `--delay: ${index * 0.25}s`,
        },
        icon(stars.earned[index] ? ICONS.starFilled : ICONS.star),
        h('span', {}, label),
      ),
    ),
  );
}

/** The spoiler-free share line, with Copy and (where the device has one) Share. */
export function shareBox(text: string): HTMLElement {
  const status = h('span', { class: 'share__status', role: 'status' });
  const say = (outcome: string) => {
    status.textContent =
      outcome === 'copied'
        ? 'Copied!'
        : outcome === 'shared'
          ? 'Shared!'
          : outcome === 'failed'
            ? 'Could not copy'
            : '';
  };
  const actions = [
    button(
      'Copy',
      () => void copyText(text).then(say),
      'button button--small',
      {},
      icon(ICONS.copy),
    ),
  ];
  if (canShareText()) {
    actions.push(
      button(
        'Share…',
        () => void shareText(text).then(say),
        'button button--small',
        {},
        icon(ICONS.share),
      ),
    );
  }
  return h(
    'div',
    { class: 'share' },
    h('pre', { class: 'share__text' }, text),
    h('div', { class: 'share__actions' }, ...actions, status),
  );
}
