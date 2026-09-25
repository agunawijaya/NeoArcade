import { bootCover } from './boot-cover';
import { buildMachine } from './cabinet';
import { playCover } from './cover-player';
import { h } from './dom';

const DORMANT_CABINETS = [
  { title: 'Coming Soon', accent: '#ff3fa4' },
  { title: 'Warming Up', accent: '#3ff3ff' },
  { title: 'Reserved', accent: '#ffb347' },
];

/** What the Hall shows before any game is registered: machines running their self-test. */
export function buildEmptyState(): HTMLElement {
  const cabinets = DORMANT_CABINETS.map(({ title, accent }, index) => {
    const canvas = h('canvas', { class: 'cabinet__canvas' });
    const cabinet = h(
      'div',
      { class: 'cabinet cabinet--dormant', style: `--accent: ${accent}; --delay: ${index * 0.9}s` },
      buildMachine(title, canvas),
    );
    playCover(canvas, bootCover, { seed: index + 1, accent, title }).setAlive(true);
    return h('li', { class: 'cabinet-slot' }, cabinet);
  });

  return h(
    'section',
    { class: 'empty', 'aria-labelledby': 'empty-heading' },
    h('ul', { class: 'grid grid--dormant', 'aria-hidden': 'true' }, ...cabinets),
    h(
      'div',
      { class: 'empty__message' },
      h('h2', { id: 'empty-heading', class: 'empty__heading' }, 'The machines are warming up…'),
      h(
        'p',
        { class: 'empty__text' },
        'No games are plugged in yet. Every classic that gets rebuilt for NeoArcade ' +
          'rolls in here as its own cabinet — check back soon.',
      ),
    ),
  );
}
