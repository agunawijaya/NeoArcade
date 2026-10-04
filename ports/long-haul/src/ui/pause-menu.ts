import { RHYTHM_NAMES, VIEW_NAMES, type Settings } from '../settings';
import { button, fill, h } from './dom';

/**
 * The pause menu: back on the road, the other view, the map, how to play,
 * or leave the trip.
 */
export interface PauseMenuOptions {
  resume: () => void;
  openMap: () => void;
  switchView: () => void;
  switchRhythm: () => void;
  quit: () => void;
  settings: () => Settings;
  howToPlay: string;
}

export class PauseMenu {
  readonly element: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly message: HTMLElement;

  constructor(private readonly options: PauseMenuOptions) {
    this.inner = h('div', { class: 'pause__inner panel' });
    this.message = h('p', { class: 'pause__message' });
    this.element = h(
      'div',
      {
        class: 'pause',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Paused',
        hidden: true,
      },
      this.inner,
    );
  }

  open(message: string | null = null) {
    const settings = this.options.settings();
    this.message.textContent = message ?? '';
    fill(
      this.inner,
      h('h2', { class: 'sign' }, h('span', { class: 'sign__small' }, 'Rest area'), 'Paused'),
      message ? this.message : null,
      button('Back on the road', () => this.options.resume(), 'button button--primary'),
      button(
        `Switch to ${settings.view === 'cab' ? VIEW_NAMES.diorama : VIEW_NAMES.cab} view`,
        () => {
          this.options.switchView();
          this.open(message);
        },
        'button',
      ),
      button(
        `Play ${settings.rhythm === 'realtime' ? RHYTHM_NAMES.legs : RHYTHM_NAMES.realtime}`,
        () => {
          this.options.switchRhythm();
          this.open(message);
        },
        'button',
      ),
      button('Map', () => this.options.openMap(), 'button'),
      h('a', { class: 'button button--ghost', href: this.options.howToPlay }, 'How to play'),
      button('Leave this trip', () => this.options.quit(), 'button button--danger'),
    );
    this.element.hidden = false;
    this.inner.querySelector<HTMLButtonElement>('.button--primary')?.focus();
  }

  close() {
    this.element.hidden = true;
  }
}
