import { isVisible } from './dom';
import { nearestInDirection, type Direction } from './spatial-nav';

/**
 * Lists of games are single tab stops: Tab enters a row or a grid on one
 * item, and the arrow keys (or a gamepad) move within it. These helpers keep
 * exactly one item per group in the tab order.
 */
export const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const ITEM = '[data-row-item]';

export function itemsOf(group: Element): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>(ITEM)].filter(isVisible);
}

/** Makes the item its group's tab stop. */
export function makeTabStop(item: HTMLElement): void {
  const group = item.closest('[data-row], [data-grid]');
  if (!group) return;
  for (const other of group.querySelectorAll<HTMLElement>(ITEM)) {
    other.tabIndex = other === item ? 0 : -1;
  }
}

/** The card in a grid that lies in the direction of travel, by where the cards are drawn. */
export function stepInGrid(
  grid: Element,
  from: HTMLElement,
  direction: Direction,
): HTMLElement | null {
  const boxes = itemsOf(grid).map((element) => ({ element, ...boxOf(element) }));
  return nearestInDirection(boxOf(from), boxes, direction)?.element ?? null;
}

export function boxOf(element: Element) {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}
