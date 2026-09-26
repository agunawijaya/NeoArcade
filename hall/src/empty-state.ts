import { bootCover } from './boot-cover';
import { playCover } from './cover-player';
import { h } from './dom';

const WAITING_SCREENS = [
  { title: 'Coming Soon', accent: '#ff3fa4' },
  { title: 'Warming Up', accent: '#3ff3ff' },
  { title: 'Reserved', accent: '#ffb347' },
];

/** What the Hall shows before any game is registered: screens running their self-test. */
export function buildEmptyState(): HTMLElement {
  const screens = WAITING_SCREENS.map(({ title, accent }, index) => {
    const canvas = h('canvas', { class: 'screens__cover' });
    playCover(canvas, bootCover, { seed: index + 1, accent, title }).setAlive(true);
    return h(
      'li',
      { class: 'empty__screen', style: `--accent: ${accent}; --delay: ${index * 0.9}s` },
      h('div', { class: 'screens' }, canvas),
    );
  });

  return h(
    'section',
    { class: 'empty', 'aria-labelledby': 'empty-heading' },
    h('ul', { class: 'empty__screens', 'aria-hidden': 'true' }, ...screens),
    h(
      'div',
      { class: 'empty__message' },
      h(
        'h2',
        { id: 'empty-heading', class: 'empty__heading' },
        'The first games are on their way…',
      ),
      h(
        'p',
        { class: 'empty__text' },
        'Nothing is ready to play yet. Every classic rebuilt for NeoArcade ' +
          'shows up here the day it is finished — check back soon.',
      ),
    ),
  );
}
