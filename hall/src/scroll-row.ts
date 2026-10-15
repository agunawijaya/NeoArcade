import { h, icon } from './dom';
import { ICONS } from './icons';
import { prefersReducedMotion } from './motion';

/**
 * A row of items that scrolls sideways: by touch, trackpad, shift + wheel,
 * the arrow buttons beside its heading, or by moving focus along it. The
 * edges fade where there is more to see.
 */
export interface ScrollRow {
  /** The scrolling viewport, holding the list. */
  element: HTMLElement;
  list: HTMLUListElement;
  /** Previous and next buttons, for the row's heading; hidden when everything fits. */
  buttons: HTMLElement;
  /** Scrolls the row so the item is fully in view. */
  reveal(item: HTMLElement): void;
  /** Re-reads the size after the items change. */
  refresh(): void;
}

// Room left beside a revealed item, so its focus ring and lift are not clipped by the fade.
const EDGE_ROOM = 28;

const rows = new WeakMap<Element, ScrollRow>();

/**
 * Marks which ends of a sideways scroller have more to see (`has-before`,
 * `has-after`), for the edge fades in CSS. Returns a function to check again.
 */
export function watchEdges(
  element: HTMLElement,
  onChange?: (atStart: boolean, atEnd: boolean) => void,
) {
  const check = () => {
    const overflow = element.scrollWidth - element.clientWidth;
    const atStart = element.scrollLeft <= 2;
    const atEnd = element.scrollLeft >= overflow - 2;
    element.classList.toggle('has-before', !atStart);
    element.classList.toggle('has-after', !atEnd);
    onChange?.(atStart, atEnd);
  };
  element.addEventListener('scroll', check, { passive: true });
  new ResizeObserver(check).observe(element);
  return check;
}

/** Scrolls whichever row holds the item so it is fully in view. */
export function revealInRow(item: HTMLElement): void {
  const viewport = item.closest('.scroll-row');
  if (viewport) rows.get(viewport)?.reveal(item);
}

export function buildScrollRow(label: string): ScrollRow {
  const list = h('ul', { class: 'scroll-row__list', 'data-row': '', 'aria-label': label });
  const element = h('div', { class: 'scroll-row edge-fade' }, list);
  const previous = h(
    'button',
    { class: 'scroll-row__button', type: 'button', 'aria-label': `Scroll ${label} back` },
    icon(ICONS.back),
  );
  const next = h(
    'button',
    { class: 'scroll-row__button', type: 'button', 'aria-label': `Scroll ${label} on` },
    icon(ICONS.forward),
  );
  // Pointer-only helpers: keyboard and gamepad players scroll by moving focus.
  previous.tabIndex = -1;
  next.tabIndex = -1;
  const buttons = h(
    'div',
    { class: 'scroll-row__buttons', hidden: true, 'data-pointer-only': '' },
    previous,
    next,
  );

  const behavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');

  const refresh = watchEdges(element, (atStart, atEnd) => {
    buttons.hidden = atStart && atEnd;
    previous.disabled = atStart;
    next.disabled = atEnd;
  });

  const page = (direction: 1 | -1) => {
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: behavior() });
  };
  previous.addEventListener('click', () => page(-1));
  next.addEventListener('click', () => page(1));

  const row: ScrollRow = {
    element,
    list,
    buttons,
    reveal(item) {
      const left = item.offsetLeft - list.offsetLeft;
      const right = left + item.offsetWidth;
      const view = element.scrollLeft;
      let target = view;
      if (left - EDGE_ROOM < view) target = left - EDGE_ROOM;
      else if (right + EDGE_ROOM > view + element.clientWidth) {
        target = right + EDGE_ROOM - element.clientWidth;
      }
      if (target !== view) element.scrollTo({ left: Math.max(0, target), behavior: behavior() });
    },
    refresh,
  };
  rows.set(element, row);
  return row;
}
