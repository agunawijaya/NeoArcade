import type { ReplayCamera, ReplayDirector, ReplayShot } from '../game/replay-director';
import type { SavedReplay } from '../game/replay-store';
import { h } from './dom';

/**
 * The replay's controls — the cameras, slow motion, saving and sharing —
 * the list of saved replays, a challenge someone sent, and the box that
 * hands over a challenge link.
 */
const CAMERAS: [ReplayCamera, string][] = [
  ['auto', 'Director'],
  ['chase', 'Chase'],
  ['tower', 'Tower'],
  ['runway', 'Runway'],
  ['cockpit', 'Cockpit'],
];

export interface ReplayBarActions {
  save: (() => void) | null;
  share: (() => void) | null;
  back(): void;
}

export class ReplayBar {
  readonly element: HTMLElement;
  private progress: HTMLElement;
  private label: HTMLElement;
  private saveButton: HTMLButtonElement | null = null;

  constructor(
    private director: ReplayDirector,
    actions: ReplayBarActions,
  ) {
    const cameras = h('div', {
      class: 'replay-cameras',
      role: 'radiogroup',
      'aria-label': 'Camera',
    });
    const buttons = new Map<ReplayCamera, HTMLButtonElement>();
    for (const [camera, label] of CAMERAS) {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'hud-view',
          role: 'radio',
          'aria-checked': camera === director.camera ? 'true' : 'false',
          onclick: () => {
            director.camera = camera;
            for (const [key, other] of buttons) {
              other.classList.toggle('active', key === camera);
              other.setAttribute('aria-checked', key === camera ? 'true' : 'false');
            }
          },
        },
        label,
      );
      button.classList.toggle('active', camera === director.camera);
      buttons.set(camera, button);
      cameras.append(button);
    }
    const slow = h('input', { type: 'checkbox', checked: director.slowMotion });
    slow.addEventListener('change', () => (director.slowMotion = slow.checked));
    this.progress = h('div', { class: 'replay-progress' });
    this.label = h('span', { class: 'replay-label' });
    if (actions.save) {
      const save = actions.save;
      this.saveButton = h(
        'button',
        {
          type: 'button',
          class: 'menu-link',
          onclick: () => {
            save();
            this.markSaved();
          },
        },
        'Save replay',
      );
    }
    this.element = h(
      'div',
      { class: 'replay-bar', role: 'toolbar', 'aria-label': 'Replay' },
      h('div', { class: 'replay-track' }, this.progress),
      h(
        'div',
        { class: 'replay-row' },
        cameras,
        h('label', { class: 'replay-slow' }, slow, ' Slow motion at touchdown'),
        this.label,
      ),
      h(
        'div',
        { class: 'replay-row' },
        h(
          'button',
          { type: 'button', class: 'menu-link', onclick: () => director.restart() },
          'From the start',
        ),
        this.saveButton,
        actions.share
          ? h(
              'button',
              { type: 'button', class: 'menu-link', onclick: actions.share },
              'Challenge a friend',
            )
          : null,
        h('button', { type: 'button', class: 'primary', onclick: actions.back }, 'Back'),
      ),
    );
  }

  markSaved() {
    if (!this.saveButton) return;
    this.saveButton.textContent = 'Saved';
    this.saveButton.disabled = true;
  }

  /** Each frame: how far through, the camera the director chose, and the numbers that make a landing. */
  update(shot: ReplayShot) {
    this.progress.style.setProperty('--done', String(this.director.progress));
    const { camera, slow } = shot;
    const readout = shot.flight.readout;
    const numbers = `${Math.max(0, Math.round(readout.heightFt))} ft · ${Math.round(readout.iasKt)} kt · ${Math.round(readout.verticalSpeedFpm)} fpm`;
    const text = `${camera[0]?.toUpperCase()}${camera.slice(1)}${slow ? ' · slow motion' : ''} · ${numbers}`;
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}

export interface ReplaysActions {
  watch(saved: SavedReplay): void;
  share(saved: SavedReplay): void;
  remove(saved: SavedReplay): void;
  back(): void;
}

