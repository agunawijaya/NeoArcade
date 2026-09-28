import type { Theme } from '../render/palette';
import type { ModeId } from '../settings';
import { button, h, icon } from './dom';
import { ICONS } from './icons';

export const CREDIT = 'Inspired by DONKEY.BAS, © IBM Corp. 1981, 1982.';

export interface TitleHandlers {
  play(mode: ModeId): void;
  garage(): void;
  settings(): void;
  toggleTheme(): void;
}

export interface ModeCardText {
  status: string;
  /** A small badge in the corner, such as "New today". */
  flag?: string;
}

interface ModeInfo {
  title: string;
  line: string;
  art: 'trip' | 'endless' | 'daily' | 'classic' | 'versus';
}

const MODES: Record<ModeId, ModeInfo> = {
  trip: {
    title: 'Road Trip',
    line: 'Five routes, fifteen legs, one stubborn herd at the end of each.',
    art: 'trip',
  },
  endless: {
    title: 'Endless',
    line: 'Faster and faster. Three lives. How far can you go?',
    art: 'endless',
  },
  daily: {
    title: 'Daily Road',
    line: 'The same road for everyone today. One scored run.',
    art: 'daily',
  },
  classic: {
    title: 'Classic Duel',
    line: 'Donkey versus Driver, the way it was in 1981.',
    art: 'classic',
  },
  versus: {
    title: 'Donkey vs Driver',
    line: 'Two players: one drives, one is the donkey.',
    art: 'versus',
  },
};

export interface TitleScreen {
  element: HTMLElement;
  showTheme(theme: Theme): void;
  setStatus(mode: ModeId, text: ModeCardText): void;
  /** Plays the 1981 box unfolding into the logo, unless motion is reduced. */
  intro(reducedMotion: boolean): void;
  focusFirst(): void;
}

export function buildTitleScreen(handlers: TitleHandlers, howToPlayHref: string): TitleScreen {
  const statuses = new Map<ModeId, HTMLElement>();
  const flags = new Map<ModeId, HTMLElement>();
  const cards = (Object.keys(MODES) as ModeId[]).map((mode) => {
    const info = MODES[mode];
    const status = h('span', { class: 'mode-card__status' });
    const flag = h('span', { class: 'mode-card__flag', hidden: true });
    statuses.set(mode, status);
    flags.set(mode, flag);
    return button(
      h(
        'span',
        { class: 'mode-card__text' },
        h('strong', { class: 'mode-card__title' }, info.title),
        h('span', { class: 'mode-card__line' }, info.line),
        status,
      ),
      () => handlers.play(mode),
      `mode-card mode-card--${info.art}`,
      { 'data-mode': mode },
      h('span', { class: 'mode-card__art', 'aria-hidden': 'true' }),
      flag,
    );
  });

  const themeButton = button('', handlers.toggleTheme, 'title__theme');
  const intro = h(
    'div',
    { class: 'intro', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'intro__box' },
      h('span', { class: 'intro__word' }, 'DONKEY'),
      h('span', { class: 'intro__cursor' }, '_'),
    ),
  );

  const element = h(
    'section',
    { class: 'screen screen--title', 'aria-labelledby': 'title-logo' },
    intro,
    h(
      'div',
      { class: 'title' },
      h(
        'header',
        { class: 'title__head' },
        h(
          'h1',
          { class: 'logo', id: 'title-logo' },
          h('span', { class: 'logo__box', 'aria-hidden': 'true' }),
          h('span', { class: 'logo__donkey' }, 'Donkey'),
          h('span', { class: 'logo__dash' }, 'Dash'),
        ),
        h('p', { class: 'title__tagline' }, 'One button. Two lanes. A great many donkeys.'),
      ),
      h('nav', { class: 'modes', 'aria-label': 'Modes' }, ...cards),
      h(
        'div',
        { class: 'title__actions' },
        button('Garage', handlers.garage, 'button button--quiet', {}, icon(ICONS.wrench)),
        button('Settings', handlers.settings, 'button button--quiet', {}, icon(ICONS.gear)),
        h('a', { class: 'button button--quiet', href: howToPlayHref }, 'How to play'),
      ),
      h('p', { class: 'title__credit' }, CREDIT),
    ),
    themeButton,
  );

  let introTimer: ReturnType<typeof setTimeout> | undefined;
  const skipIntro = () => {
    clearTimeout(introTimer);
    element.classList.remove('is-intro');
    element.classList.add('is-ready');
    window.removeEventListener('keydown', skipIntro);
    element.removeEventListener('pointerdown', skipIntro);
  };

  return {
    element,
    showTheme(theme) {
      const next = theme === 'light' ? 'dark' : 'light';
      themeButton.replaceChildren(icon(next === 'light' ? ICONS.sun : ICONS.moon));
      themeButton.setAttribute('aria-label', `Switch to the ${next} theme`);
      themeButton.title = next === 'light' ? 'Daylight' : 'Golden hour';
    },
    setStatus(mode, text) {
      const status = statuses.get(mode);
      if (status) status.textContent = text.status;
      const flag = flags.get(mode);
      if (flag) {
        flag.textContent = text.flag ?? '';
        flag.hidden = !text.flag;
      }
    },
    intro(reducedMotion) {
      if (reducedMotion) {
        skipIntro();
        return;
      }
      element.classList.add('is-intro');
      introTimer = setTimeout(skipIntro, 2300);
      window.addEventListener('keydown', skipIntro, { once: true });
      element.addEventListener('pointerdown', skipIntro, { once: true });
    },
    focusFirst() {
      element.querySelector<HTMLElement>('.mode-card')?.focus();
    },
  };
}
