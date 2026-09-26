import type { Theme } from '../render/palette';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface TitleHandlers {
  play(): void;
  settings(): void;
  toggleTheme(): void;
}

export interface TitleScreen {
  element: HTMLElement;
  /** Shows the theme the button would switch to. */
  showTheme(theme: Theme): void;
}

export const CREDIT = 'Inspired by QBasic Gorillas, © Microsoft Corporation 1990.';

export function buildTitleScreen(handlers: TitleHandlers, howToPlayHref: string): TitleScreen {
  const play = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Play',
  );
  play.addEventListener('click', handlers.play);
  const settings = h('button', { class: 'button', type: 'button' }, 'Match settings');
  settings.addEventListener('click', handlers.settings);
  const themeButton = h('button', { class: 'title__theme', type: 'button' });
  themeButton.addEventListener('click', handlers.toggleTheme);

  const element = h(
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
      h('p', { class: 'title__tagline' }, 'Two gorillas. One skyline. A lot of bananas.'),
      h(
        'nav',
        { class: 'title__menu', 'aria-label': 'Main menu' },
        play,
        settings,
        h('a', { class: 'button button--quiet', href: howToPlayHref }, 'How to play'),
      ),
    ),
    // Last in the markup so Play, not the theme, gets the first focus.
    themeButton,
  );

  return {
    element,
    showTheme(theme) {
      const next = theme === 'light' ? 'dark' : 'light';
      themeButton.replaceChildren(icon(next === 'light' ? ICONS.sun : ICONS.moon));
      themeButton.setAttribute('aria-label', `Switch to the ${next} theme`);
      themeButton.title = `${next === 'light' ? 'Light' : 'Dark'} theme`;
    },
  };
}
