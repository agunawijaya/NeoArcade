import { h, icon } from './dom';
import { ICONS } from './icons';

export interface TitleHandlers {
  play(): void;
  settings(): void;
}

export const CREDIT = 'Inspired by QBasic Gorillas, © Microsoft Corporation 1990.';

export function buildTitleScreen(handlers: TitleHandlers, howToPlayHref: string): HTMLElement {
  const play = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Play',
  );
  play.addEventListener('click', handlers.play);
  const settings = h('button', { class: 'button', type: 'button' }, 'Match settings');
  settings.addEventListener('click', handlers.settings);

  return h(
    'section',
    { class: 'screen screen--title', 'aria-labelledby': 'title-logo' },
    h(
      'div',
      { class: 'title' },
      h(
        'h1',
        { class: 'title__logo', id: 'title-logo' },
        h('span', { class: 'title__skyline' }, 'Skyline'),
        h('span', { class: 'title__showdown' }, 'Showdown'),
      ),
      h('p', { class: 'title__credit' }, CREDIT),
      h('p', { class: 'title__tagline' }, 'Two gorillas. One city at dusk. A lot of bananas.'),
      h(
        'nav',
        { class: 'title__menu', 'aria-label': 'Main menu' },
        play,
        settings,
        h('a', { class: 'button button--quiet', href: howToPlayHref }, 'How to play'),
      ),
    ),
  );
}
