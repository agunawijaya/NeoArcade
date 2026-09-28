import type { BadgeTally } from '@shared/pass';
import { h, icon } from './dom';
import { ICONS } from './icons';

/** "7 / 24 badges" with a small medal, hidden until the game has been played. */
export function badgeCount() {
  const count = h('span', { class: 'badge-count__count' });
  const element = h('span', { class: 'badge-count', hidden: true }, icon(ICONS.medal), count);
  return {
    element,
    set(tally: BadgeTally | null) {
      element.hidden = tally === null;
      if (tally) count.textContent = `${tally.unlocked} / ${tally.total} badges`;
    },
  };
}
