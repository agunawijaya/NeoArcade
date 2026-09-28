import type { Theme } from '../render/palette';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface TitleHandlers {
  tour(): void;
  quickMatch(): void;
  wardrobe(): void;
  badges(): void;
  settings(): void;
  toggleTheme(): void;
}

export interface TitleScreen {
  element: HTMLElement;
  /** Shows the theme the button would switch to. */
  showTheme(theme: Theme): void;
  /** Stars collected on the World Tour, shown on its button. */
  showProgress(stars: number, maxStars: number): void;
}

export const CREDIT = 'Inspired by QBasic Gorillas, © Microsoft Corporation 1990.';

/** The main menu over the title city: the World Tour first, everything else a step away. */
export function buildTitleScreen(
  handlers: TitleHandlers,
  links: { howToPlay: string; hall: string },
): TitleScreen {
  const button = (label: string, action: () => void, extra = '') => {
    const element = h('button', { class: `button ${extra}`.trim(), type: 'button' }, label);
    element.addEventListener('click', action);
    return element;
  };

  const tourStars = h('span', { class: 'title__stars' });
  const tour = h(
    'button',
    { class: 'button button--primary title__tour', type: 'button' },
    icon(ICONS.globe),
    h('span', {}, 'World Tour'),
    tourStars,
  );
  tour.addEventListener('click', handlers.tour);
  const quickMatch = h(
    'button',
    { class: 'button', type: 'button' },
    icon(ICONS.play),
    'Quick Match',
  );
  quickMatch.addEventListener('click', handlers.quickMatch);
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
        tour,
        quickMatch,
        button('Wardrobe', handlers.wardrobe),
        button('Badges', handlers.badges),
        button('Settings', handlers.settings),
        h('a', { class: 'button button--quiet', href: links.howToPlay }, 'How to play'),
        h('a', { class: 'button button--quiet', href: links.hall }, 'Back to Hall'),
      ),
    ),
    // Last in the markup so World Tour, not the theme, gets the first focus.
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
    showProgress(stars, maxStars) {
      tourStars.textContent = `★ ${stars}/${maxStars}`;
      tourStars.setAttribute('aria-label', `${stars} of ${maxStars} stars`);
    },
  };
}