export function replaysScreen(saved: readonly SavedReplay[], actions: ReplaysActions): HTMLElement {
  return h(
    'section',
    { class: 'screen replays', 'aria-labelledby': 'replays-title' },
    h(
      'header',
      { class: 'screen-header' },
      h('button', { type: 'button', class: 'menu-link', onclick: actions.back }, '← Back'),
      h('h2', { id: 'replays-title' }, 'Saved replays'),
    ),
    saved.length === 0
      ? h(
          'p',
          { class: 'school-intro' },
          'No replays yet. After a landing, watch its replay and press Save: the last ten are kept here, as the inputs that flew them rather than as video, so they take almost no room.',
        )
      : h(
          'ul',
          { class: 'replay-list' },
          ...saved.map((one) =>
            h(
              'li',
              { class: 'replay-item' },
              h(
                'div',
                {},
                h('h3', {}, one.title),
                h('p', {}, one.summary),
                h('p', { class: 'muted' }, new Date(one.savedAt).toLocaleString()),
              ),
              h(
                'div',
                { class: 'school-actions' },
                h(
                  'button',
                  { type: 'button', class: 'primary', onclick: () => actions.watch(one) },
                  'Watch',
                ),
                h(
                  'button',
                  { type: 'button', class: 'menu-link', onclick: () => actions.share(one) },
                  'Challenge link',
                ),
                h(
                  'button',
                  { type: 'button', class: 'menu-link', onclick: () => actions.remove(one) },
                  'Delete',
                ),
              ),
            ),
          ),
        ),
  );
}

export interface ChallengeInfo {
  who: string;
  what: string;
  score: string;
}

export function challengeScreen(
  info: ChallengeInfo,
  actions: { watch(): void; fly(): void; title(): void },
) {
  return h(
    'section',
    { class: 'screen challenge', 'aria-labelledby': 'challenge-title' },
    h('p', { class: 'title-kicker' }, 'Flight 312 · a challenge'),
    h('h2', { id: 'challenge-title' }, `${info.who} flew ${info.what}`),
    h('p', { class: 'challenge-score' }, info.score),
    h(
      'p',
      { class: 'school-intro' },
      'The same field, the same weather, the same wind to the knot. Watch how they did it, then see if you can do better.',
    ),
    h(
      'div',
      { class: 'report-actions' },
      h('button', { type: 'button', class: 'primary', onclick: actions.fly }, 'Fly it'),
      h(
        'button',
        { type: 'button', class: 'menu-link', onclick: actions.watch },
        'Watch their landing',
      ),
      h('button', { type: 'button', class: 'menu-link', onclick: actions.title }, 'Title'),
    ),
  );
}

/** The challenge link, ready to copy, with an optional name to sign it with. */
export function shareBox(
  nickname: string,
  link: (nickname: string) => Promise<string | null>,
  copy: (text: string) => Promise<string>,
  close: () => void,
): HTMLElement {
  const field = h('input', {
    type: 'text',
    maxlength: 16,
    value: nickname,
    'aria-label': 'Your name on the link (optional)',
    placeholder: 'Your name (optional)',
  });
  const output = h('textarea', {
    readonly: true,
    rows: 3,
    class: 'share-link',
    'aria-label': 'Challenge link',
  });
  const status = h('p', { class: 'daily-status', role: 'status' });
  const refresh = async () => {
    const url = await link(field.value);
    output.value = url ?? '';
    status.textContent = url
      ? ''
      : 'This flight is too long for a link; it stays in your saved replays.';
  };
  field.addEventListener('change', () => void refresh());
  void refresh();
  return h(
    'div',
    { class: 'overlay', role: 'dialog', 'aria-labelledby': 'share-title' },
    h(
      'div',
      { class: 'overlay-card' },
      h('h2', { id: 'share-title' }, 'Challenge a friend'),
      h(
        'p',
        {},
        'Whoever opens this link flies the same flight, in the same weather, and sees how you did.',
      ),
      h('label', { class: 'setting' }, h('span', {}, 'Sign it'), field),
      output,
      status,
      h(
        'div',
        { class: 'report-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'primary',
            onclick: () => void copy(output.value).then((said) => (status.textContent = said)),
          },
          'Copy the link',
        ),
        h('button', { type: 'button', class: 'menu-link', onclick: close }, 'Close'),
      ),
    ),
  );
}
