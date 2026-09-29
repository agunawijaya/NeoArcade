import { canShareText, copyText, shareText, type ShareOutcome } from '@shared/daily';
import { h, icon } from './dom';
import { ICONS } from './icons';

/**
 * Text ready to send: shown as it will arrive, with a Copy button and, on
 * devices that have one, the share sheet. Used by the daily's share line
 * and by challenge links.
 */
export interface ShareBox {
  element: HTMLElement;
  show(text: string): void;
}

const SAID: Record<ShareOutcome, string> = {
  shared: 'Shared!',
  copied: 'Copied! Paste it anywhere.',
  cancelled: '',
  failed: 'Could not copy: select the text and copy it yourself.',
};

/** `extras` join the Copy and Share buttons, such as a dialog's Done. */
export function buildShareBox(label: string, extras: HTMLElement[] = []): ShareBox {
  const preview = h('pre', { class: 'share-box__text', tabindex: 0, 'aria-label': label });
  const status = h('p', { class: 'share-box__status', role: 'status' });
  const copy = h(
    'button',
    { class: 'button button--primary', type: 'button', 'data-share': 'copy' },
    icon(ICONS.copy),
    'Copy',
  );
  const share = h(
    'button',
    { class: 'button', type: 'button', 'data-share': 'share' },
    icon(ICONS.share),
    'Share…',
  );
  let text = '';
  const report = (outcome: ShareOutcome) => {
    status.textContent = SAID[outcome];
  };
  copy.addEventListener('click', () => void copyText(text).then(report));
  share.addEventListener('click', () => void shareText(text).then(report));

  const element = h(
    'div',
    { class: 'share-box' },
    preview,
    h('div', { class: 'share-box__actions' }, copy, share, ...extras),
    status,
  );
  return {
    element,
    show(next) {
      text = next;
      preview.textContent = next;
      status.textContent = '';
      share.hidden = !canShareText();
    },
  };
}
